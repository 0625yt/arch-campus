"use client";

import { useState, type DragEvent } from "react";
import { Check, ChevronDown, CloudUpload, FileUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dot } from "@/components/primitives";
import { COURSE_COLOR } from "@/app/dashboard/study/data";

const CATEGORIES = [
  { label: "과제 안내", meta: "제출 형식·감점 조건" },
  { label: "강의계획서", meta: "평가 비중·시험 일정" },
  { label: "공지 / 학사", meta: "장학금·행사·일정" },
  { label: "시험 범위", meta: "공부 우선순위" },
  { label: "팀플 메모", meta: "역할·회의·마감" },
  { label: "기타 자료", meta: "AI가 분류 보조" },
] as const;

const COURSES = ["자료구조", "운영체제", "데이터베이스", "알고리즘", "새 과목"] as const;

const GOALS = [
  "오늘 할 일 만들기",
  "마감일 찾기",
  "제출 조건 확인",
  "시험 범위 정리",
  "팀플 역할 정리",
] as const;

export function UploadIntake({ className }: { className?: string }) {
  const [over, setOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["label"]>("과제 안내");
  const [course, setCourse] = useState<(typeof COURSES)[number]>("자료구조");
  const [goal, setGoal] = useState<(typeof GOALS)[number]>("오늘 할 일 만들기");

  function onDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setOver(true);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) setFileName(file.name);
  }

  return (
    <section
      className={cn(
        "rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-soft)] sm:p-5",
        className,
      )}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] wght-700 kerning-tight text-[var(--color-accent)]">
              <FileUp size={13} strokeWidth={2.1} />
              자료 올리기
            </span>
            <span className="text-[11px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
              PDF · HWPX · 이미지 · 문서
            </span>
          </div>
          <h2 className="mt-4 max-w-[420px] text-[24px] leading-[1.18] wght-700 kerning-tight text-[var(--color-fg-strong)] sm:text-[28px]">
            먼저 자료를 넣으면, 오늘 할 일이 살아나요
          </h2>
          <p className="mt-3 max-w-[460px] text-[13px] leading-[1.6] wght-450 kerning-tight text-[var(--color-fg-muted)]">
            파일만 올리는 게 아니라 자료 종류, 과목, 목적까지 같이 정하면 마감과 제출 조건을 바로
            대시보드에 꽂을 수 있어요.
          </p>

          <label
            htmlFor="campus-upload"
            onDragOver={onDragOver}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
            className={cn(
              "mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-dashed px-4 py-4 transition-colors",
              over
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                : "border-[var(--color-line-strong)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-strong)]",
            )}
          >
            <input
              id="campus-upload"
              type="file"
              accept=".pdf,.hwpx,.hwp,.pptx,.docx,.txt,.md,.png,.jpg,.jpeg"
              className="sr-only"
              onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
            />
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-bg)] text-[var(--color-fg-muted)]">
              <CloudUpload size={18} strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] wght-700 kerning-tight text-[var(--color-fg-strong)]">
                {fileName ?? "클릭하거나 끌어다 놓기"}
              </span>
              <span className="mt-1 block text-[12px] leading-[1.45] wght-450 kerning-tight text-[var(--color-fg-muted)]">
                {fileName
                  ? "이 자료를 어떤 맥락으로 읽을지 오른쪽에서 확인해요."
                  : "과제 안내 캡처, 강의계획서 PDF, 학과 공지 링크를 먼저 넣어보세요."}
              </span>
            </span>
          </label>
        </div>

        <div className="grid gap-4">
          <ChoiceBlock label="자료 종류">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CATEGORIES.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setCategory(item.label)}
                  className={cn(
                    "min-h-[74px] rounded-lg border px-3 py-3 text-left transition-colors",
                    category === item.label
                      ? "border-[var(--color-fg-strong)] bg-[var(--color-bg)]"
                      : "border-[var(--color-line)] bg-[var(--color-surface)] hover:border-[var(--color-line-strong)]",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] wght-700 kerning-tight text-[var(--color-fg-strong)]">
                      {item.label}
                    </span>
                    {category === item.label && (
                      <Check size={14} strokeWidth={2.3} className="text-[var(--color-fg)]" />
                    )}
                  </span>
                  <span className="mt-1 block text-[10.5px] leading-[1.35] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
                    {item.meta}
                  </span>
                </button>
              ))}
            </div>
          </ChoiceBlock>

          <div className="grid gap-4 sm:grid-cols-2">
            <ChoiceBlock label="과목">
              <div className="flex flex-wrap gap-1.5">
                {COURSES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCourse(item)}
                    className={cn(
                      "inline-flex min-h-[34px] items-center gap-1.5 rounded-full border px-3 text-[11.5px] wght-560 kerning-tight transition-colors",
                      course === item
                        ? "border-[var(--color-fg-strong)] bg-[var(--color-fg-strong)] text-white"
                        : "border-[var(--color-line)] bg-[var(--color-bg)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
                    )}
                  >
                    {item !== "새 과목" && (
                      <Dot color={COURSE_COLOR[item]} size={5} className={course === item ? "bg-white" : undefined} />
                    )}
                    {item}
                  </button>
                ))}
              </div>
            </ChoiceBlock>

            <ChoiceBlock label="찾을 것">
              <button
                type="button"
                className="flex min-h-[34px] w-full items-center justify-between gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-3 text-left text-[11.5px] wght-560 kerning-tight text-[var(--color-fg)]"
              >
                {goal}
                <ChevronDown size={14} strokeWidth={2} className="text-[var(--color-fg-subtle)]" />
              </button>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {GOALS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setGoal(item)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[10.5px] wght-560 kerning-tight transition-colors",
                      goal === item
                        ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                        : "border-[var(--color-line)] bg-[var(--color-bg)] text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]",
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </ChoiceBlock>
          </div>

          <button
            type="button"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[var(--color-fg-strong)] px-4 text-[13.5px] wght-700 kerning-tight text-white transition-colors hover:bg-[var(--color-fg)]"
          >
            자료 분석 시작
          </button>
        </div>
      </div>
    </section>
  );
}

function ChoiceBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] wght-700 kerning-tight text-[var(--color-fg-subtle)]">
        {label}
      </p>
      {children}
    </div>
  );
}
