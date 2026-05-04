"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BellRing,
  BookOpenCheck,
  CloudUpload,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Arrow, Divider, Dot } from "@/components/primitives";
import { PageFooter, PageShell } from "@/components/page-shell";

type SignalKind = "과제" | "마감" | "팀플" | "공지" | "생활";

interface RadarSignal {
  id: string;
  kind: SignalKind;
  title: string;
  source: string;
  impact: string;
  action: string;
  href: string;
  detail: string;
  urgent?: boolean;
}

const KIND_COLOR: Record<SignalKind, string> = {
  과제: "#7aa6d6",
  마감: "#e0445e",
  팀플: "#7fb38c",
  공지: "#cca06b",
  생활: "#a08bc4",
};

const SIGNALS: RadarSignal[] = [
  {
    id: "r1",
    kind: "과제",
    title: "자료구조 제출 규칙 변경",
    source: "과제 안내 캡처",
    impact: "과제 10%",
    action: "감점 검사",
    href: "/dashboard/today",
    detail: "zip 이름 규칙과 실행 캡처가 추가됐어요. 지금 제출하면 감점될 수 있어요.",
    urgent: true,
  },
  {
    id: "r2",
    kind: "팀플",
    title: "데이터베이스 발표 역할 미정",
    source: "팀플 채팅",
    impact: "5일 뒤 발표",
    action: "역할 나누기",
    href: "/dashboard/tools/presentation",
    detail: "자료 조사 1명, 발표 흐름 1명이 비어 있어요. 오늘 정하지 않으면 내일 회의가 늘어져요.",
  },
  {
    id: "r3",
    kind: "공지",
    title: "SW 장학금 신청 D-3",
    source: "학과 공지",
    impact: "서류 2개",
    action: "체크리스트",
    href: "/dashboard/chat?q=SW%20%EC%9E%A5%ED%95%99%EA%B8%88%20%EC%8B%A0%EC%B2%AD%20%EC%84%9C%EB%A5%98%20%EC%B2%B4%ED%81%AC%EB%A6%AC%EC%8A%A4%ED%8A%B8%20%EC%A0%95%EB%A6%AC%ED%95%B4%EC%A4%98",
    detail: "성적 증명서와 활동 증빙이 필요해요. 마감 전날에 보면 발급 시간이 걸릴 수 있어요.",
  },
  {
    id: "r4",
    kind: "생활",
    title: "점심 시간 학생식당 혼잡 예상",
    source: "생활 패턴",
    impact: "12:10 피하기",
    action: "일정 조정",
    href: "/dashboard/today",
    detail: "운영체제 수업이 11:50에 끝나요. 12:25 이후로 밀면 20분 정도 아낄 수 있어요.",
  },
  {
    id: "r5",
    kind: "마감",
    title: "운영체제 중간고사 D-4",
    source: "강의계획서",
    impact: "평가 30%",
    action: "8분 브리핑",
    href: "/dashboard/study/%EC%9A%B4%EC%98%81%EC%B2%B4%EC%A0%9C/process-sync",
    detail: "동기화와 데드락이 범위에 같이 잡혔어요. 지금은 개념 연결부터 잡는 게 효율적이에요.",
  },
];

const RULES: {
  label: string;
  title: string;
  meta: string;
  icon: LucideIcon;
}[] = [
  { label: "수업 전", title: "30분 전 브리핑", meta: "읽을 자료 1개만", icon: BookOpenCheck },
  { label: "마감", title: "7일/3일/1일", meta: "초안에서 제출까지", icon: BellRing },
  { label: "팀플", title: "24시간 무응답", meta: "역할 공백 감지", icon: UsersRound },
  { label: "공지", title: "장학금 D-3", meta: "서류 발급 시간 반영", icon: ShieldCheck },
];

const SOURCES = [
  { label: "과제 안내", value: "4개 파일", good: true },
  { label: "학과 공지", value: "오늘 3건", good: true },
  { label: "팀플", value: "확인 2건", warn: true },
  { label: "강의계획서", value: "92% 확실", good: true },
];

export default function CalendarPage() {
  const [fileName, setFileName] = useState<string | null>(null);
  const urgentCount = SIGNALS.filter((signal) => signal.urgent).length;

  return (
    <PageShell width="md">
      <header className="fade-up">
        <p className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          레이더
        </p>
        <h1 className="mt-3 text-[27px] leading-[1.23] wght-700 kerning-tight text-[var(--color-fg-strong)] sm:text-[32px]">
          마감표가 아니라, 캠퍼스에서 놓치면 손해 보는 신호를 잡아요
        </h1>
        <p className="mt-3 max-w-[600px] text-[13.5px] leading-[1.6] wght-450 kerning-tight text-[var(--color-fg-muted)]">
          강의계획서, 과제 안내, 학과 공지, 팀플 메모를 읽고 학생이 지금 확인해야 할 것만 앞으로 꺼내요.
        </p>
      </header>

      <RadarSummary className="mt-7 fade-up fade-up-1" urgentCount={urgentCount} />

      <MainSignal signal={SIGNALS[0]} className="mt-8 fade-up fade-up-2" />

      <section className="mt-8 grid grid-cols-1 gap-4 fade-up fade-up-3 lg:grid-cols-[1.1fr_0.9fr]">
        <RadarFeed signals={SIGNALS.slice(1)} />
        <SourcePanel fileName={fileName} onFileName={setFileName} />
      </section>

      <RulesPanel className="mt-8 fade-up fade-up-4" />

      <SourceHealth className="mt-8 fade-up fade-up-5" />

      <PageFooter>
        넣은 자료는 개인 계정에서만 사용돼요. AI가 애매하게 읽은 신호는 항상 확인 필요로 남겨요.
      </PageFooter>
    </PageShell>
  );
}

function RadarSummary({
  urgentCount,
  className,
}: {
  urgentCount: number;
  className?: string;
}) {
  return (
    <section className={className}>
      <dl className="grid grid-cols-3 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]">
        <SummaryCell label="오늘 신호" value="5" />
        <SummaryCell label="확인 필요" value={urgentCount} urgent />
        <SummaryCell label="읽은 소스" value="9" />
      </dl>
    </section>
  );
}

function SummaryCell({
  label,
  value,
  urgent,
}: {
  label: string;
  value: number | string;
  urgent?: boolean;
}) {
  return (
    <div className="border-r border-[var(--color-line)] px-4 py-3 last:border-r-0">
      <dt className="text-[11px] wght-500 kerning-tight text-[var(--color-fg-subtle)]">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 text-[20px] wght-700 kerning-tight tabular-nums",
          urgent ? "text-[var(--color-urgent)]" : "text-[var(--color-fg-strong)]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function MainSignal({
  signal,
  className,
}: {
  signal: RadarSignal;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          지금 놓치면 손해
        </h2>
        <span className="text-[11px] wght-560 kerning-tight text-[var(--color-urgent)]">
          확인 필요
        </span>
      </div>
      <div className="mt-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] p-5 shadow-[var(--shadow-soft)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Dot color={KIND_COLOR[signal.kind]} size={7} />
            <span className="text-[13px] wght-560 kerning-tight text-[var(--color-fg-muted)]">
              {signal.kind} · {signal.source}
            </span>
          </div>
          <span className="rounded-full bg-[var(--color-urgent-soft)] px-2 py-1 text-[10.5px] wght-700 kerning-tight text-[var(--color-urgent)]">
            {signal.impact}
          </span>
        </div>
        <h3 className="mt-4 text-[22px] leading-[1.28] wght-700 kerning-tight text-[var(--color-fg-strong)]">
          {signal.title}
        </h3>
        <p className="mt-2 max-w-[560px] text-[13px] leading-[1.6] wght-450 kerning-tight text-[var(--color-fg-muted)]">
          {signal.detail}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link
            href={signal.href}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-[var(--color-fg-strong)] px-4 text-[13.5px] wght-560 kerning-tight text-white hover:bg-[var(--color-fg)]"
          >
            {signal.action}
          </Link>
          <Link
            href="/dashboard/today"
            className="group inline-flex min-h-[44px] items-center gap-1.5 text-[13px] wght-500 kerning-tight text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
          >
            지금 화면에 고정
            <Arrow className="text-[12px] transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function RadarFeed({ signals }: { signals: RadarSignal[] }) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          다음 신호
        </h2>
        <span className="text-[11px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
          손해 크기순
        </span>
      </div>
      <ul className="mt-3 border-t border-[var(--color-line)]">
        {signals.map((signal) => (
          <li key={signal.id}>
            <Link
              href={signal.href}
              className="group flex gap-3 border-b border-[var(--color-line)] py-4"
            >
              <Dot color={KIND_COLOR[signal.kind]} size={7} className="mt-[7px]" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-[10.5px] wght-700 kerning-tight text-[var(--color-fg-subtle)]">
                    {signal.kind}
                  </span>
                  <span className="text-[10.5px] wght-450 kerning-tight text-[var(--color-fg-disabled)]">
                    {signal.source}
                  </span>
                </div>
                <p className="mt-1 text-[13.5px] leading-[1.35] wght-620 kerning-tight text-[var(--color-fg-strong)]">
                  {signal.title}
                </p>
                <p className="mt-1 line-clamp-2 text-[12.5px] leading-[1.5] wght-450 kerning-tight text-[var(--color-fg-muted)]">
                  {signal.detail}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end justify-between gap-2">
                <span className="text-[10.5px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
                  {signal.impact}
                </span>
                <span className="inline-flex items-baseline gap-1 text-[11.5px] wght-560 kerning-tight text-[var(--color-fg-muted)] group-hover:text-[var(--color-fg)]">
                  {signal.action}
                  <Arrow className="text-[10px] transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SourcePanel({
  fileName,
  onFileName,
}: {
  fileName: string | null;
  onFileName: (name: string | null) => void;
}) {
  const [over, setOver] = useState(false);

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          자료 넣기
        </h2>
        <span className="text-[11px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
          수동 업데이트
        </span>
      </div>
      <label
        htmlFor="radar-source-upload"
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          const file = event.dataTransfer.files?.[0];
          if (file) onFileName(file.name);
        }}
        className={cn(
          "mt-3 block cursor-pointer rounded-xl border border-dashed p-4 transition-colors sm:p-5",
          over
            ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
            : "border-[var(--color-line-strong)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-strong)]",
        )}
      >
        <input
          id="radar-source-upload"
          type="file"
          accept=".pdf,.hwpx,.hwp,.png,.jpg,.jpeg"
          className="sr-only"
          onChange={(event) => onFileName(event.target.files?.[0]?.name ?? null)}
        />
        <CloudUpload
          size={18}
          strokeWidth={1.8}
          className="text-[var(--color-fg-subtle)]"
          aria-hidden
        />
        <p className="mt-3 text-[14px] leading-[1.35] wght-700 kerning-tight text-[var(--color-fg-strong)]">
          {fileName ?? "강의계획서·과제 안내·학과 공지 한 번에 읽기"}
        </p>
        <p className="mt-1 text-[12.5px] leading-[1.55] wght-450 kerning-tight text-[var(--color-fg-muted)]">
          {fileName
            ? "새 신호를 찾고 있어요. 애매한 항목은 자동 등록하지 않고 확인 목록에 남겨요."
            : "파일을 올리거나 캡처를 넣으면 마감, 제출 규칙, 장학금, 팀플 신호를 분리해요."}
        </p>
        <Divider className="my-4" />
        <div className="flex flex-wrap items-center gap-1.5">
          {["PDF", "HWPX", "과제 캡처", "학과 공지"].map((item) => (
            <span
              key={item}
              className="rounded-full border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1 text-[10.5px] wght-560 kerning-tight text-[var(--color-fg-subtle)]"
            >
              {item}
            </span>
          ))}
        </div>
      </label>
    </section>
  );
}

function RulesPanel({ className }: { className?: string }) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          자동으로 챙길 규칙
        </h2>
        <span className="text-[11px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
          학생용 기본값
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {RULES.map((rule) => {
          const Icon = rule.icon;
          return (
            <div
              key={rule.label}
              className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10.5px] wght-700 kerning-tight text-[var(--color-fg-subtle)]">
                  {rule.label}
                </span>
                <Icon size={14} strokeWidth={2} className="text-[var(--color-fg-subtle)]" />
              </div>
              <p className="mt-2 text-[13px] leading-[1.25] wght-700 kerning-tight text-[var(--color-fg-strong)]">
                {rule.title}
              </p>
              <p className="mt-1 truncate text-[11px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
                {rule.meta}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SourceHealth({ className }: { className?: string }) {
  return (
    <section className={className}>
      <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
        오늘 읽은 캠퍼스
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
        {SOURCES.map((source) => (
          <div
            key={source.label}
            className="border-y border-[var(--color-line)] py-3 sm:border-y-0 sm:border-l sm:py-1 sm:pl-4 first:sm:border-l-0 first:sm:pl-0"
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  source.warn ? "bg-[var(--color-warn)]" : "bg-[var(--color-accent)]",
                )}
                aria-hidden
              />
              <p className="text-[11px] wght-500 kerning-tight text-[var(--color-fg-subtle)]">
                {source.label}
              </p>
            </div>
            <p
              className={cn(
                "mt-1 text-[13px] wght-560 kerning-tight",
                source.warn ? "text-[var(--color-warn)]" : "text-[var(--color-fg)]",
              )}
            >
              {source.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
