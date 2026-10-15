// Exercise the migration in a disposable schema; no production events, users or schedules change.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const schema = `push_test_${randomUUID().replaceAll("-", "")}`;
const pool = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  max: 8,
  connectionTimeoutMillis: 15000,
});
const ownerA = randomUUID(),
  ownerB = randomUUID();
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
    await client.query("set local lock_timeout = '10s'");
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
const service = (query, args) => asRole("service_role", null, "aal2", query, args);
const endpoint = (suffix) => `https://fcm.googleapis.com/test-${suffix}`;
const register = (owner, suffix) =>
  service(`select ${schema}.register_push_subscription($1,$2,$3,$4,$5) as id`, [
    owner,
    endpoint(suffix),
    createHash("sha256").update(endpoint(suffix)).digest("hex"),
    "B".repeat(87),
    "a".repeat(22),
  ]);
const claim = () => service(`select * from ${schema}.claim_push_reminders($1)`, [ownerA]);
const finish = (row, token, outcome) =>
  service(`select ${schema}.finish_push_reminder($1,$2,$3,$4) as accepted`, [
    row.id,
    row.owner_id,
    token,
    outcome,
  ]);
async function rejected(label, run, code) {
  let failed = false;
  try {
    await run();
  } catch (error) {
    failed = error.code === code;
  }
  check(label, failed);
}

try {
  assert.ok(process.env.SUPABASE_DB_URL, "database configuration required");
  await pool.query(`create schema ${schema}`);
  created = true;
  await pool.query(`grant usage on schema ${schema} to service_role, authenticated, anon`);
  await pool.query(`create table ${schema}.users(id uuid primary key)`);
  await pool.query(`insert into ${schema}.users values ($1),($2)`, [ownerA, ownerB]);
  await pool.query(
    `create table ${schema}.events(id uuid primary key default gen_random_uuid(), owner_id uuid not null references ${schema}.users(id) on delete cascade, starts_at timestamptz not null, reminder_minutes integer, confirmed boolean not null default true, recurrence_rule text); grant all on ${schema}.events to service_role`,
  );
  // The assurance function is a test stand-in; the migration's restrictive policy is unchanged.
  await pool.query(
    `create function ${schema}.has_required_assurance() returns boolean language sql stable as $$ select coalesce(auth.jwt()->>'aal','aal1') = 'aal2' $$; grant execute on function ${schema}.has_required_assurance() to authenticated`,
  );
  const sql = await readFile(
    new URL("../supabase/migrations/0042_push_reminders.sql", import.meta.url),
    "utf8",
  );
  await pool.query(
    sql
      .replaceAll("public.", `${schema}.`)
      .replaceAll("references auth.users(id)", `references ${schema}.users(id)`)
      .replace("notify pgrst, 'reload schema';", ""),
  );

  const subscription = (await register(ownerA, "first")).rows[0].id;
  check(
    "register is idempotent for the same owner",
    (await register(ownerA, "first")).rows[0].id === subscription,
  );
  await rejected(
    "another owner cannot take an existing browser",
    () => register(ownerB, "first"),
    "23505",
  );
  await pool.query(
    `update ${schema}.push_subscriptions set created_at = now() - interval '1 hour' where id=$1`,
    [subscription],
  );

  const concurrent = await Promise.allSettled(
    Array.from({ length: 20 }, (_, i) => register(ownerB, `cap-${i}`)),
  );
  check(
    "20 concurrent registrations persist exactly 10 browsers",
    concurrent.filter((r) => r.status === "fulfilled").length === 10,
  );
  const own = await asRole(
    "authenticated",
    ownerA,
    "aal2",
    `select * from ${schema}.push_subscriptions`,
  );
  check(
    "RLS returns only the current owner's browser",
    own.rows.length === 1 && own.rows[0].owner_id === ownerA,
  );
  check(
    "AAL1 cannot read subscriptions under the restrictive policy",
    (await asRole("authenticated", ownerA, "aal1", `select * from ${schema}.push_subscriptions`))
      .rows.length === 0,
  );
  await rejected(
    "anon cannot read subscriptions",
    () => asRole("anon", null, "aal1", `select * from ${schema}.push_subscriptions`),
    "42501",
  );
  await rejected(
    "authenticated cannot call the registration RPC",
    () =>
      asRole(
        "authenticated",
        ownerA,
        "aal2",
        `select ${schema}.register_push_subscription($1,$2,$3,$4,$5)`,
        [ownerA, endpoint("forged"), "f".repeat(64), "B".repeat(87), "a".repeat(22)],
      ),
    "42501",
  );
  await rejected(
    "authenticated cannot call the scheduler RPC",
    () => asRole("authenticated", ownerA, "aal2", `select * from ${schema}.claim_push_reminders()`),
    "42501",
  );

  const event = (
    await service(
      `insert into ${schema}.events(owner_id,starts_at,reminder_minutes) values($1,now()+interval '9 minutes 30 seconds',10) returning id`,
      [ownerA],
    )
  ).rows[0].id;
  const leases = (await Promise.all(Array.from({ length: 8 }, claim))).flatMap((r) => r.rows);
  check(
    "eight overlapping ticks claim exactly one delivery",
    leases.length === 1 && leases[0].attempts === 1,
  );
  const row = leases[0];
  check(
    "an incorrect lease cannot settle delivery",
    !(await finish(row, randomUUID(), "sent")).rows[0].accepted,
  );
  await finish(row, row.lease_token, "retry");
  check("retry is delayed until the next minute", (await claim()).rows.length === 0);
  await pool.query(
    `update ${schema}.push_reminder_deliveries set available_at=now()-interval '1 second' where id=$1`,
    [row.id],
  );
  const retry = (await claim()).rows[0];
  check(
    "retry increments attempts and changes the lease token",
    retry.attempts === 2 && retry.lease_token !== row.lease_token,
  );
  check(
    "an old worker cannot overwrite a newer lease",
    !(await finish(row, row.lease_token, "sent")).rows[0].accepted,
  );
  await finish(retry, retry.lease_token, "sent");
  check("a completed reminder is not queued again", (await claim()).rows.length === 0);

  await service(
    `update ${schema}.events set starts_at=starts_at+interval '5 seconds' where id=$1`,
    [event],
  );
  const edited = (await claim()).rows[0];
  check(
    "an explicitly changed schedule has its own delivery identity",
    edited && edited.id !== row.id,
  );
  await service(`update ${schema}.events set reminder_minutes=null where id=$1`, [event]);
  check(
    "disabling a reminder closes the pending lease",
    (await claim()).rows.length === 0 &&
      (
        await pool.query(`select status from ${schema}.push_reminder_deliveries where id=$1`, [
          edited.id,
        ])
      ).rows[0].status === "failed",
  );
  await service(
    `insert into ${schema}.events(owner_id,starts_at,reminder_minutes,confirmed) values($1,now()-interval '20 minutes',0,true),($1,now()-interval '10 seconds',0,false)`,
    [ownerA],
  );
  check("expired and unconfirmed events are never sent", (await claim()).rows.length === 0);

  const second = (
    await service(
      `insert into ${schema}.events(owner_id,starts_at,reminder_minutes) values($1,now()-interval '10 seconds',0) returning id`,
      [ownerA],
    )
  ).rows[0].id;
  const firstLease = (await claim()).rows[0];
  await pool.query(
    `update ${schema}.push_reminder_deliveries set leased_at=now()-interval '3 minutes' where id=$1`,
    [firstLease.id],
  );
  const reclaimed = (await claim()).rows[0];
  check(
    "a stopped worker's lease can be reclaimed",
    reclaimed.attempts === 2 && reclaimed.lease_token !== firstLease.lease_token,
  );
  await finish(reclaimed, reclaimed.lease_token, "retry");
  await pool.query(
    `update ${schema}.push_reminder_deliveries set available_at=now()-interval '1 second' where id=$1`,
    [reclaimed.id],
  );
  const last = (await claim()).rows[0];
  await finish(last, last.lease_token, "retry");
  check(
    "three failed attempts are terminal",
    last.attempts === 3 && (await claim()).rows.length === 0,
  );
  await service(`delete from ${schema}.events where id=$1`, [second]);
  check(
    "event deletion also deletes its delivery metadata",
    (
      await pool.query(`select id from ${schema}.push_reminder_deliveries where event_id=$1`, [
        second,
      ])
    ).rows.length === 0,
  );
  await asRole(
    "authenticated",
    ownerB,
    "aal2",
    `delete from ${schema}.push_subscriptions where id=$1`,
    [subscription],
  );
  check(
    "another account cannot revoke this browser",
    (await pool.query(`select id from ${schema}.push_subscriptions where id=$1`, [subscription]))
      .rows.length === 1,
  );
  await asRole(
    "authenticated",
    ownerA,
    "aal2",
    `delete from ${schema}.push_subscriptions where id=$1`,
    [subscription],
  );
  check(
    "consent revocation removes all associated deliveries",
    (
      await pool.query(
        `select id from ${schema}.push_reminder_deliveries where subscription_id=$1`,
        [subscription],
      )
    ).rows.length === 0,
  );
  process.stdout.write(
    `${checks} isolated push database checks passed. No push provider or production schedule called.\n`,
  );
} catch (error) {
  process.stderr.write(
    `FAIL push database checks (${error instanceof assert.AssertionError ? error.message : (error.code ?? error.name)})\n`,
  );
  process.exitCode = 1;
} finally {
  if (created) {
    try {
      await pool.query(`drop schema ${schema} cascade`);
      process.stdout.write("CLEAN temporary schema and all fixtures removed\n");
    } catch {
      process.stderr.write("FAIL temporary schema cleanup\n");
      process.exitCode = 1;
    }
  }
  await pool.end();
}
