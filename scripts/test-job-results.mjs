// Atomic result fencing in real PostgreSQL. Only owned temporary UUIDs are deleted.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  max: 6,
  connectionTimeoutMillis: 15000,
});
const owner = randomUUID(),
  other = randomUUID(),
  material = randomUUID();
const summaryJob = randomUUID(),
  quizJob = randomUUID(),
  failureJob = randomUUID();
const ids = [];
let checks = 0;
const usage = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0 };
function check(label, condition) {
  assert.ok(condition, label);
  checks++;
  process.stdout.write(`PASS ${label}\n`);
}
async function transaction(role, run, rollback = false) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local statement_timeout='15s'");
    await client.query("set local lock_timeout='10s'");
    await client.query(`set local role ${role}`);
    const data = await run(client);
    await client.query(rollback ? "rollback" : "commit");
    return data;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
async function commit(
  {
    job = summaryJob,
    user = owner,
    target = material,
    attempt = 1,
    result = { summary: { keywords: ["fixture"], blocks: [] } },
    quiz = null,
    tokens = usage,
    generation = null,
  } = {},
  role = "service_role",
) {
  return transaction(
    role,
    async (client) =>
      (
        await client.query(
          "select public.commit_material_job_result($1,$2,$3,$4,'fixture',$5::jsonb,0,$6::jsonb,$7::jsonb,$8) as result",
          [
            job,
            user,
            attempt,
            target,
            JSON.stringify(tokens),
            JSON.stringify(result),
            quiz ? JSON.stringify(quiz) : null,
            generation,
          ],
        )
      ).rows[0].result,
  );
}
async function rejected(label, run, code) {
  let denied = false;
  try {
    await run();
  } catch (error) {
    denied = error.code === code;
  }
  check(label, denied);
}
async function state(id = summaryJob) {
  return (
    await pool.query(
      "select status, retry_count, result, checkpoint_history from public.jobs where id=$1 and owner_id=$2",
      [id, owner],
    )
  ).rows[0];
}
try {
  if (!process.env.SUPABASE_DB_URL) throw new Error("database configuration missing");
  // Validate the unapplied function transactionally before testing the installed RPC.
  await transaction(
    "postgres",
    async (client) => {
      await client.query(
        await readFile(
          new URL("../supabase/migrations/0040_material_job_results.sql", import.meta.url),
          "utf8",
        ).then((sql) => sql.replace("create function", "create or replace function")),
      );
    },
    true,
  );
  for (const id of [owner, other]) {
    await pool.query("insert into auth.users(id,email) values($1,$2)", [
      id,
      `arch-job-result-${id}@example.invalid`,
    ]);
    ids.push(id);
  }
  await pool.query(
    "insert into public.materials(id,owner_id,title,type) values($1,$2,'temporary result fixture','lecture')",
    [material, owner],
  );
  for (const [id, tool, retry] of [
    [summaryJob, "summarize", 1],
    [quizJob, "quiz", 0],
  ]) {
    await pool.query(
      "insert into public.jobs(id,owner_id,material_id,tool,status,retry_count) values($1,$2,$3,$4,'running',$5)",
      [id, owner, material, tool, retry],
    );
  }
  check("original execution cannot persist into a retry", (await commit({ attempt: 0 })) === null);
  check("foreign owner cannot persist a result", (await commit({ user: other })) === null);
  check(
    "wrong material cannot reuse another job",
    (await commit({ target: randomUUID() })) === null,
  );
  check(
    "rejected callbacks leave the cache empty",
    (await pool.query("select summary_payload from public.materials where id=$1", [material]))
      .rows[0].summary_payload === null,
  );
  const saved = await commit();
  check("current retry saves its summary", saved.summary.keywords[0] === "fixture");
  const finished = await state();
  check(
    "summary completion and result are committed together",
    finished.status === "done" && JSON.stringify(finished.result) === JSON.stringify(saved),
  );
  const cache = (
    await pool.query("select summary_payload from public.materials where id=$1", [material])
  ).rows[0].summary_payload;
  check(
    "material cache equals the committed job result",
    JSON.stringify(cache) === JSON.stringify(saved.summary),
  );
  check(
    "verification and completion are recorded",
    ["verifying-output", "completed"].every((stage) =>
      finished.checkpoint_history.some((point) => point.stage === stage),
    ),
  );
  const historyLength = finished.checkpoint_history.length;
  check(
    "replayed completion returns the saved result",
    JSON.stringify(await commit({ result: { summary: { keywords: ["overwrite"] } } })) ===
      JSON.stringify(saved),
  );
  check(
    "replay does not append another completion",
    (await state()).checkpoint_history.length === historyLength,
  );

  const quiz = {
    id: randomUUID(),
    title: "Temporary quiz",
    course_id: null,
    difficulty: "보통",
    questions: [{ id: 1, stem: "fixture" }],
    watermark: "temporary result fixture",
  };
  const foreignCourse = randomUUID(),
    foreignGeneration = randomUUID();
  await pool.query(
    "insert into public.courses(id,owner_id,name,category) values($1,$2,'temporary foreign course','personal')",
    [foreignCourse, other],
  );
  await pool.query(
    "insert into public.generations(id,owner_id,tool,model_id,status,cost_usd) values($1,$2,'quiz','fixture','ok',0)",
    [foreignGeneration, other],
  );
  await rejected(
    "foreign course cannot be attached to the saved quiz",
    () => commit({ job: quizJob, attempt: 0, quiz: { ...quiz, course_id: foreignCourse } }),
    "P0001",
  );
  await rejected(
    "foreign generation cannot be linked to the job",
    () => commit({ job: quizJob, attempt: 0, quiz, generation: foreignGeneration }),
    "P0001",
  );
  const results = await Promise.all(
    Array.from({ length: 12 }, () =>
      commit({ job: quizJob, attempt: 0, quiz, result: { quality: { generated: 1 } } }),
    ),
  );
  check(
    "12 concurrent completions return one quiz ID",
    results.every((item) => item.quizId === quiz.id),
  );
  check(
    "concurrent requests create exactly one quiz",
    (
      await pool.query("select count(*)::int as count from public.quizzes where owner_id=$1", [
        owner,
      ])
    ).rows[0].count === 1,
  );
  check("quiz result and completion commit together", (await state(quizJob)).status === "done");
  check(
    "late attempts cannot add another quiz",
    (await commit({ job: quizJob, attempt: 1, quiz: { ...quiz, id: randomUUID() } })) === null,
  );

  await pool.query(
    "insert into public.jobs(id,owner_id,material_id,tool,status) values($1,$2,$3,'summarize','running')",
    [failureJob, owner, material],
  );
  await rejected(
    "failure after cache write rolls back the whole transaction",
    () =>
      commit({
        job: failureJob,
        attempt: 0,
        tokens: { ...usage, inputTokens: null },
        result: { summary: { keywords: ["must roll back"] } },
      }),
    "23502",
  );
  check(
    "failed commit preserves the previous cache",
    JSON.stringify(
      (await pool.query("select summary_payload from public.materials where id=$1", [material]))
        .rows[0].summary_payload,
    ) === JSON.stringify(cache),
  );
  check(
    "failed commit leaves job active without a result",
    (await state(failureJob)).status === "running" && (await state(failureJob)).result === null,
  );
  await pool.query("update public.jobs set status='cancelled' where id=$1 and owner_id=$2", [
    failureJob,
    owner,
  ]);
  check(
    "cancelled job cannot write its summary",
    (await commit({ job: failureJob, attempt: 0 })) === null,
  );
  for (const role of ["anon", "authenticated"])
    await rejected(`${role} cannot call result RPC`, () => commit({}, role), "42501");
  await rejected("invalid attempt is rejected", () => commit({ attempt: 2 }), "P0001");
  process.stdout.write(`${checks} atomic job result checks passed; AI calls: 0.\n`);
} catch (error) {
  process.stderr.write(
    `FAIL job result verification (${error.code ?? error.name}): ${error instanceof assert.AssertionError ? error.message : "database connection or verification failed"}\n`,
  );
  process.exitCode = 1;
} finally {
  for (const id of ids) {
    await pool.query("delete from auth.users where id=$1", [id]).catch(() => {
      process.stderr.write("FAIL temporary result fixture cleanup\n");
      process.exitCode = 1;
    });
  }
  await pool.end();
}
