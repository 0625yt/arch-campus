// Read-only aggregate report. Never reads student text, account IDs or API keys into output.
import pg from "pg";
import { kstMonthWindow } from "../src/lib/ai-budget.ts";

const window = kstMonthWindow();
const rawThreshold = process.env.AI_MODEL_ALERT_USD;
const threshold = rawThreshold ? Number(rawThreshold) : null;
const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  connectionTimeoutMillis: 15_000,
});
try {
  if (!process.env.SUPABASE_DB_URL) throw new Error("missing database configuration");
  if (threshold !== null && (!Number.isFinite(threshold) || threshold <= 0))
    throw new Error("invalid model alert threshold");
  await client.connect();
  await client.query("begin read only");
  await client.query("set local statement_timeout = '15s'");
  const { rows } = await client.query(
    `
    with usage as (
      select model_id, tool, cost_usd, status
      from public.generations
      where created_at >= $1 and created_at < $2
      union all
      select coalesce(model_id, 'unknown'), 'chat', cost_usd,
             case when refusal_reason is null then 'ok' else 'rejected' end
      from public.chat_messages
      where role = 'assistant' and created_at >= $1 and created_at < $2
    )
    select model_id, count(*)::int as calls,
           coalesce(sum(cost_usd), 0)::float8 as cost_usd,
           coalesce(sum(cost_usd) filter (where status in ('rejected', 'error')), 0)::float8 as rejected_or_error_cost_usd
    from usage
    group by model_id
    order by cost_usd desc, model_id
  `,
    [window.startsAt, window.resetsAt],
  );
  await client.query("commit");
  const models = rows.map((row) => ({
    ...row,
    alert: threshold !== null && row.cost_usd >= threshold,
  }));
  process.stdout.write(
    `${JSON.stringify(
      {
        period: window.label,
        startsAt: window.startsAt,
        resetsAt: window.resetsAt,
        modelAlertUsd: threshold,
        recordedCostUsd: models.reduce((sum, row) => sum + row.cost_usd, 0),
        models,
        coverage:
          "Recorded generation and material-chat estimates only; excludes unrecorded OCR, classification, embeddings and provider billing differences.",
      },
      null,
      2,
    )}\n`,
  );
  if (models.some((row) => row.alert)) process.exitCode = 2;
} catch (error) {
  process.stderr.write(`FAIL AI cost report (${error.code ?? error.name})\n`);
  process.exitCode = 1;
} finally {
  await client.query("rollback").catch(() => {});
  await client.end().catch(() => {});
}
