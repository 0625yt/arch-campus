import { ArrowUpRight, CalendarDays, Download, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppleShell } from "@/components/apple-shell";
import { tryGetOwnerId } from "@/lib/auth";
import { getMonthlyAiUsage } from "@/lib/data/ai-usage";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  let usage: Awaited<ReturnType<typeof getMonthlyAiUsage>> | null = null;
  try {
    usage = await getMonthlyAiUsage({ ownerId });
  } catch {
    usage = null;
  }

  return (
    <AppleShell width="narrow">
      <header className="fade-up">
        <p className="text-[12px] wght-450 text-[var(--color-apple-muted)]">내 계정</p>
        <h1
          className="mt-2 text-[32px] leading-[1.08] wght-700 text-[var(--color-apple-ink)] sm:text-[40px]"
          style={{ letterSpacing: "-0.022em" }}
        >
          설정
        </h1>
        <p className="mt-4 max-w-[560px] text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]">
          이번 달 학습 도구 사용량과 계정 보안을 한곳에서 관리해요.
        </p>
      </header>

      <section className="mt-10 fade-up fade-up-2 sm:mt-12">
        <div className="elev-1 overflow-hidden rounded-[18px] bg-white px-6 py-7 sm:px-8 sm:py-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#edf4ff] text-[var(--color-apple-action)]">
                <Sparkles aria-hidden size={19} strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] wght-620 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                  {usage?.periodLabel ?? "이번 달"}
                </p>
                <h2 className="mt-1.5 text-[19px] wght-650 text-[var(--color-apple-ink)]">
                  AI 학습 도구 사용량
                </h2>
              </div>
            </div>
            {usage && (
              <p className="shrink-0 text-right">
                <span className="block text-[24px] leading-none wght-700 tabular-nums text-[var(--color-apple-ink)]">
                  {usage.calls}
                </span>
                <span className="mt-1 block text-[10.5px] wght-450 text-[var(--color-apple-muted)]">
                  생성·질문
                </span>
              </p>
            )}
          </div>

          {usage ? (
            <>
              <div className="mt-7">
                <div className="flex items-center justify-between gap-3 text-[11.5px]">
                  <span className="wght-560 text-[var(--color-apple-ink)]">
                    {usage.limitReached
                      ? "이번 달 사용 한도에 도달했어요"
                      : usage.usagePercent !== null && usage.usagePercent >= 75
                        ? "이번 달 사용량이 많아졌어요"
                        : "이번 달도 여유 있게 사용 중이에요"}
                  </span>
                  {usage.usagePercent !== null && (
                    <span className="wght-620 tabular-nums text-[var(--color-apple-muted)]">
                      {Math.round(usage.usagePercent)}%
                    </span>
                  )}
                </div>
                {usage.usagePercent !== null && (
                  <div
                    role="progressbar"
                    aria-label="이번 달 AI 사용량"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(usage.usagePercent)}
                    className="mt-2.5 h-2 overflow-hidden rounded-full bg-[var(--color-apple-pearl)]"
                  >
                    <div
                      className={`h-full rounded-full transition-[width] ${
                        usage.limitReached
                          ? "bg-[var(--color-urgent)]"
                          : "bg-[var(--color-apple-action)]"
                      }`}
                      style={{ width: `${Math.max(2, usage.usagePercent)}%` }}
                    />
                  </div>
                )}
                <p className="mt-2 text-[10.5px] leading-[1.5] wght-450 text-[var(--color-apple-muted)]">
                  매달 1일 초기화돼요. 요약, 문제 생성, 질문, 시간표 인식을 합산합니다.
                </p>
              </div>

              {usage.breakdown.length > 0 && (
                <ul className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {usage.breakdown.slice(0, 6).map((item) => (
                    <li
                      key={item.tool}
                      className="rounded-[10px] bg-[var(--color-apple-pearl)] px-3 py-3"
                    >
                      <span className="block truncate text-[10.5px] wght-500 text-[var(--color-apple-muted)]">
                        {item.label}
                      </span>
                      <span className="mt-1 block text-[15px] wght-650 tabular-nums text-[var(--color-apple-ink)]">
                        {item.calls}회
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="mt-7 rounded-[12px] bg-[var(--color-apple-pearl)] px-4 py-4">
              <p className="text-[12.5px] leading-[1.55] wght-500 text-[var(--color-apple-muted)]">
                사용량을 불러오지 못했어요. 잠시 후 새로고침해서 다시 확인해 주세요.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="mt-5 fade-up fade-up-3">
        <Link
          href="/dashboard/settings/security"
          className="elev-1 group flex items-center gap-4 rounded-[18px] bg-white px-6 py-6 transition-transform hover:-translate-y-0.5 sm:px-8"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#eef7f1] text-[#34885a]">
            <ShieldCheck aria-hidden size={20} strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] wght-650 text-[var(--color-apple-ink)]">
              로그인 및 보안
            </span>
            <span className="mt-1 block text-[11.5px] wght-450 text-[var(--color-apple-muted)]">
              인증 앱, 전체 로그아웃, 계정 삭제
            </span>
          </span>
          <ArrowUpRight
            aria-hidden
            size={17}
            className="shrink-0 text-[var(--color-apple-muted)] transition-colors group-hover:text-[var(--color-apple-action)]"
          />
        </Link>
      </section>

      <section className="mt-5 grid gap-3 fade-up fade-up-3 sm:grid-cols-2">
        <Link
          href="/api/export/calendar"
          download
          className="elev-1 group flex items-center gap-4 rounded-[18px] bg-white px-6 py-6 transition-transform hover:-translate-y-0.5"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#edf4ff] text-[var(--color-apple-action)]">
            <CalendarDays aria-hidden size={20} strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] wght-650 text-[var(--color-apple-ink)]">
              캘린더 내보내기
            </span>
            <span className="mt-1 block text-[11.5px] leading-[1.5] text-[var(--color-apple-muted)]">
              Google·Apple 캘린더에서 여는 ICS 파일
            </span>
          </span>
          <Download aria-hidden size={17} className="text-[var(--color-apple-muted)]" />
        </Link>
        <Link
          href="/api/export/archive"
          download
          className="elev-1 group flex items-center gap-4 rounded-[18px] bg-white px-6 py-6 transition-transform hover:-translate-y-0.5"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#f4f1ff] text-[#6d55b8]">
            <Download aria-hidden size={20} strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] wght-650 text-[var(--color-apple-ink)]">
              내 데이터 받기
            </span>
            <span className="mt-1 block text-[11.5px] leading-[1.5] text-[var(--color-apple-muted)]">
              과목·성적·일정·문제·복습 기록 JSON
            </span>
          </span>
          <Download aria-hidden size={17} className="text-[var(--color-apple-muted)]" />
        </Link>
      </section>
    </AppleShell>
  );
}
