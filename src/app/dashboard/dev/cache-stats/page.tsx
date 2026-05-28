import { notFound, redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/supabase/admin";

/**
 * 캐시 hit률·비용 집계 dev 페이지 — Anthropic prompt caching 효과 가시화.
 *
 * 왜:
 *   - 토큰 절감 리포트(2026-05)에 따르면 Haiku 4.5는 rulePrompt 4096 토큰 미만이면
 *     cache_control 무시 → 매 호출 정가 청구. 추측 말고 실측 필요.
 *   - generations 테이블에 이미 input/output/cache_read/cache_creation 컬럼 다 있음.
 *     도구별·모델별로 묶어 hit률 보이면 어디부터 손볼지 즉시 판단 가능.
 *
 * dev 전용. RLS 우회 (service-role) — 본인 데이터만 조회.
 */
export const dynamic = "force-dynamic";

interface ToolStat {
  tool: string;
  modelId: string;
  calls: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  costUsd: number;
}

export default async function CacheStatsPage() {
  // prod 빌드에 포함되지만 dev 전용 — code-review critical fix.
  // 일반 사용자가 URL 알면 자신의 비용·토큰 통계를 볼 수 있어 dev/ 경로는 prod에서 404.
  if (process.env.NODE_ENV === "production") notFound();

  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const admin = getAdminSupabase();
  // 최근 30일만 — generations 누적 시 폭주 방지 위해 limit 가드.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await admin
    .from("generations")
    .select(
      "tool, model_id, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, cost_usd, status",
    )
    .eq("owner_id", ownerId)
    .gte("created_at", since)
    .eq("status", "ok")
    .limit(5000);

  if (error) {
    return (
      <div className="mx-auto max-w-[920px] px-6 pt-12">
        <p className="text-[var(--color-urgent)]">조회 실패: {error.message}</p>
      </div>
    );
  }

  // 도구·모델별로 묶기
  const buckets = new Map<string, ToolStat>();
  for (const r of rows ?? []) {
    const key = `${r.tool}::${r.model_id}`;
    const cur = buckets.get(key) ?? {
      tool: r.tool,
      modelId: r.model_id,
      calls: 0,
      inputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    cur.calls += 1;
    cur.inputTokens += r.input_tokens ?? 0;
    cur.cacheReadTokens += r.cache_read_tokens ?? 0;
    cur.cacheCreationTokens += r.cache_creation_tokens ?? 0;
    cur.outputTokens += r.output_tokens ?? 0;
    cur.costUsd += Number(r.cost_usd ?? 0);
    buckets.set(key, cur);
  }

  const stats = Array.from(buckets.values()).sort((a, b) => b.costUsd - a.costUsd);
  const totalCost = stats.reduce((a, s) => a + s.costUsd, 0);

  return (
    <div className="mx-auto max-w-[1080px] px-6 pb-24 pt-10 sm:px-10 sm:pt-14">
      <header>
        <p
          className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "0.06em" }}
        >
          dev
        </p>
        <h1
          className="mt-2 text-[28px] leading-[1.1] wght-620 text-[var(--color-apple-ink)] sm:text-[32px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          Cache hit·token 집계 (최근 30일)
        </h1>
        <p
          className="mt-3 text-[13.5px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.022em" }}
        >
          도구별로 Anthropic prompt caching이 얼마나 효과적으로 작동했는지 본다. hit률이 낮으면
          rulePrompt가 cache 최소 토큰(Haiku 4096 / Sonnet 1024) 미만이거나, 매 호출마다 prefix가
          미세하게 바뀌고 있다는 신호.
        </p>
      </header>

      <section className="mt-8">
        <p
          className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "0.06em" }}
        >
          누적 30일 비용
        </p>
        <p
          className="mt-2 text-[40px] leading-[1.05] wght-620 tabular-nums text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          ${totalCost.toFixed(4)}
        </p>
      </section>

      {stats.length === 0 ? (
        <p className="mt-10 text-[14px] wght-450 text-[var(--color-apple-muted)]">
          최근 30일 ok 상태 generation이 없어요. 호출을 한 번 만들고 다시 보세요.
        </p>
      ) : (
        <section className="mt-10 overflow-hidden rounded-[14px] border border-[var(--color-apple-hairline)] bg-white">
          <table className="w-full text-left text-[12.5px] tabular-nums">
            <thead>
              <tr className="border-b border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)]/40 text-[11px] wght-620 uppercase text-[var(--color-apple-muted)]">
                <th className="px-4 py-3" style={{ letterSpacing: "0.04em" }}>
                  도구
                </th>
                <th className="px-3 py-3" style={{ letterSpacing: "0.04em" }}>
                  모델
                </th>
                <th className="px-3 py-3 text-right" style={{ letterSpacing: "0.04em" }}>
                  호출
                </th>
                <th className="px-3 py-3 text-right" style={{ letterSpacing: "0.04em" }}>
                  정가 in
                </th>
                <th className="px-3 py-3 text-right" style={{ letterSpacing: "0.04em" }}>
                  캐시 read
                </th>
                <th className="px-3 py-3 text-right" style={{ letterSpacing: "0.04em" }}>
                  캐시 write
                </th>
                <th className="px-3 py-3 text-right" style={{ letterSpacing: "0.04em" }}>
                  out
                </th>
                <th className="px-3 py-3 text-right" style={{ letterSpacing: "0.04em" }}>
                  hit률
                </th>
                <th className="px-4 py-3 text-right" style={{ letterSpacing: "0.04em" }}>
                  비용
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => {
                const totalCached = s.cacheReadTokens + s.cacheCreationTokens;
                const hitRate = totalCached > 0 ? (s.cacheReadTokens / totalCached) * 100 : 0;
                // 정가 input이 0보다 크고 cached도 0이면 캐시 비활성 상태 — 빨간 신호
                const noCacheUse = totalCached === 0 && s.inputTokens > 100;
                return (
                  <tr
                    key={`${s.tool}-${s.modelId}`}
                    className="border-b border-[var(--color-apple-hairline-soft)] last:border-0"
                  >
                    <td className="px-4 py-3 wght-560 text-[var(--color-apple-ink)]">{s.tool}</td>
                    <td className="px-3 py-3 text-[var(--color-apple-muted)]">
                      {s.modelId.replace("claude-", "")}
                    </td>
                    <td className="px-3 py-3 text-right">{s.calls}</td>
                    <td className="px-3 py-3 text-right">{s.inputTokens.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right">{s.cacheReadTokens.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right">
                      {s.cacheCreationTokens.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right">{s.outputTokens.toLocaleString()}</td>
                    <td
                      className={`px-3 py-3 text-right wght-560 ${
                        noCacheUse
                          ? "text-[var(--color-urgent)]"
                          : hitRate >= 60
                            ? "text-[var(--color-apple-success)]"
                            : hitRate > 0
                              ? "text-[var(--color-apple-action)]"
                              : "text-[var(--color-apple-muted)]"
                      }`}
                    >
                      {noCacheUse ? "—" : `${hitRate.toFixed(0)}%`}
                    </td>
                    <td className="px-4 py-3 text-right wght-560 text-[var(--color-apple-ink)]">
                      ${s.costUsd.toFixed(4)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <section className="mt-8 rounded-[14px] border border-[var(--color-apple-hairline)] bg-white px-6 py-5 text-[12.5px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]">
        <p className="wght-560 text-[var(--color-apple-ink)]">읽는 법</p>
        <ul className="mt-2 list-disc pl-5">
          <li>
            <span className="wght-560">정가 in</span>: cache_control 안 걸린 input. dynamicContext +
            userInput.
          </li>
          <li>
            <span className="wght-560">캐시 read</span>: cache_control 걸린 rulePrompt가 1h 안에
            재사용됨 — 90% 할인.
          </li>
          <li>
            <span className="wght-560">캐시 write</span>: 새로 캐시에 박은 토큰 — 1h ttl 기준 2배
            가격.
          </li>
          <li>
            <span className="wght-560">hit률 — (빨강)</span>: 정가 input은 있는데 캐시 read/write 둘
            다 0. rulePrompt가 cache 최소 토큰 미만이라 가능성 큼.
          </li>
          <li>
            <span className="wght-560">hit률 60%+ (초록)</span>: 캐시 잘 굴러감.
          </li>
        </ul>
      </section>
    </div>
  );
}
