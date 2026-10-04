// Disposable Cron -> HTTPS -> saved input test; never installs a global production schedule.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const base = new URL(process.env.E2E_BASE_URL);
assert.equal(base.protocol, "https:");
assert.ok(
  base.hostname.startsWith("arch-campus-") &&
    base.hostname.endsWith("-0625yts-projects.vercel.app"),
  "owned Preview URL required",
);
const secret = process.env.JOB_WORKER_SECRET;
assert.ok(secret?.length >= 32);
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const db = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  connectionTimeoutMillis: 15000,
});
const schema = `arch_worker_schedule_${randomBytes(6).toString("hex")}`;
const name = `${schema}_tick`,
  keyName = `${schema}_secret`,
  urlName = `${schema}_url`;
const live = process.argv.includes("--live");
let owner,
  cronId,
  createdSchema = false;
const vaultIds = [];
let checks = 0;
function check(label, value) {
  assert.ok(value, label);
  checks++;
  process.stdout.write(`PASS ${label}\n`);
}
await db.connect();
try {
  const ready = await fetch(new URL("/api/internal/material-jobs/recover", base), {
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(10000),
  });
  check("deployed worker is ready", ready.status === 200);
  const u = await admin.auth.admin.createUser({
    email: `arch-worker-schedule-${randomUUID()}@example.invalid`,
    email_confirm: true,
  });
  if (u.error) throw u.error;
  owner = u.data.user.id;
  const text = live
    ? "=== Page 1 ===\n원본 접수\n문서 식별자는 각 원본을 구분하기 위해 기록한다. 접수 기록에는 접수일과 담당자를 함께 적는다. 검토 담당자는 접수 담당자와 다른 사람이어야 한다. 정정은 원본을 지우지 않고 새 행과 연결해서 남긴다. 증빙이 없는 항목은 확인 필요로 표시한다. 보관 기간이 끝나도 미결 항목이 있으면 담당자가 확인한 뒤 처리한다."
    : "";
  const m = await admin
    .from("materials")
    .insert({
      owner_id: owner,
      title: "temporary scheduled recovery source",
      type: "lecture",
      full_text: text,
    })
    .select("id")
    .single();
  if (m.error) throw m.error;
  const j = await admin
    .from("jobs")
    .insert({
      owner_id: owner,
      material_id: m.data.id,
      tool: "summarize",
      status: "running",
      retry_count: 0,
      started_at: "2020-01-01T00:00:00Z",
      input_params: { styles: [] },
    })
    .select("id")
    .single();
  if (j.error) throw j.error;
  await db.query(`create schema ${schema}`);
  createdSchema = true;
  await db.query(`create table ${schema}.requests(request_id bigint)`);
  for (const [key, value] of [
    [keyName, secret],
    [urlName, new URL("/api/internal/material-jobs/recover", base).href],
  ]) {
    const r = await db.query("select vault.create_secret($1,$2) as id", [value, key]);
    vaultIds.push(r.rows[0].id);
  }
  const command = `insert into ${schema}.requests select net.http_post(url:=(select decrypted_secret from vault.decrypted_secrets where name='${urlName}'),headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='${keyName}')),body:=jsonb_build_object('ownerId','${owner}'),timeout_milliseconds:=15000);`;
  const scheduled = await db.query("select cron.schedule($1,$2,$3) as id", [
    name,
    "10 seconds",
    command,
  ]);
  cronId = scheduled.rows[0].id;
  let saved;
  for (let i = 0; i < 120; i++) {
    const r = await admin
      .from("jobs")
      .select("status,retry_count,error_message,result,checkpoint_history,cost_usd")
      .eq("id", j.data.id)
      .eq("owner_id", owner)
      .single();
    if (r.error) throw r.error;
    saved = r.data;
    if (["done", "error"].includes(saved.status)) break;
    await delay(1000);
  }
  check(
    "Cron dispatch resumes persisted work without any browser request",
    saved.retry_count === 1 && saved.status === (live ? "done" : "error"),
  );
  check(
    "recovery history survives the original server lifetime",
    saved.checkpoint_history.some((s) => s.stage === "retry-queued") &&
      saved.checkpoint_history.some((s) => s.stage === "rebuilding-input"),
  );
  const responses = await db.query(
    `select status_code,content from net._http_response where id in(select request_id from ${schema}.requests)`,
  );
  check(
    "database HTTP dispatch reaches the authenticated worker",
    responses.rows.some((r) => r.status_code === 200 && JSON.parse(r.content).resumed === 1),
  );
  const g = await admin.from("generations").select("tool,cost_usd").eq("owner_id", owner);
  if (g.error) throw g.error;
  if (live) {
    const cached = await admin
      .from("materials")
      .select("summary_payload")
      .eq("id", m.data.id)
      .eq("owner_id", owner)
      .single();
    if (cached.error) throw cached.error;
    check(
      "scheduled AI result and job commit together",
      JSON.stringify(cached.data.summary_payload) === JSON.stringify(saved.result.summary) &&
        g.data.filter((r) => r.tool === "summarize").length === 1,
    );
    process.stdout.write(
      `Recorded estimated scheduled AI cost $${g.data.reduce((n, r) => n + Number(r.cost_usd), 0).toFixed(6)} (includes classification; not provider billing).\n`,
    );
  } else
    check(
      "empty saved input creates no AI calls",
      g.data.length === 0 && saved.error_message.includes("본문이 비어"),
    );
  process.stdout.write(`${checks} scheduled worker checks passed.\n`);
} catch (e) {
  process.stderr.write(
    `FAIL scheduled worker (${e instanceof assert.AssertionError ? e.message : (e.code ?? e.name)})\n`,
  );
  process.exitCode = 1;
} finally {
  let cleanupFailed = false;
  async function clean(run, label) {
    try {
      await run();
    } catch {
      cleanupFailed = true;
      process.stderr.write(`FAIL scheduled cleanup: ${label}\n`);
      process.exitCode = 1;
    }
  }
  if (cronId) {
    await clean(() => db.query("select cron.unschedule($1::bigint)", [cronId]), "cron");
    await delay(1000);
    await clean(
      () => db.query("delete from cron.job_run_details where jobid=$1", [cronId]),
      "cron history",
    );
  }
  if (createdSchema) {
    await clean(
      () =>
        db.query(
          `delete from net._http_response where id in(select request_id from ${schema}.requests)`,
        ),
      "responses",
    );
    await clean(
      () =>
        db.query(
          `delete from net.http_request_queue where id in(select request_id from ${schema}.requests)`,
        ),
      "queued requests",
    );
    await clean(() => db.query(`drop schema ${schema} cascade`), "schema");
  }
  for (const id of vaultIds)
    await clean(() => db.query("delete from vault.secrets where id=$1", [id]), "Vault entries");
  if (owner) {
    const r = await admin.auth.admin.deleteUser(owner);
    if (r.error) {
      cleanupFailed = true;
      process.stderr.write("FAIL scheduled worker fixture cleanup\n");
      process.exitCode = 1;
    }
  }
  await db.end();
  if (!cleanupFailed)
    process.stdout.write(
      "CLEAN disposable schedule, requests, Vault entries and account removed\n",
    );
}
