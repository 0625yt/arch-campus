// Dedicated confirmed test users; no confirmation emails. Every owned row is removed in finally.
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { requiresMfa } from "../src/lib/mfa.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const created = [];
let passed = 0;
function check(label, condition) {
  assert.ok(condition, label);
  passed++;
  process.stdout.write(`PASS ${label}\n`);
}
function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.toUpperCase().replace(/=+$/, "")]
    .map((c) => alphabet.indexOf(c).toString(2).padStart(5, "0"))
    .join("");
  const bytes = Buffer.from(bits.match(/.{8}/g).map((b) => Number.parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", bytes).update(counter).digest();
  const offset = hash[19] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
}
try {
  const clients = [];
  for (let i = 0; i < 2; i++) {
    const email = `arch-security-${randomUUID()}@example.invalid`,
      password = randomBytes(24).toString("base64url");
    const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (result.error) throw result.error;
    created.push(result.data.user.id);
    const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
    const signed = await client.auth.signInWithPassword({ email, password });
    if (signed.error) throw signed.error;
    clients.push(client);
    check(`test account ${i + 1} password login`, Boolean(signed.data.session));
  }
  const [a, b] = clients;
  for (const [table, data] of [
    ["courses", { name: "Security fixture" }],
    ["materials", { title: "Security fixture", type: "lecture" }],
    ["events", { title: "Security fixture", kind: "etc", starts_at: new Date().toISOString() }],
    [
      "quizzes",
      {
        title: "Security fixture",
        question_count: 1,
        questions: [],
        watermark: "fixture",
        model_id: "fixture",
      },
    ],
  ]) {
    const inserted = await a
      .from(table)
      .insert({ owner_id: created[0], ...data })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;
    check(`${table}: owner create`, Boolean(inserted.data.id));
    const other = await b.from(table).select("id").eq("id", inserted.data.id);
    check(`${table}: cross-user read denied`, !other.error && other.data.length === 0);
    const removed = await b.from(table).delete().eq("id", inserted.data.id).select("id");
    check(`${table}: cross-user delete denied`, !removed.error && removed.data.length === 0);
    const forged = await b.from(table).insert({ owner_id: created[0], ...data });
    check(`${table}: forged owner denied`, Boolean(forged.error));
  }
  const initial = (await a.auth.getSession()).data.session;
  const enrolled = await a.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "temporary security test",
  });
  if (enrolled.error) throw enrolled.error;
  const verified = await a.auth.mfa.challengeAndVerify({
    factorId: enrolled.data.id,
    code: totp(enrolled.data.totp.secret),
  });
  if (verified.error) throw verified.error;
  check("TOTP challenge and verify", Boolean(verified.data.access_token));
  const current = await a.auth.getUser();
  check("AAL2 account allowed", !(await requiresMfa(a, current.data.user)));
  const stale = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    ...options,
    global: { headers: { Authorization: `Bearer ${initial.access_token}` } },
  });
  // Set the original AAL1 session in a separate client without refreshing it.
  await stale.auth.setSession({
    access_token: initial.access_token,
    refresh_token: initial.refresh_token,
  });
  const old = await stale.auth.getUser();
  check(
    "old AAL1 session requires challenge",
    Boolean(old.data.user) && (await requiresMfa(stale, old.data.user)),
  );
  const signedOut = await a.auth.signOut({ scope: "global" });
  check("global signout request", !signedOut.error);
  process.stdout.write(`${passed} live authentication/ownership checks passed.\n`);
} catch (error) {
  process.stderr.write(
    `FAIL live auth: ${error instanceof assert.AssertionError ? error.message : (error.code ?? error.name)}\n`,
  );
  process.exitCode = 1;
} finally {
  for (const id of created) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      process.stderr.write("FAIL test account cleanup\n");
      process.exitCode = 1;
    } else process.stdout.write("CLEAN temporary test account removed\n");
  }
}
