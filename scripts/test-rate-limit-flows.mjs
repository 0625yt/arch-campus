// Real authenticated HTTP/DB limits. Invalid payloads stop before all AI calls.
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const base = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3010");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, serverKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const fixtures = [];
let checks = 0;
function check(label, condition) {
  assert.ok(condition, label);
  checks++;
  process.stdout.write(`PASS ${label}\n`);
}
async function createFixture() {
  const email = `arch-limit-${randomUUID()}@example.invalid`;
  const password = randomBytes(24).toString("base64url");
  const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error) throw made.error;
  const fixture = {
    id: made.data.user.id,
    hash: createHmac("sha256", serverKey)
      .update(`arch-campus:rate-limit:${made.data.user.id}`)
      .digest("hex"),
    cookie: "",
  };
  fixtures.push(fixture);
  const jar = new Map();
  const client = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [...jar.values()],
      setAll: (items) => {
        for (const item of items) jar.set(item.name, item);
      },
    },
  });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  fixture.cookie = [...jar.values()].map(({ name, value }) => `${name}=${value}`).join("; ");
  return fixture;
}
async function request(cookie) {
  const response = await fetch(new URL("/api/materials/finalize", base), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(30_000),
  });
  return { status: response.status, headers: response.headers, body: await response.json() };
}
try {
  // Warm the dev route before sending the concurrency fixture.
  await fetch(new URL("/api/materials/finalize", base), { signal: AbortSignal.timeout(30_000) });
  const fixture = await createFixture();
  const started = Date.now();
  const replies = await Promise.all(Array.from({ length: 20 }, () => request(fixture.cookie)));
  check("concurrent batch completes inside one sliding window", Date.now() - started < 60_000);
  check(
    "exactly 6 authenticated requests reach payload validation",
    replies.filter((r) => r.status === 400).length === 6,
  );
  const blocked = replies.filter((r) => r.status === 429);
  check(
    "14 excess requests are blocked before work starts",
    blocked.length === 14 && blocked.every((r) => r.body.kind === "ai"),
  );
  check(
    "blocked requests include quota and retry headers",
    blocked.every(
      (r) =>
        r.headers.get("X-RateLimit-Limit") === "6" &&
        r.headers.get("X-RateLimit-Remaining") === "0" &&
        Number(r.headers.get("Retry-After")) >= 1,
    ),
  );
  const bucket = await admin
    .from("rate_limit_buckets")
    .select("hits")
    .eq("kind", "ai")
    .eq("identifier_hash", fixture.hash)
    .single();
  if (bucket.error) throw bucket.error;
  check("all HTTP connections share one six-hit database bucket", bucket.data.hits.length === 6);

  const other = await createFixture();
  check(
    "a different authenticated owner has an independent quota",
    (await request(other.cookie)).status === 400,
  );
  for (const owner of fixtures) {
    for (const table of ["generations", "materials", "jobs"]) {
      const counted = await admin
        .from(table)
        .select("id", { head: true, count: "exact" })
        .eq("owner_id", owner.id);
      if (counted.error) throw counted.error;
      assert.equal(counted.count, 0);
    }
  }
  check("invalid payloads create no generations, materials or jobs", true);
  process.stdout.write(`${checks} rate limit API checks passed; AI calls: 0.\n`);
} catch (error) {
  process.stderr.write(
    `FAIL rate limit API verification (${error instanceof assert.AssertionError ? error.message : (error.code ?? error.name)})\n`,
  );
  process.exitCode = 1;
} finally {
  for (const fixture of fixtures) {
    const bucket = await admin
      .from("rate_limit_buckets")
      .delete()
      .eq("identifier_hash", fixture.hash);
    const user = await admin.auth.admin.deleteUser(fixture.id);
    if (bucket.error || user.error) {
      process.stderr.write("FAIL temporary rate limit account or bucket cleanup\n");
      process.exitCode = 1;
    } else process.stdout.write("CLEAN temporary account, reservations and buckets removed\n");
  }
}
