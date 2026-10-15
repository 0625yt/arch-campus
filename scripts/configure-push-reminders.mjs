// Explicit production activation; validates deployed readiness and the migration before scheduling.
import assert from "node:assert/strict";
import pg from "pg";

const name = "arch-campus-push-reminders";
const db = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  connectionTimeoutMillis: 15000,
});
const disabling = process.argv.includes("--disable");
assert.ok(disabling || process.argv.includes("--enable"), "choose --enable or --disable");
const base = new URL("https://arch-campus.vercel.app");
const apiRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const dbUrl = new URL(process.env.SUPABASE_DB_URL);
assert.ok(
  dbUrl.hostname === `db.${apiRef}.supabase.co` ||
    decodeURIComponent(dbUrl.username).endsWith(`.${apiRef}`),
  "API and database projects must match",
);
await db.connect();
try {
  if (disabling) {
    await db.query("select cron.unschedule(jobid) from cron.job where jobname=$1", [name]);
    process.stdout.write("Production push reminder schedule disabled\n");
  } else {
    const secret = process.env.PUSH_WORKER_SECRET;
    assert.ok(secret?.length >= 32, "push worker secret required");
    const ready = await fetch(new URL("/api/internal/push-reminders", base), {
      headers: { authorization: `Bearer ${secret}` },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(ready.status, 200, "deploy the matching push code and configuration first");
    assert.equal((await ready.json()).ok, true);
    const version = await db.query(
      "select 1 from supabase_migrations.schema_migrations where version='0042'",
    );
    assert.equal(version.rowCount, 1, "apply and record migration 0042 first");
    await db.query("begin");
    for (const [key, value] of [
      ["arch_push_worker_url", new URL("/api/internal/push-reminders", base).href],
      ["arch_push_worker_secret", secret],
    ]) {
      const found = await db.query("select id from vault.secrets where name=$1", [key]);
      if (found.rowCount)
        await db.query("select vault.update_secret($1,$2,$3)", [found.rows[0].id, value, key]);
      else await db.query("select vault.create_secret($1,$2)", [value, key]);
    }
    const command =
      "select net.http_post(url:=(select decrypted_secret from vault.decrypted_secrets where name='arch_push_worker_url'),headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='arch_push_worker_secret')),body:='{}'::jsonb,timeout_milliseconds:=55000);";
    await db.query("select cron.schedule($1,$2,$3)", [name, "* * * * *", command]);
    await db.query("commit");
    process.stdout.write(
      "Production push reminders scheduled every minute; secret encrypted in Vault\n",
    );
  }
} catch (error) {
  await db.query("rollback").catch(() => {});
  process.stderr.write(
    `Push schedule unchanged (${error instanceof assert.AssertionError ? error.message : (error.code ?? error.name)}); values hidden\n`,
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
