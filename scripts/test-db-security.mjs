// Real PostgreSQL authorization checks. All fixtures and migration DDL are rolled back.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  connectionTimeoutMillis: 15000,
});
let checks = 0;
const check = (label, condition) => {
  assert.ok(condition, label);
  checks++;
  process.stdout.write(`PASS ${label}\n`);
};
async function actingAs(id, aal = "aal1") {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: id, role: "authenticated", aal }),
  ]);
  await client.query("set local role authenticated");
}
try {
  if (!process.env.SUPABASE_DB_URL) throw new Error("SUPABASE_DB_URL 미설정");
  await client.connect();
  await client.query("begin");
  await client.query("set local statement_timeout = '15s'");
  await client.query("set local lock_timeout = '3s'");
  const migrationState = await client.query(`
    select
      to_regprocedure('public.has_required_assurance()') is not null as function_exists,
      (
        select count(*)::int
        from pg_policies
        where policyname = 'require_verified_mfa'
          and schemaname in ('public', 'storage')
      ) as policy_count
  `);
  if (!migrationState.rows[0].function_exists && migrationState.rows[0].policy_count === 0) {
    await client.query(
      await readFile(
        new URL("../supabase/migrations/0027_mfa_assurance.sql", import.meta.url),
        "utf8",
      ),
    );
  }
  const installedState = await client.query(`
    select
      to_regprocedure('public.has_required_assurance()') is not null as function_exists,
      (
        select count(*)::int
        from pg_policies
        where policyname = 'require_verified_mfa'
          and schemaname in ('public', 'storage')
      ) as policy_count
  `);
  check(
    "MFA migration is fully installed",
    installedState.rows[0].function_exists && installedState.rows[0].policy_count === 12,
  );
  const a = randomUUID(),
    b = randomUUID();
  for (const id of [a, b])
    await client.query("insert into auth.users (id, email) values ($1, $2)", [
      id,
      `${id}@example.invalid`,
    ]);
  const tables = [
    { table: "courses", values: { name: "security fixture" } },
    { table: "materials", values: { title: "security fixture", type: "lecture" } },
    {
      table: "events",
      values: { title: "security fixture", kind: "etc", starts_at: new Date().toISOString() },
    },
    {
      table: "quizzes",
      values: {
        title: "security fixture",
        question_count: 1,
        questions: "[]",
        watermark: "test",
        model_id: "fixture",
      },
    },
  ];
  const rows = [];
  for (const { table, values } of tables) {
    await actingAs(a);
    const keys = ["owner_id", ...Object.keys(values)],
      vals = [a, ...Object.values(values)];
    const inserted = await client.query(
      `insert into public.${table} (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
      vals,
    );
    const id = inserted.rows[0].id;
    rows.push({ table, id });
    check(`${table}: owner insert`, inserted.rowCount === 1);
    await actingAs(b);
    check(
      `${table}: other user cannot read`,
      (await client.query(`select id from public.${table} where id=$1`, [id])).rowCount === 0,
    );
    check(
      `${table}: other user cannot delete`,
      (await client.query(`delete from public.${table} where id=$1 returning id`, [id]))
        .rowCount === 0,
    );
    if (table !== "quizzes")
      check(
        `${table}: other user cannot update`,
        (
          await client.query(`update public.${table} set owner_id=$1 where id=$2 returning id`, [
            b,
            id,
          ])
        ).rowCount === 0,
      );
    await client.query("savepoint forged_owner");
    let denied = false;
    try {
      await client.query(
        `insert into public.${table} (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")})`,
        vals,
      );
    } catch (error) {
      denied = error.code === "42501";
    }
    await client.query("rollback to savepoint forged_owner");
    check(`${table}: forged owner insert rejected`, denied);
  }
  await client.query("reset role");
  await client.query(
    "insert into auth.mfa_factors (id,user_id,factor_type,status,friendly_name,secret,created_at,updated_at) values ($1,$2,'totp','verified','transaction fixture','fixture',now(),now())",
    [randomUUID(), a],
  );
  for (const { table, id } of rows) {
    await actingAs(a, "aal1");
    check(
      `${table}: enrolled AAL1 denied`,
      (await client.query(`select id from public.${table} where id=$1`, [id])).rowCount === 0,
    );
    await actingAs(a, "aal2");
    check(
      `${table}: verified AAL2 allowed`,
      (await client.query(`select id from public.${table} where id=$1`, [id])).rowCount === 1,
    );
  }
  await actingAs(b, "aal1");
  check(
    "unenrolled account remains allowed",
    (await client.query("select public.has_required_assurance() as allowed")).rows[0].allowed ===
      true,
  );
  process.stdout.write(`${checks} security checks passed; rolling back all changes.\n`);
} catch (error) {
  // Never print connection strings or raw driver error objects.
  process.stderr.write(
    `FAIL database security verification (${error.code ?? error.name}): ${error instanceof assert.AssertionError ? error.message : "연결 또는 검증 쿼리 실패"}\n`,
  );
  process.exitCode = 1;
} finally {
  await client.query("rollback").catch(() => {});
  await client.end().catch(() => {});
}
