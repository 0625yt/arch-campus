import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const schema = `study_test_${randomUUID().replaceAll("-", "")}`;
const pool = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  max: 6,
  connectionTimeoutMillis: 15000,
});
const ownerA = randomUUID(),
  ownerB = randomUUID(),
  courseA = randomUUID(),
  courseB = randomUUID(),
  materialA = randomUUID(),
  materialB = randomUUID();
let created = false,
  checks = 0;
function check(label, condition) {
  assert.ok(condition, label);
  checks++;
  process.stdout.write(`PASS ${label}\n`);
}
async function asRole(role, owner, aal, query, args = []) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local statement_timeout = '15s'");
    await client.query(`set local role ${role}`);
    await client.query(
      "select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)",
      [owner ?? "", JSON.stringify({ sub: owner, aal })],
    );
    const result = await client.query(query, args);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
const service = (query, args = []) => asRole("service_role", null, "aal2", query, args);
async function rejected(label, run, code) {
  await assert.rejects(run, (error) => error.code === code);
  check(label, true);
}
const plan = (courseId = courseA, materialId = materialA) => ({
  id: randomUUID(),
  courseId,
  eventId: null,
  materialIds: [materialId],
  title: "Test",
  archived: false,
});
try {
  assert.ok(process.env.SUPABASE_DB_URL, "database configuration required");
  await pool.query(`create schema ${schema}`);
  created = true;
  await pool.query(`grant usage on schema ${schema} to service_role, authenticated, anon`);
  await pool.query(`create table ${schema}.users(id uuid primary key);
    create table ${schema}.courses(id uuid primary key, owner_id uuid);
    create table ${schema}.materials(id uuid primary key, owner_id uuid, course_id uuid);
    create table ${schema}.events(id uuid primary key, owner_id uuid, course_id uuid, kind text);
    grant all on all tables in schema ${schema} to service_role;
    create function ${schema}.has_required_assurance() returns boolean language sql stable as $$ select coalesce(auth.jwt()->>'aal','aal1') = 'aal2' $$;
    grant execute on function ${schema}.has_required_assurance() to authenticated`);
  await pool.query(`insert into ${schema}.users values ($1),($2)`, [ownerA, ownerB]);
  await pool.query(`insert into ${schema}.courses values ($1,$2),($3,$4)`, [
    courseA,
    ownerA,
    courseB,
    ownerB,
  ]);
  await pool.query(`insert into ${schema}.materials values ($1,$2,$3),($4,$5,$6)`, [
    materialA,
    ownerA,
    courseA,
    materialB,
    ownerB,
    courseB,
  ]);
  const sql = await readFile(
    new URL("../supabase/migrations/0043_study_workspaces.sql", import.meta.url),
    "utf8",
  );
  await pool.query(
    sql
      .replaceAll("public.", `${schema}.`)
      .replaceAll("references auth.users(id)", `references ${schema}.users(id)`)
      .replace("notify pgrst, 'reload schema';", ""),
  );
  const validPlan = plan();
  await service(`insert into ${schema}.study_workspaces(owner_id,plans) values ($1,$2::jsonb)`, [
    ownerA,
    JSON.stringify([validPlan]),
  ]);
  check(
    "owner can read its workspace",
    (await asRole("authenticated", ownerA, "aal2", `select * from ${schema}.study_workspaces`)).rows
      .length === 1,
  );
  check(
    "other owners cannot read a workspace",
    (await asRole("authenticated", ownerB, "aal2", `select * from ${schema}.study_workspaces`)).rows
      .length === 0,
  );
  check(
    "MFA assurance policy excludes AAL1",
    (await asRole("authenticated", ownerA, "aal1", `select * from ${schema}.study_workspaces`)).rows
      .length === 0,
  );
  await rejected(
    "anon cannot access workspaces",
    () => asRole("anon", null, "aal1", `select * from ${schema}.study_workspaces`),
    "42501",
  );
  await rejected(
    "authenticated cannot bypass the write API",
    () =>
      asRole(
        "authenticated",
        ownerA,
        "aal2",
        `update ${schema}.study_workspaces set daily_minutes=60`,
      ),
    "42501",
  );
  await rejected(
    "another owner's course is rejected at persistence",
    () =>
      service(`insert into ${schema}.study_workspaces(owner_id,plans) values ($1,$2::jsonb)`, [
        ownerB,
        JSON.stringify([plan()]),
      ]),
    "23514",
  );
  await rejected(
    "another owner's material is rejected at persistence",
    () =>
      service(`insert into ${schema}.study_workspaces(owner_id,plans) values ($1,$2::jsonb)`, [
        ownerB,
        JSON.stringify([plan(courseB, materialA)]),
      ]),
    "23514",
  );
  const foreignExam = randomUUID();
  await pool.query(`insert into ${schema}.events values ($1,$2,$3,'exam')`, [
    foreignExam,
    ownerA,
    courseA,
  ]);
  await rejected(
    "another owner's exam cannot be linked",
    () =>
      service(`insert into ${schema}.study_workspaces(owner_id,plans) values ($1,$2::jsonb)`, [
        ownerB,
        JSON.stringify([{ ...plan(courseB, materialB), eventId: foreignExam }]),
      ]),
    "23514",
  );
  await rejected(
    "daily time bounds are enforced by the database",
    () =>
      service(
        `update ${schema}.study_workspaces set daily_minutes=0,revision=2 where owner_id=$1`,
        [ownerA],
      ),
    "23514",
  );
  await rejected(
    "updates must advance the revision",
    () =>
      service(`update ${schema}.study_workspaces set daily_minutes=60 where owner_id=$1`, [ownerA]),
    "23514",
  );
  const writes = await Promise.all(
    Array.from({ length: 12 }, () =>
      service(
        `update ${schema}.study_workspaces set daily_minutes=60,revision=2 where owner_id=$1 and revision=1 returning revision`,
        [ownerA],
      ),
    ),
  );
  check(
    "12 concurrent saves accept exactly one revision",
    writes.reduce((sum, result) => sum + result.rows.length, 0) === 1,
  );
  await pool.query(`delete from ${schema}.materials where id=$1`, [materialA]);
  await service(
    `update ${schema}.study_workspaces set revision=3,plans=$2::jsonb where owner_id=$1 and revision=2`,
    [ownerA, JSON.stringify([{ ...validPlan, archived: true }])],
  );
  check(
    "deleted sources do not prevent preserving and archiving existing history",
    (await service(`select revision from ${schema}.study_workspaces where owner_id=$1`, [ownerA]))
      .rows[0].revision === 3,
  );
  await pool.query(`delete from ${schema}.users where id=$1`, [ownerA]);
  check(
    "account deletion cascades workspace data",
    (await service(`select * from ${schema}.study_workspaces`)).rows.length === 0,
  );
  process.stdout.write(`${checks} isolated study database checks passed\n`);
} catch (error) {
  process.stderr.write(
    `FAIL study database checks (${error instanceof assert.AssertionError ? error.message : (error.code ?? error.name)})\n`,
  );
  process.exitCode = 1;
} finally {
  if (created) {
    try {
      await pool.query(`drop schema ${schema} cascade`);
      process.stdout.write("CLEAN temporary schema removed\n");
    } catch {
      process.stderr.write("FAIL temporary schema cleanup\n");
      process.exitCode = 1;
    }
  }
  await pool.end();
}
