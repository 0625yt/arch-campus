// Real PostgreSQL attempt fencing. DDL, fixture users and jobs always roll back.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  connectionTimeoutMillis: 15000,
});
let checks = 0;
function check(label, condition) {
  assert.ok(condition, label);
  checks++;
  process.stdout.write(`PASS ${label}\n`);
}
async function rejectedQuery(label, query, params, code) {
  await client.query("savepoint rejected_query");
  let rejected = false;
  try {
    await client.query(query, params);
  } catch (error) {
    rejected = error.code === code;
  }
  await client.query("rollback to savepoint rejected_query");
  check(label, rejected);
}

try {
  if (!process.env.SUPABASE_DB_URL) throw new Error("database configuration missing");
  await client.connect();
  await client.query("begin");
  await client.query("set local statement_timeout = '15s'");
  await client.query("set local lock_timeout = '3s'");
  await client.query(
    await readFile(
      new URL("../supabase/migrations/0038_job_attempt_checkpoints.sql", import.meta.url),
      "utf8",
    ),
  );
  const owner = randomUUID(),
    other = randomUUID(),
    job = randomUUID();
  for (const id of [owner, other]) {
    await client.query("insert into auth.users(id, email) values ($1, $2)", [
      id,
      `${id}@example.invalid`,
    ]);
  }
  await client.query(
    "insert into public.jobs(id, owner_id, tool, status) values ($1, $2, 'summarize', 'running')",
    [job, owner],
  );
  await client.query("set local role service_role");
  const checkpoint = async (attempt, ownerId = owner, progress = 45) =>
    (
      await client.query(
        "select public.record_job_attempt_checkpoint($1,$2,$3,'generating-summary',$4::smallint) as recorded",
        [job, ownerId, attempt, progress],
      )
    ).rows[0].recorded;

  check("initial attempt can record a checkpoint", await checkpoint(0));
  await client.query(
    "update public.jobs set status='pending', retry_count=1, started_at=now() where id=$1",
    [job],
  );
  const before = (
    await client.query("select checkpoint_history from public.jobs where id=$1", [job])
  ).rows[0].checkpoint_history;
  check("original attempt cannot update retry progress", !(await checkpoint(0)));
  const legacy = await client.query(
    "select public.record_job_checkpoint($1,$2,'old-response',85::smallint) as recorded",
    [job, owner],
  );
  check("legacy callers cannot overwrite retry progress", !legacy.rows[0].recorded);
  const after = (
    await client.query("select checkpoint_history from public.jobs where id=$1", [job])
  ).rows[0].checkpoint_history;
  check(
    "rejected callbacks leave history unchanged",
    JSON.stringify(before) === JSON.stringify(after),
  );
  check("current retry can record a checkpoint", await checkpoint(1));
  check("foreign owner cannot record a checkpoint", !(await checkpoint(1, other)));
  await rejectedQuery(
    "invalid attempt is rejected",
    "select public.record_job_attempt_checkpoint($1,$2,2,'invalid',45::smallint)",
    [job, owner],
    "P0001",
  );
  await client.query(
    "update public.jobs set status='done', result='{}', finished_at=now() where id=$1",
    [job],
  );
  check("completed jobs reject progress updates", !(await checkpoint(1)));

  for (const role of ["authenticated", "anon"]) {
    await client.query("reset role");
    await client.query(`set local role ${role}`);
    await rejectedQuery(
      `${role} cannot call attempt RPC`,
      "select public.record_job_attempt_checkpoint($1,$2,1,'forged',45::smallint)",
      [job, owner],
      "42501",
    );
    await rejectedQuery(
      `${role} cannot call legacy RPC`,
      "select public.record_job_checkpoint($1,$2,'forged',45::smallint)",
      [job, owner],
      "42501",
    );
  }
  process.stdout.write(`${checks} job recovery checks passed; rolling back all changes.\n`);
} catch (error) {
  process.stderr.write(
    `FAIL job recovery verification (${error.code ?? error.name}): ${error instanceof assert.AssertionError ? error.message : "database connection or verification failed"}\n`,
  );
  process.exitCode = 1;
} finally {
  await client.query("rollback").catch(() => {});
  await client.end().catch(() => {});
}
