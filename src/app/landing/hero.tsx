import Link from "next/link";

export function LandingHero({ startHref, startLabel }: { startHref: string; startLabel: string }) {
  return (
    <section
      className="relative isolate overflow-hidden border-b"
      style={{ borderColor: "var(--color-landing-hairline)" }}
    >
      <HeroBackdrop />

      <div className="relative z-10 mx-auto grid max-w-[1180px] grid-cols-1 gap-11 px-5 pb-16 pt-12 sm:px-8 sm:pb-20 sm:pt-16 md:grid-cols-[0.94fr_1.06fr] md:items-center md:gap-10 lg:gap-16 lg:px-12 lg:pb-24 lg:pt-24">
        {/* 좌측 카피 */}
        <div className="fade-up fade-up-1 flex flex-col justify-center">
          <p
            className="border-l-2 border-[var(--color-apple-action)] pl-3 text-[12px] wght-700"
            style={{ color: "var(--color-landing-text-muted)" }}
          >
            일정 / 자료 / 기출 / 복습 / AI를 한곳에
          </p>

          <h1
            className="mt-6 max-w-[640px] text-[40px] leading-[1.04] wght-700 min-[420px]:text-[44px] sm:text-[58px] md:text-[48px] lg:text-[60px] xl:text-[64px]"
            style={{
              color: "var(--color-landing-text-strong)",
              letterSpacing: "-0.022em",
            }}
          >
            <span className="block whitespace-nowrap">마감은 놓치지 않고</span>
            <span style={{ color: "var(--color-apple-action)" }}>시험공부는</span>
            <br />
            미루지 않게
          </h1>

          <p
            className="mt-6 max-w-[540px] break-keep text-[15px] leading-[1.6] wght-450 sm:text-[17px]"
            style={{ color: "var(--color-landing-text-muted)" }}
          >
            강의계획서에서는 시험·과제 일정을 찾고, PDF에서는 출처가 연결된 요약과 문제를 만듭니다.
            원문 페이지, 만든 문제, 남은 오답까지 한 자료 안에서 이어서 공부하세요
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={startHref}
              className="spring-press inline-flex min-h-[52px] items-center justify-center rounded-[10px] bg-[var(--color-landing-text-strong)] px-7 text-[14px] wght-700 transition-opacity hover:opacity-85"
              style={{ color: "var(--color-landing-bg)", letterSpacing: "-0.012em" }}
            >
              {startLabel}
            </Link>
            <a
              href="#product"
              className="spring-press inline-flex min-h-[52px] items-center justify-center rounded-[10px] border px-7 text-[14px] wght-620 backdrop-blur-xl transition-all"
              style={{
                borderColor: "var(--color-landing-hairline)",
                background: "var(--color-landing-card)",
                color: "var(--color-landing-text-strong)",
                letterSpacing: "-0.012em",
              }}
            >
              실제 제품 화면 보기
            </a>
          </div>

          <p
            className="mt-5 text-[12.5px] wght-450"
            style={{ color: "var(--color-landing-text-muted)" }}
          >
            현재 베타 무료 · 구글 또는 이메일 가입 · 카드 등록 없음
          </p>

          <div
            className="mt-7 hidden grid-cols-3 border-y text-[11.5px] leading-[1.45] wght-560 md:grid"
            style={{
              borderColor: "var(--color-landing-hairline)",
              color: "var(--color-landing-text-muted)",
            }}
          >
            <span className="py-3 pr-3">일정 후보를 확인한 뒤 저장</span>
            <span
              className="border-x px-3 py-3"
              style={{ borderColor: "var(--color-landing-hairline)" }}
            >
              자료 안 근거로 문제 검사
            </span>
            <span className="py-3 pl-3">과목별 자료와 복습 누적</span>
          </div>
        </div>

        {/* 우측 라이브 미니 시간표 */}
        <div
          className="fade-up fade-up-2 relative flex items-center justify-center"
          style={{ animationDelay: "240ms" }}
        >
          <HeroLiveTimetable />
        </div>
      </div>
    </section>
  );
}

function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--color-apple-action) 7%, var(--color-landing-bg)) 0%, var(--color-landing-bg) 58%)",
        }}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
 * HeroLiveTimetable — 라이브 미니 시간표 카드.
 * 가짜 데이터 4 강의, 현재 시각 따라 "지금 강의" now-glow.
 * ────────────────────────────────────────────────────────── */

interface FakeCourse {
  name: string;
  day: 0 | 1 | 2 | 3 | 4;
  start: number; // 0~23 (시간 단위)
  end: number;
  color: string;
}

const FAKE_COURSES: FakeCourse[] = [
  { name: "자료구조", day: 0, start: 9, end: 11, color: "#e0445e" },
  { name: "운영체제", day: 1, start: 10, end: 12, color: "#7fb38c" },
  { name: "DB", day: 2, start: 13, end: 15, color: "#7aa6d6" },
  { name: "알고리즘", day: 3, start: 9, end: 11, color: "#cca06b" },
  { name: "통계학", day: 4, start: 14, end: 16, color: "#a08bc4" },
];

const DAYS = ["월", "화", "수", "목", "금"];
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17];

function HeroLiveTimetable() {
  // 공개 랜딩의 예시 화면은 서버에서 안정적으로 렌더한다. 실제 사용자의
  // 현재 시간표는 로그인 후 대시보드에서 계산한다.
  const now = {
    day: 0,
    hour: 10,
  } as const;

  const isNow = (c: FakeCourse) => c.day === now.day && now.hour >= c.start && now.hour < c.end;

  return (
    <div
      className="relative w-full max-w-[540px] overflow-hidden rounded-[16px] border p-4 backdrop-blur-xl sm:p-5"
      style={{
        borderColor: "var(--color-landing-hairline)",
        background: "var(--color-landing-card)",
        boxShadow:
          "0 1px 2px rgba(20,20,20,0.04), 0 18px 48px -32px color-mix(in oklab, var(--color-landing-text-strong) 22%, transparent)",
      }}
    >
      <div
        className="flex items-center justify-between gap-4 border-b pb-4"
        style={{ borderColor: "var(--color-landing-hairline)" }}
      >
        <div className="border-l-2 border-[var(--color-apple-action)] pl-3">
          <span
            className="block text-[12.5px] wght-700"
            style={{
              color: "var(--color-landing-text-strong)",
              letterSpacing: "-0.012em",
            }}
          >
            강의계획서.pdf
          </span>
          <span
            className="mt-1 block text-[10px] wght-450"
            style={{ color: "var(--color-landing-text-muted)" }}
          >
            시험·과제·발표 일정 후보를 찾았어요
          </span>
        </div>
        <span
          className="shrink-0 rounded-[8px] px-2.5 py-1.5 text-[10px] wght-700"
          style={{
            background: "var(--color-apple-action-soft)",
            color: "var(--color-landing-action-ink)",
          }}
        >
          확인 후 저장
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span
          className="text-[11px] wght-700"
          style={{ color: "var(--color-landing-text-strong)" }}
        >
          내 캠퍼스 · 이번 주
        </span>
        <span
          className="text-[10px] wght-560 tracking-[0.06em]"
          style={{ color: "var(--color-landing-text-muted)" }}
        >
          예시 화면
        </span>
      </div>

      {/* 시간표 grid */}
      <div className="mt-2 grid grid-cols-[28px_repeat(5,minmax(0,1fr))] gap-px overflow-hidden rounded-[10px]">
        {/* 헤더 row */}
        <div />
        {DAYS.map((d, i) => (
          <div
            key={d}
            className="py-1.5 text-center text-[10px] wght-700"
            style={{
              color:
                i === now.day ? "var(--color-apple-action)" : "var(--color-landing-text-muted)",
              background: "var(--color-landing-card-strong)",
            }}
          >
            {d}
          </div>
        ))}
        {/* 시간 row들 */}
        {HOURS.map((h) => (
          <Row key={h} hour={h} currentDay={now.day} currentHour={now.hour} isNow={isNow} />
        ))}
      </div>

      {/* 카드 footer — 오늘 강의 */}
      <div className="mt-3 flex items-center gap-2">
        {FAKE_COURSES.filter((c) => c.day === now.day).map((c) => (
          <span
            key={c.name}
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10.5px] wght-620"
            style={{
              background: `color-mix(in oklab, ${c.color} 14%, var(--color-landing-card-strong))`,
              color: "var(--color-landing-text-strong)",
            }}
          >
            <span className="h-3 w-0.5 rounded-full" style={{ background: c.color }} />
            {c.name}
          </span>
        ))}
        {FAKE_COURSES.filter((c) => c.day === now.day).length === 0 && (
          <span
            className="text-[10.5px] wght-450"
            style={{ color: "var(--color-landing-text-muted)" }}
          >
            오늘 강의 없음
          </span>
        )}
      </div>

      <div
        className="mt-4 flex items-center justify-between rounded-[12px] border px-3.5 py-3"
        style={{
          borderColor: "var(--color-landing-hairline)",
          background: "var(--color-landing-card-strong)",
        }}
      >
        <div>
          <p className="text-[10px] wght-620" style={{ color: "var(--color-apple-action)" }}>
            지금 먼저 할 일
          </p>
          <p
            className="mt-1 text-[13px] wght-700"
            style={{ color: "var(--color-landing-text-strong)" }}
          >
            자료구조 과제 제출
          </p>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[10px] wght-700"
          style={{
            background: "var(--color-urgent-soft)",
            color: "var(--color-landing-urgent-ink)",
          }}
        >
          오늘 23:59
        </span>
      </div>
    </div>
  );
}

function Row({
  hour,
  currentDay,
  currentHour,
  isNow,
}: {
  hour: number;
  currentDay: number;
  currentHour: number;
  isNow: (c: FakeCourse) => boolean;
}) {
  return (
    <>
      <div
        className="py-2 text-right pr-1 text-[9px] wght-560 tabular-nums"
        style={{
          color: "var(--color-landing-text-muted)",
          background: "var(--color-landing-card-strong)",
        }}
      >
        {hour}
      </div>
      {[0, 1, 2, 3, 4].map((d) => {
        const c = FAKE_COURSES.find((x) => x.day === d && hour >= x.start && hour < x.end);
        const isCurrentCell = d === currentDay && hour === currentHour;
        if (!c) {
          return (
            <div
              key={d}
              className="min-h-[24px]"
              style={{
                background: isCurrentCell
                  ? "color-mix(in oklab, var(--color-apple-action) 10%, var(--color-landing-card-strong))"
                  : "var(--color-landing-card-strong)",
              }}
            />
          );
        }
        const showLabel = hour === c.start;
        const nowCourse = isNow(c);
        return (
          <div
            key={d}
            className={`min-h-[24px] px-1.5 py-1 ${nowCourse ? "now-glow" : ""}`}
            style={{
              background: `color-mix(in oklab, ${c.color} ${nowCourse ? 24 : 14}%, var(--color-landing-card-strong))`,
              borderLeft: `2px solid ${c.color}`,
            }}
          >
            {showLabel && (
              <span
                className="text-[9.5px] wght-620"
                style={{ color: "var(--color-landing-text-strong)" }}
              >
                {c.name}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}
