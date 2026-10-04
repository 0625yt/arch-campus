// Isolated copy of the jobs table: global selection never touches real users' jobs.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  max: 6,
  connectionTimeoutMillis: 15000,
});
const schema = `arch_worker_${randomBytes(6).toString("hex")}`;
const owner = randomUUID(),
  other = randomUUID(),
  jobId = randomUUID();
let checks = 0;
function check(label, value) {
  assert.ok(value, label);
  checks++;
  process.stdout.write(`PASS ${label}\n`);
}
async function claim(ownerId = null, role = "service_role") {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local statement_timeout='10s'");
    await c.query(`set local role ${role}`);
    const r = await c.query(`select * from ${schema}.claim_stale_material_job_for_worker($1)`, [
      ownerId,
    ]);
    await c.query("commit");
    return r.rows;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
try {
  await pool.query(`create schema ${schema}`);
  await pool.query(`grant usage on schema ${schema} to service_role, anon, authenticated`);
  await pool.query(`create table ${schema}.jobs (like public.jobs including all)`);
  const sql = await readFile(
    new URL("../supabase/migrations/0041_material_job_worker.sql", import.meta.url),
    "utf8",
  );
  await pool.query(sql.slice(sql.indexOf("create function")).replaceAll("public.", `${schema}.`));
  await pool.query(
    `create trigger worker_checkpoints before insert or update of status,retry_count on ${schema}.jobs for each row execute function public.sync_job_status_checkpoint()`,
  );
  await pool.query(
    `insert into ${schema}.jobs(id,owner_id,tool,status,created_at,started_at) values($1,$2,'summarize','running','2020-01-01','2020-01-01')`,
    [jobId, owner],
  );
  for (const [status, tool] of [
    ["done", "quiz"],
    ["cancelled", "quiz"],
    ["running", "presentation"],
  ])
    await pool.query(
      `insert into ${schema}.jobs(owner_id,tool,status,created_at,started_at) values($1,$2,$3,'2020-01-01','2020-01-01')`,
      [owner, tool, status],
    );
  check("operator owner scope does not claim another owner", (await claim(other)).length === 0);
  const lock = await pool.connect();
  await lock.query("begin");
  await lock.query(`select id from ${schema}.jobs where id=$1 for update`, [jobId]);
  try {
    check("a locked job is skipped without waiting", (await claim()).length === 0);
  } finally {
    await lock.query("rollback");
    lock.release();
  }
  const results = await Promise.all(Array.from({ length: 20 }, () => claim()));
  const accepted = results.flat();
  check(
    "20 independent concurrent claims select exactly one job",
    accepted.length === 1 && accepted[0].id === jobId,
  );
  check("claim preserves the database owner", accepted[0].owner_id === owner);
  check(
    "interrupted initial execution becomes pending attempt one",
    accepted[0].status === "pending" && accepted[0].retry_count === 1,
  );
  check("claim persists retry checkpoint history", accepted[0].checkpoint_stage === "retry-queued");
  check("freshly claimed work is not billed or claimed again", (await claim()).length === 0);
  check("terminal and unsupported tools are ignored", (await claim(owner)).length === 0);
  await pool.query(
    `update ${schema}.jobs set status='running',started_at='2020-01-01' where id=$1`,
    [jobId],
  );
  const closed = await claim(owner);
  check(
    "another interrupted attempt is closed instead of retried",
    closed[0]?.status === "error" && closed[0]?.retry_count === 1,
  );
  check(
    "terminal failure has a useful message and timestamp",
    Boolean(closed[0]?.error_message && closed[0]?.finished_at),
  );
  check("closed jobs are never claimed again", (await claim()).length === 0);
  const otherJob = randomUUID();
  await pool.query(
    `insert into ${schema}.jobs(id,owner_id,tool,status,created_at) values($1,$2,'quiz','pending','2020-01-01')`,
    [otherJob, other],
  );
  check("owner-scoped tick leaves another user pending", (await claim(owner)).length === 0);
  const global = await claim();
  check(
    "global tick recovers another owner without a session",
    global[0]?.id === otherJob && global[0]?.owner_id === other,
  );
  for (const role of ["anon", "authenticated"]) {
    let denied = false;
    try {
      await claim(null, role);
    } catch (e) {
      denied = e.code === "42501";
    }
    check(`${role} cannot execute the worker RPC`, denied);
  }
  process.stdout.write(`${checks} worker database checks passed; AI calls: 0.\n`);
} catch (e) {
  process.stderr.write(
    `FAIL worker database (${e.code ?? e.name}: ${e instanceof assert.AssertionError ? e.message : "details hidden"})\n`,
  );
  process.exitCode = 1;
} finally {
  await pool.query(`drop schema if exists ${schema} cascade`);
  await pool.end();
  process.stdout.write("CLEAN isolated worker schema removed\n");
}
