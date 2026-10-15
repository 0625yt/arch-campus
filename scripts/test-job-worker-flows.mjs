// Operator-scoped fixtures only; never call the global worker in a live test.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";

const base = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3010");
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const secret = process.env.JOB_WORKER_SECRET;
assert.ok(secret?.length >= 32, "worker secret required");
const owners = [];
let checks = 0;
function check(label, value) {
  assert.ok(value, label);
  checks++;
  process.stdout.write(`PASS ${label}\n`);
}
async function call(ownerId, token = secret) {
  return fetch(new URL("/api/internal/material-jobs/recover", base), {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ ownerId }),
    signal: AbortSignal.timeout(20000),
  });
}
async function fixture(ownerId, retry = 0) {
  const m = await admin
    .from("materials")
    .insert({
      owner_id: ownerId,
      title: "temporary interrupted worker source",
      type: "lecture",
      full_text: "",
    })
    .select("id")
    .single();
  if (m.error) throw m.error;
  const j = await admin
    .from("jobs")
    .insert({
      owner_id: ownerId,
      material_id: m.data.id,
      tool: "summarize",
      status: "running",
      retry_count: retry,
      started_at: "2020-01-01T00:00:00Z",
    })
    .select("id")
    .single();
  if (j.error) throw j.error;
  return j.data.id;
}
async function state(id, ownerId) {
  const r = await admin
    .from("jobs")
    .select("status,retry_count,error_message,checkpoint_history")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .single();
  if (r.error) throw r.error;
  return r.data;
}
try {
  for (let i = 0; i < 2; i++) {
    const u = await admin.auth.admin.createUser({
      email: `arch-worker-${randomUUID()}@example.invalid`,
      email_confirm: true,
    });
    if (u.error) throw u.error;
    owners.push(u.data.user.id);
  }
  const [owner, other] = owners;
  const job = await fixture(owner),
    foreign = await fixture(other);
  check("anonymous worker requests are denied", (await call(owner, "")).status === 401);
  check(
    "wrong tokens do not claim work",
    (await call(owner, "wrong")).status === 401 && (await state(job, owner)).retry_count === 0,
  );
  const health = await fetch(new URL("/api/internal/material-jobs/recover", base), {
    headers: { authorization: `Bearer ${secret}` },
  });
  check(
    "authenticated readiness does not claim jobs",
    health.status === 200 && (await state(job, owner)).retry_count === 0,
  );
  const responses = await Promise.all(Array.from({ length: 10 }, () => call(owner)));
  for (const r of responses) assert.equal(r.status, 200);
  const data = await Promise.all(responses.map((r) => r.json()));
  check(
    "10 HTTP ticks resume the interrupted job once",
    data.reduce((n, r) => n + r.resumed, 0) === 1,
  );
  check(
    "responses contain no private job data",
    data.every((r) => Object.keys(r).sort().join(",") === "closed,ok,resumed"),
  );
  let saved;
  for (let i = 0; i < 40; i++) {
    saved = await state(job, owner);
    if (saved.status === "error") break;
    await delay(500);
  }
  check(
    "server worker rebuilds saved input without browser polling",
    saved.status === "error" &&
      saved.retry_count === 1 &&
      saved.error_message.includes("본문이 비어"),
  );
  check(
    "recovery stages are persisted",
    saved.checkpoint_history.some((s) => s.stage === "rebuilding-input"),
  );
  check(
    "operator scope leaves another owner unchanged",
    (await state(foreign, other)).retry_count === 0,
  );
  const interruptedRetry = await fixture(owner, 1);
  const closed = await (await call(owner)).json();
  check(
    "second interrupted attempt closes without AI",
    closed.closed === 1 &&
      closed.resumed === 0 &&
      (await state(interruptedRetry, owner)).status === "error",
  );
  for (const table of ["generations", "ai_budget_reservations"]) {
    const r = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("owner_id", owner);
    if (r.error) throw r.error;
    assert.equal(r.count, 0);
  }
  check("invalid source and terminal retries create no AI costs", true);
  process.stdout.write(`${checks} worker HTTP checks passed; AI calls: 0.\n`);
} catch (e) {
  process.stderr.write(
    `FAIL worker HTTP (${e instanceof assert.AssertionError ? e.message : (e.code ?? e.name)})\n`,
  );
  process.exitCode = 1;
} finally {
  for (const id of owners) {
    const r = await admin.auth.admin.deleteUser(id);
    if (r.error) {
      process.stderr.write("FAIL temporary worker account cleanup\n");
      process.exitCode = 1;
    }
  }
  process.stdout.write("CLEAN worker accounts and fixtures removed\n");
}
