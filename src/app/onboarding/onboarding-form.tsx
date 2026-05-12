"use client";

import { useActionState } from "react";
import type { OnboardingState } from "./actions";

const TERM_LABEL: Record<"spring" | "fall", string> = {
  spring: "봄학기 (1학기)",
  fall: "가을학기 (2학기)",
};

export function OnboardingForm({
  action,
  defaultEmail,
  defaultDisplayName,
  defaultSemesterYear,
  defaultSemesterTerm,
}: {
  action: (prev: OnboardingState, formData: FormData) => Promise<OnboardingState>;
  defaultEmail: string;
  defaultDisplayName: string;
  defaultSemesterYear: number;
  defaultSemesterTerm: "spring" | "fall";
}) {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(action, undefined);

  return (
    <form action={formAction} className="mt-10 flex flex-col gap-7">
      <Field label="표시 이름">
        <input
          type="text"
          name="displayName"
          defaultValue={defaultDisplayName || defaultEmail.split("@")[0]}
          placeholder="이름 또는 닉네임"
          className={inputClass}
          maxLength={40}
        />
      </Field>

      <Field label="학교" required>
        <input
          type="text"
          name="university"
          required
          placeholder="예: 한국대학교"
          className={inputClass}
          maxLength={60}
        />
      </Field>

      <Field label="전공" required>
        <input
          type="text"
          name="department"
          required
          placeholder="예: 컴퓨터공학과"
          className={inputClass}
          maxLength={60}
        />
      </Field>

      <Field label="학년" required>
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((y) => (
            <YearChip key={y} year={y} />
          ))}
        </div>
      </Field>

      <Field label="이번 학기">
        <div className="flex gap-2">
          <input
            type="number"
            name="semesterYear"
            defaultValue={defaultSemesterYear}
            min={2020}
            max={2099}
            className={`${inputClass} flex-1`}
          />
          <select
            name="semesterTerm"
            defaultValue={defaultSemesterTerm}
            className={`${inputClass} flex-[1.4]`}
          >
            <option value="spring">{TERM_LABEL.spring}</option>
            <option value="fall">{TERM_LABEL.fall}</option>
          </select>
        </div>
      </Field>

      {state?.error && (
        <p className="text-[13px] wght-450 text-[var(--color-urgent)]">{state.error}</p>
      )}

      <div className="mt-2 flex flex-col gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-[52px] items-center justify-center rounded-full bg-[var(--color-apple-action)] text-[15px] wght-560 text-white transition-all hover:bg-[var(--color-apple-action-hover)] active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? "저장 중…" : "시작하기 →"}
        </button>
        <p className="text-center text-[12px] wght-450 text-[var(--color-apple-muted)]">
          수강 과목은 시간표 또는 강의계획서를 올리면 자동으로 채워져요.
        </p>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-center gap-1.5 text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
        {label}
        {required && <span className="text-[var(--color-urgent)]">*</span>}
      </span>
      {children}
    </label>
  );
}

function YearChip({ year }: { year: number }) {
  return (
    <label className="relative">
      <input type="radio" name="year" value={year} required className="peer sr-only" />
      <span className="flex h-[52px] cursor-pointer items-center justify-center rounded-[12px] border border-[var(--color-apple-hairline)] bg-white text-[14px] wght-560 text-[var(--color-apple-ink)] transition-all hover:border-[var(--color-apple-action)] peer-checked:border-[var(--color-apple-action)] peer-checked:bg-[var(--color-apple-action)] peer-checked:text-white">
        {year}학년
      </span>
    </label>
  );
}

const inputClass =
  "h-[52px] rounded-[12px] border border-[var(--color-apple-hairline)] bg-white px-4 text-[15px] wght-450 text-[var(--color-apple-ink)] transition-all placeholder:text-[var(--color-apple-muted)] focus:border-[var(--color-apple-action)] focus:outline-none";
