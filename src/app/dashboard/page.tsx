import Link from "next/link";
import {
  BellRing,
  CalendarCheck2,
  ClipboardCheck,
  Gauge,
  UsersRound,
} from "lucide-react";
import { Arrow, Dot } from "@/components/primitives";
import { PageShell } from "@/components/page-shell";
import { COURSE_COLOR } from "@/app/dashboard/study/data";

const TODAY_SIGNALS = [
  {
    label: "과제 안내",
    title: "자료구조 과제 제출 규칙이 바뀌었어요",
    meta: "파일명 형식 확인 필요 · 감점 가능",
    href: "/dashboard/calendar",
    urgent: true,
  },
  {
    label: "수업 전",
    title: "운영체제 5주차 전에 8분 브리핑",
    meta: "교착 상태 4조건 · 교수님 강조",
    href: "/dashboard/study/운영체제/process-sync",
    urgent: false,
  },
  {
    label: "팀플",
    title: "데이터베이스 발표 역할 1개가 비어 있어요",
    meta: "정규화 사례 조사 · 오늘 19:00 전",
    href: "/dashboard/tools",
    urgent: false,
  },
] as const;

const CAMPUS_RADAR = [
  {
    icon: ClipboardCheck,
    title: "오늘 막을 점수",
    meta: "자료구조 과제 10%",
    value: "10%",
    href: "/dashboard/today",
    color: "var(--color-urgent)",
  },
  {
    icon: CalendarCheck2,
    title: "확인 필요한 공지",
    meta: "과제 안내 2건 · 학과 공지 1건",
    value: "3",
    href: "/dashboard/calendar",
    color: "var(--color-accent)",
  },
  {
    icon: UsersRound,
    title: "팀플 대기",
    meta: "역할 분배·회의록 정리",
    value: "2",
    href: "/dashboard/tools",
    color: COURSE_COLOR["데이터베이스"],
  },
] as const;

export default function DashboardPage() {
  return (
    <PageShell width="wide" className="pb-24 md:pb-20">
      <header className="fade-up">
        <p className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          내 캠퍼스
        </p>
        <h1 className="mt-3 max-w-[720px] text-[28px] leading-[1.18] wght-700 kerning-tight text-[var(--color-fg-strong)] sm:text-[36px]">
          강의계획서, 과제 안내, 학과 공지, 팀플 메모를 모아 오늘 손해 볼 일을 먼저 꺼내요
        </h1>
        <p className="mt-3 max-w-[620px] text-[13.5px] leading-[1.65] wght-450 kerning-tight text-[var(--color-fg-muted)]">
          자동 연결을 전제로 하지 않아요. 학생이 직접 올리는 PDF, 캡처, 텍스트, 공유 링크만으로
          마감과 감점 위험, 팀플 공백, 수업 전 준비를 정리합니다.
        </p>
      </header>

      <section className="mt-7 grid grid-cols-2 gap-2 fade-up fade-up-1 sm:grid-cols-4">
        <Metric label="가져온 자료" value="14" unit="건" />
        <Metric label="오늘 행동" value="3" unit="개" urgent />
        <Metric label="확인 필요" value="2" unit="건" />
        <Metric label="절약 예상" value="43" unit="분" />
      </section>

      <InputBoard className="mt-8 fade-up fade-up-2" />

      <section className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <TodayCommand />
        <RadarBoard />
      </section>

      <CampusLoop className="mt-10 fade-up fade-up-4" />
    </PageShell>
  );
}

function Metric({
  label,
  value,
  unit,
  urgent,
}: {
  label: string;
  value: string;
  unit: string;
  urgent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-4 py-4">
      <p className="text-[11px] wght-500 kerning-tight text-[var(--color-fg-subtle)]">
        {label}
      </p>
      <p
        className={
          urgent
            ? "mt-1 text-[24px] leading-none wght-700 kerning-tight tabular-nums text-[var(--color-urgent)]"
            : "mt-1 text-[24px] leading-none wght-700 kerning-tight tabular-nums text-[var(--color-fg-strong)]"
        }
      >
        {value}
        <span className="ml-0.5 text-[12px] wght-450 text-[var(--color-fg-muted)]">
          {unit}
        </span>
      </p>
    </div>
  );
}

function TodayCommand() {
  return (
    <section className="fade-up fade-up-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          지금 먼저 잡은 것
        </h2>
        <Link
          href="/dashboard/today"
          className="group inline-flex items-baseline gap-1 text-[11.5px] wght-500 kerning-tight text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
        >
          지금 화면
          <Arrow className="text-[11px] transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      <div className="mt-3 rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-bg)] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-urgent-soft)] text-[var(--color-urgent)]">
            <BellRing size={17} strokeWidth={2.1} />
          </span>
          <span className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-muted)]">
            지금 처리하면 손해를 줄이는 일
          </span>
        </div>
        <h3 className="mt-4 text-[23px] leading-[1.25] wght-700 kerning-tight text-[var(--color-fg-strong)]">
          자료구조 제출 규칙 변경 때문에 감점 위험이 생겼어요
        </h3>
        <p className="mt-2 text-[13px] leading-[1.6] wght-450 kerning-tight text-[var(--color-fg-muted)]">
          학생이 올린 과제 안내에서 파일명 형식과 예외 케이스 설명 요구가 추가된 걸 잡았어요.
          오늘 화면에서 제출 전 검사까지 바로 이어가면 됩니다.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/dashboard/today"
            className="inline-flex min-h-[42px] items-center rounded-lg bg-[var(--color-fg-strong)] px-4 text-[13px] wght-560 kerning-tight text-white hover:bg-[var(--color-fg)]"
          >
            지금 처리
          </Link>
          <Link
            href="/dashboard/calendar"
            className="inline-flex min-h-[42px] items-center rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-bg)] px-4 text-[13px] wght-560 kerning-tight text-[var(--color-fg)] hover:bg-[var(--color-surface)]"
          >
            근거 보기
          </Link>
        </div>
      </div>

      <ul className="mt-4 border-t border-[var(--color-line)]">
        {TODAY_SIGNALS.map((signal) => (
          <li key={signal.title}>
            <SignalRow signal={signal} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SignalRow({ signal }: { signal: (typeof TODAY_SIGNALS)[number] }) {
  return (
    <Link
      href={signal.href}
      className="row-shift group flex items-baseline gap-3 border-b border-[var(--color-line)] py-3.5"
    >
      <span
        className={
          signal.urgent
            ? "w-[58px] shrink-0 text-[10.5px] wght-700 kerning-tight text-[var(--color-urgent)]"
            : "w-[58px] shrink-0 text-[10.5px] wght-560 kerning-tight text-[var(--color-fg-subtle)]"
        }
      >
        {signal.label}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] wght-620 kerning-tight text-[var(--color-fg-strong)]">
          {signal.title}
        </span>
        <span className="mt-0.5 block truncate text-[11.5px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
          {signal.meta}
        </span>
      </span>
      <Arrow className="reveal-right text-[12px] text-[var(--color-fg-subtle)]" />
    </Link>
  );
}

function RadarBoard() {
  return (
    <section className="fade-up fade-up-2">
      <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
        캠퍼스 레이더
      </h2>
      <ul className="mt-3 overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)]">
        {CAMPUS_RADAR.map((row) => {
          const Icon = row.icon;
          return (
            <li key={row.title} className="border-b border-[var(--color-line)] last:border-b-0">
              <Link
                href={row.href}
                className="group block px-4 py-4 transition-colors hover:bg-[var(--color-surface)]"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface)] text-[var(--color-fg-muted)]">
                    <Icon size={16} strokeWidth={2.1} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <Dot color={row.color} size={6} />
                      <span className="truncate text-[13.5px] wght-700 kerning-tight text-[var(--color-fg-strong)]">
                        {row.title}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-[11.5px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
                      {row.meta}
                    </span>
                  </span>
                  <span className="text-[22px] leading-none wght-700 kerning-tight tabular-nums text-[var(--color-fg-strong)]">
                    {row.value}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function InputBoard({ className }: { className?: string }) {
  const modes = [
    { label: "학기 뼈대", title: "강의계획서 PDF", meta: "시험·과제·평가 비중" },
    { label: "감점 방지", title: "과제 안내 캡처", meta: "제출 형식·주의사항" },
    { label: "생활 신호", title: "공지 링크·팀플 메모", meta: "장학금·회의·역할 공백" },
  ];

  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          지금 넣을 수 있는 자료
        </h2>
        <span className="text-[11px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
          수동 입력 기준
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] sm:grid-cols-3">
        {modes.map((mode) => (
          <div
            key={mode.label}
            className="border-b border-[var(--color-line)] px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
          >
            <p className="text-[10.5px] wght-700 kerning-tight text-[var(--color-fg-subtle)]">
              {mode.label}
            </p>
            <p className="mt-1 text-[13.5px] leading-[1.35] wght-700 kerning-tight text-[var(--color-fg-strong)]">
              {mode.title}
            </p>
            <p className="mt-1 text-[11.5px] leading-[1.45] wght-450 kerning-tight text-[var(--color-fg-muted)]">
              {mode.meta}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CampusLoop({ className }: { className?: string }) {
  const steps = [
    { label: "넣기", title: "PDF·캡처·텍스트·공유 링크" },
    { label: "판단", title: "학점·마감·팀플 영향 계산" },
    { label: "실행", title: "지금 할 일과 도구로 연결" },
  ];

  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          이 앱이 매일 해야 하는 일
        </h2>
        <Gauge size={15} strokeWidth={2} className="text-[var(--color-fg-subtle)]" />
      </div>
      <ol className="mt-3 grid grid-cols-1 overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] sm:grid-cols-3">
        {steps.map((step) => (
          <li key={step.label} className="border-b border-[var(--color-line)] px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
            <p className="text-[11px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
              {step.label}
            </p>
            <p className="mt-1 text-[14px] leading-[1.35] wght-700 kerning-tight text-[var(--color-fg-strong)]">
              {step.title}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
