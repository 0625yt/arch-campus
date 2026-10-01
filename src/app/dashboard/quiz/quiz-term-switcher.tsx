"use client";

import { CalendarRange, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { academicTermKey, academicTermLabel, type SemesterTerm } from "@/lib/academic";
import styles from "../campus.module.css";

export function QuizTermSwitcher({
  terms,
  selectedKey,
}: {
  terms: Array<{ year: number; term: SemesterTerm }>;
  selectedKey: string;
}) {
  const router = useRouter();

  return (
    <label className={styles.semesterSwitcher}>
      <CalendarRange size={15} aria-hidden />
      <span className="sr-only">문제를 볼 학기</span>
      <select
        value={selectedKey}
        onChange={(event) => {
          const value = event.target.value;
          router.push(value === "all" ? "/dashboard/quiz" : `/dashboard/quiz?term=${value}`);
        }}
        aria-label="문제를 볼 학기"
      >
        <option value="all">전체 학기</option>
        {terms.map(({ year, term }) => {
          const key = academicTermKey(year, term);
          return (
            <option key={key} value={key}>
              {academicTermLabel(year, term)}
            </option>
          );
        })}
      </select>
      <ChevronDown size={14} aria-hidden />
    </label>
  );
}
