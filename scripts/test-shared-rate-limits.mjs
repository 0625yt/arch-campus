// Run the exact migration in an isolated schema, then remove every fixture and object.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const schema = `rate_limit_test_${randomUUID().replaceAll("-", "")}`;
const pool = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  max: 8,
  connectionTimeoutMillis: 15000,
});
const hash = (value) => createHash("sha256").update(value).digest("hex");
let checks = 0;
let created = false;
function check(label, condition) {
  assert.ok(condition, label);
  checks++;
  process.stdout.write(`PASS ${label}\n`);
}
async function transaction(role, run) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local statement_timeout = '15s'");
    await client.query("set local lock_timeout = '10s'");
    // role is an internal constant, never supplied by users.
    await client.query(`set local role ${role}`);
    const value = await run(client);
    await client.query("commit");
    return value;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
async function consume(id = "owner-a", kind = "ai", tokens = 6, span = 60_000) {
  return transaction(
    "service_role",
    async (client) =>
      (
        await client.query(`select * from ${schema}.consume_rate_limit($1,$2,$3,$4)`, [
          kind,
          hash(id),
          tokens,
          span,
        ])
      ).rows[0],
  );
}
async function denied(label, role, query, args = []) {
  let rejected = false;
  try {
    await transaction(role, (client) => client.query(query, args));
  } catch (error) {
    rejected = error.code === "42501";
  }
  check(label, rejected);
}

try {
  if (!process.env.SUPABASE_DB_URL) throw new Error("database configuration missing");
  const sql = await readFile(
    new URL("../supabase/migrations/0039_shared_rate_limits.sql", import.meta.url),
    "utf8",
  );
  await pool.query(`create schema ${schema}`);
  created = true;
  await pool.query(`grant usage on schema ${schema} to service_role, authenticated, anon`);
  await pool.query(sql.replaceAll("public.", `${schema}.`));

  const concurrent = await Promise.all(Array.from({ length: 20 }, () => consume()));
  check(
    "20 concurrent requests across connections accept exactly 6",
    concurrent.filter((r) => r.allowed).length === 6,
  );
  check(
    "14 exhausted requests report zero remaining",
    concurrent.filter((r) => !r.allowed).every((r) => r.remaining === 0),
  );
  const accepted = concurrent
    .filter((r) => r.allowed)
    .map((r) => r.remaining)
    .sort((a, b) => a - b);
  check(
    "atomic counts decrease once per accepted request",
    JSON.stringify(accepted) === "[0,1,2,3,4,5]",
  );
  check(
    "reset times use epoch milliseconds",
    concurrent.every(
      (r) => Number(r.reset_ms) > Date.now() && Number(r.reset_ms) <= Date.now() + 60_000,
    ),
  );
  const stored = (
    await pool.query(`select hits from ${schema}.rate_limit_buckets where identifier_hash=$1`, [
      hash("owner-a"),
    ])
  ).rows;
  check(
    "rejected requests never append additional hits",
    stored.length === 1 && stored[0].hits.length === 6,
  );
  check("other identifiers retain independent quotas", (await consume("owner-b")).remaining === 5);
  check(
    "categories retain independent quotas",
    (await consume("owner-a", "upload", 30, 3_600_000)).remaining === 29,
  );

  await pool.query(
    `update ${schema}.rate_limit_buckets set hits=ARRAY[clock_timestamp()-interval '61 seconds'], expires_at=clock_timestamp()-interval '1 second' where kind='ai' and identifier_hash=$1`,
    [hash("owner-a")],
  );
  check("expired window permits new requests", (await consume()).remaining === 5);
  await pool.query(
    `update ${schema}.rate_limit_buckets set hits=ARRAY[clock_timestamp()-interval '59 seconds',clock_timestamp()], expires_at=clock_timestamp()+interval '60 seconds' where kind='ai' and identifier_hash=$1`,
    [hash("owner-a")],
  );
  const staggered = await consume();
  check(
    "rolling window retains only live hits and resets from the oldest",
    staggered.remaining === 3 && Number(staggered.reset_ms) <= Date.now() + 1500,
  );

  await pool.query(
    `insert into ${schema}.rate_limit_buckets(kind,identifier_hash,expires_at) select 'default',md5(i::text)||md5(i::text),clock_timestamp()-interval '1 day' from generate_series(1,150) as i`,
  );
  await consume("cleanup-owner");
  const expired = (
    await pool.query(
      `select count(*)::integer as count from ${schema}.rate_limit_buckets where expires_at <= clock_timestamp()`,
    )
  ).rows[0].count;
  check("one request cleans at most 100 expired buckets", expired === 50);
  await consume("cleanup-owner");
  check(
    "subsequent requests finish expired cleanup",
    (
      await pool.query(
        `select count(*)::integer as count from ${schema}.rate_limit_buckets where expires_at <= clock_timestamp()`,
      )
    ).rows[0].count === 0,
  );
  check("cleanup preserves active buckets", (await consume("owner-b")).remaining === 4);

  for (const role of ["anon", "authenticated"]) {
    await denied(
      `${role} cannot read hashed buckets`,
      role,
      `select * from ${schema}.rate_limit_buckets`,
    );
    await denied(`${role} cannot reset buckets`, role, `delete from ${schema}.rate_limit_buckets`);
    await denied(
      `${role} cannot consume server quotas`,
      role,
      `select * from ${schema}.consume_rate_limit('ai',$1,6,60000)`,
      [hash("forged")],
    );
  }
  let invalid = false;
  try {
    await transaction("service_role", (client) =>
      client.query(`select * from ${schema}.consume_rate_limit('ai','raw-ip',6,60000)`),
    );
  } catch (error) {
    invalid = error.code === "P0001";
  }
  check("raw identifiers are rejected", invalid);
  process.stdout.write(`${checks} shared rate limit checks passed.\n`);
} catch (error) {
  process.stderr.write(
    `FAIL shared rate limit verification (${error.code ?? error.name}): ${error instanceof assert.AssertionError ? error.message : "database connection or verification failed"}\n`,
  );
  process.exitCode = 1;
} finally {
  if (created) {
    await pool.query(`drop schema ${schema} cascade`).catch(() => {
      process.stderr.write("FAIL temporary schema cleanup\n");
      process.exitCode = 1;
    });
  }
  await pool.end();
}
