// Opt-in production activation. Readiness is checked before any scheduled work is enabled.
import assert from "node:assert/strict";
import pg from "pg";

const name = "arch-campus-material-job-recovery";
const base = new URL(process.env.JOB_WORKER_BASE_URL ?? "https://arch-campus.vercel.app");
const db = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  connectionTimeoutMillis: 15000,
});
const disabling = process.argv.includes("--disable");
assert.ok(disabling || process.argv.includes("--enable"), "choose --enable or --disable");
const apiRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const dbUrl = new URL(process.env.SUPABASE_DB_URL);
assert.ok(
  dbUrl.hostname === `db.${apiRef}.supabase.co` ||
    decodeURIComponent(dbUrl.username).endsWith(`.${apiRef}`),
  "API and database project must match",
);
await db.connect();
try {
  if (disabling) {
    await db.query("select cron.unschedule(jobid) from cron.job where jobname=$1", [name]);
    process.stdout.write("Production recovery schedule disabled\n");
  } else {
    const secret = process.env.JOB_WORKER_SECRET;
    assert.ok(secret?.length >= 32, "worker secret required");
    assert.equal(
      base.origin,
      "https://arch-campus.vercel.app",
      "only the production site is allowed",
    );
    assert.equal(base.pathname, "/");
    assert.ok(!base.username && !base.password && !base.search && !base.hash);
    const ready = await fetch(new URL("/api/internal/material-jobs/recover", base), {
      headers: { authorization: `Bearer ${secret}` },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(ready.status, 200, "deploy the worker code and matching secret before activation");
    assert.equal((await ready.json()).ok, true);
    const version = await db.query(
      "select 1 from supabase_migrations.schema_migrations where version='0041'",
    );
    assert.equal(version.rowCount, 1, "apply 0041 first");
    await db.query("begin");
    for (const [key, value] of [
      ["arch_job_worker_url", new URL("/api/internal/material-jobs/recover", base).href],
      ["arch_job_worker_secret", secret],
    ]) {
      const found = await db.query("select id from vault.secrets where name=$1", [key]);
      if (found.rowCount)
        await db.query("select vault.update_secret($1,$2,$3)", [found.rows[0].id, value, key]);
      else await db.query("select vault.create_secret($1,$2)", [value, key]);
    }
    const command = `select net.http_post(url:=(select decrypted_secret from vault.decrypted_secrets where name='arch_job_worker_url'),headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='arch_job_worker_secret')),body:='{}'::jsonb,timeout_milliseconds:=10000);`;
    await db.query("select cron.schedule($1,$2,$3)", [name, "* * * * *", command]);
    await db.query("commit");
    process.stdout.write("Production recovery scheduled every minute; secret encrypted in Vault\n");
  }
} catch (e) {
  await db.query("rollback").catch(() => {});
  process.stderr.write(
    `Recovery schedule unchanged (${e instanceof assert.AssertionError ? e.message : (e.code ?? e.name)}); values hidden\n`,
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
