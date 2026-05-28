import { notFound, redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/supabase/admin";

/**
 * audit_log day-level rollup dev 페이지.
 *
 * dev 전용 — prod 노출 금지 (사용자가 자기 활동 로그를 일별로 보는 것은 본인 권리지만
 * 백오피스성 집계는 운영자용. 본인 raw 로그 페이지는 별도 sprint).
 *
 * 표시:
 *   - 최근 14일 · 본인 owner_id 한정
 *   - action별 일일 횟수 (login.fail 폭주·material.upload 빈도 등)
 *   - 무차별 시도 단서: distinct_ip_count > 3 행은 강조
 */
export const dynamic = "force-dynamic";

interface RollupRow {
  day: string;
  owner_id: string | null;
  action: string;
  action_count: number;
  distinct_ip_count: number;
  first_at: string;
  last_at: string;
}

export default async function AuditStatsPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const admin = getAdminSupabase();
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await (
    admin as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (
            c: string,
            v: string,
          ) => {
            gte: (
              c: string,
              v: string,
            ) => {
              order: (
                c: string,
                opts: { ascending: boolean },
              ) => {
                limit: (n: number) => Promise<{ data: RollupRow[] | null; error: unknown }>;
              };
            };
          };
        };
      };
    }
  )
    .from("audit_log_daily")
    .select("day, owner_id, action, action_count, distinct_ip_count, first_at, last_at")
    .eq("owner_id", ownerId)
    .gte("day", since)
    .order("day", { ascending: false })
    .limit(500);

  if (error) {
    return (
      <div className="px-8 py-12">
        <p className="text-red-600">조회 실패: {String(error)}</p>
      </div>
    );
  }

  const rows = data ?? [];
  const totalActions = rows.reduce((s, r) => s + r.action_count, 0);
  const suspiciousRows = rows.filter((r) => r.distinct_ip_count > 3);

  return (
    <div className="mx-auto w-full max-w-[1080px] px-8 py-12">
      <h1
        className="text-[28px] wght-700 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        Audit log (지난 14일)
      </h1>
      <p
        className="mt-2 text-[13px] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.022em" }}
      >
        본인 owner_id 한정. action 누적 {totalActions.toLocaleString()}건 · 의심 행(다중 IP)
        {suspiciousRows.length}건.
      </p>

      <div className="mt-8 overflow-x-auto rounded-[12px] border border-[var(--color-apple-hairline)] bg-white">
        <table className="w-full text-[13px]">
          <thead className="bg-[var(--color-apple-pearl)] text-left">
            <tr>
              <Th>날짜</Th>
              <Th>액션</Th>
              <Th className="text-right">횟수</Th>
              <Th className="text-right">고유 IP</Th>
              <Th>처음</Th>
              <Th>마지막</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[var(--color-apple-muted)]">
                  최근 활동이 없어요
                </td>
              </tr>
            )}
            {rows.map((r, i) => {
              const suspicious = r.distinct_ip_count > 3;
              return (
                <tr
                  key={i}
                  className={`border-t border-[var(--color-apple-hairline)] ${suspicious ? "bg-[var(--color-urgent)]/5" : ""}`}
                >
                  <Td>{r.day.slice(0, 10)}</Td>
                  <Td className="font-mono text-[12px]">{r.action}</Td>
                  <Td className="text-right tabular-nums">{r.action_count}</Td>
                  <Td
                    className={`text-right tabular-nums ${suspicious ? "wght-620 text-[var(--color-urgent)]" : ""}`}
                  >
                    {r.distinct_ip_count}
                  </Td>
                  <Td className="text-[11.5px] text-[var(--color-apple-muted)]">
                    {fmtTime(r.first_at)}
                  </Td>
                  <Td className="text-[11.5px] text-[var(--color-apple-muted)]">
                    {fmtTime(r.last_at)}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-[11.5px] wght-450 text-[var(--color-apple-muted)]">
        ⚠ dev only. prod에서는 notFound. raw 로그가 필요하면 Supabase Dashboard에서 직접 SELECT.
      </p>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-2.5 text-[11px] wght-700 uppercase tracking-[0.06em] text-[var(--color-apple-muted)] ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 text-[var(--color-apple-ink)] ${className}`}>{children}</td>;
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}
