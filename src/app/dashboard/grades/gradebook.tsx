"use client";

import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  BookPlus,
  Check,
  GraduationCap,
  Plus,
  Save,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  academicTermKey,
  academicTermLabel,
  COURSE_GRADES,
  type CourseGrade,
  calculateGpa,
  compareAcademicTerms,
  inferAcademicTerm,
  isCourseInTerm,
  parseAcademicTermKey,
  recentAcademicTerms,
  type SemesterTerm,
} from "@/lib/academic";
import type { CourseListItem } from "@/lib/data/materials";
import styles from "./grades.module.css";

const CREDIT_OPTIONS = Array.from({ length: 12 }, (_, index) => (index + 1) / 2);

export function Gradebook({
  initialCourses,
  selectedKey,
}: {
  initialCourses: CourseListItem[];
  selectedKey: string;
}) {
  const router = useRouter();
  const [courses, setCourses] = useState(initialCourses);
  const [adding, setAdding] = useState(false);
  useEffect(() => setCourses(initialCourses), [initialCourses]);

  const selected = parseAcademicTermKey(selectedKey) ?? inferAcademicTerm();
  const terms = useMemo(() => buildTermOptions(courses, selected), [courses, selected]);
  const termCourses = courses.filter((course) =>
    isCourseInTerm(course, selected.year, selected.term),
  );
  const semester = calculateGpa(termCourses);
  const cumulative = calculateGpa(courses);

  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden />
      <header className={styles.header}>
        <div>
          <Link href={`/dashboard?term=${selectedKey}`} className={styles.backLink}>
            <ArrowLeft size={15} aria-hidden /> 내 캠퍼스
          </Link>
          <p className={styles.eyebrow}>ACADEMIC RECORD</p>
          <h1>내 성적</h1>
          <p className={styles.description}>
            학기별 수강 과목과 학점을 정리하면 4.5 만점 평점을 자동으로 계산해요.
          </p>
        </div>
        <div className={styles.headerActions}>
          <label className={styles.termSelect}>
            <span className="sr-only">조회할 학기</span>
            <select
              value={selectedKey}
              onChange={(event) => router.push(`/dashboard/grades?term=${event.target.value}`)}
            >
              {terms.map(({ year, term }) => {
                const key = academicTermKey(year, term);
                return (
                  <option key={key} value={key}>
                    {academicTermLabel(year, term)}
                  </option>
                );
              })}
            </select>
          </label>
          <button type="button" className={styles.addButton} onClick={() => setAdding((v) => !v)}>
            <Plus size={16} aria-hidden /> 과목 추가
          </button>
        </div>
      </header>

      <section className={styles.summaryGrid} aria-label="성적 요약">
        <SummaryCard
          icon={<BarChart3 size={18} />}
          label="학기 평점"
          value={semester.gpa?.toFixed(2) ?? "—"}
          detail={`${semester.gradedCredits}학점 반영`}
          accent
        />
        <SummaryCard
          icon={<GraduationCap size={18} />}
          label="누적 평점"
          value={cumulative.gpa?.toFixed(2) ?? "—"}
          detail={`${cumulative.gradedCourseCount}개 과목 반영`}
        />
        <SummaryCard
          icon={<Sparkles size={18} />}
          label="이번 학기"
          value={`${semester.registeredCredits}`}
          unit="학점"
          detail={`${semester.earnedCredits}학점 취득`}
        />
      </section>

      {adding && (
        <AddCourseForm
          year={selected.year}
          term={selected.term}
          onCancel={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      )}

      <section className={styles.gradeSection}>
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.sectionKicker}>
              {academicTermLabel(selected.year, selected.term)}
            </p>
            <h2>수강 과목</h2>
          </div>
          <span>{termCourses.length}개</span>
        </div>

        {termCourses.length > 0 ? (
          <div className={styles.courseList}>
            <div className={styles.tableHead} aria-hidden>
              <span>과목</span>
              <span>학점</span>
              <span>등급</span>
              <span />
            </div>
            {termCourses.map((course) => (
              <GradeRow
                key={course.id}
                course={course}
                onSaved={(next) =>
                  setCourses((current) =>
                    current.map((item) => (item.id === next.id ? next : item)),
                  )
                }
              />
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <BookPlus size={27} aria-hidden />
            <h3>이 학기에 등록된 과목이 없어요</h3>
            <p>과목을 직접 추가하거나 학교 시간표를 올리면 한 번에 채워져요.</p>
            <div>
              <button type="button" onClick={() => setAdding(true)}>
                과목 추가
              </button>
              <Link href={`/dashboard/calendar/import?kind=timetable&term=${selectedKey}`}>
                시간표 올리기 <ArrowUpRight size={14} aria-hidden />
              </Link>
            </div>
          </div>
        )}
      </section>

      <p className={styles.footnote}>
        P/NP 과목은 취득학점에만 반영되고 평점 계산에서는 제외돼요. 학교의 성적 규정이 다르면 학교
        학사 시스템을 최종 기준으로 확인해주세요.
      </p>
    </main>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  unit,
  detail,
  accent = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <article className={`${styles.summaryCard} ${accent ? styles.summaryAccent : ""}`}>
      <div className={styles.summaryIcon} aria-hidden>
        {icon}
      </div>
      <p>{label}</p>
      <strong>
        {value} {unit && <small>{unit}</small>}
      </strong>
      <span>{detail}</span>
    </article>
  );
}

function GradeRow({
  course,
  onSaved,
}: {
  course: CourseListItem;
  onSaved: (course: CourseListItem) => void;
}) {
  const [credits, setCredits] = useState(String(course.credits ?? 3));
  const [grade, setGrade] = useState<CourseGrade | "">(course.grade ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save() {
    setStatus("saving");
    try {
      const res = await fetch(`/api/courses/${course.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credits: Number(credits), grade: grade || null }),
      });
      const result = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !result.ok) throw new Error(result.error ?? "저장 실패");
      onSaved({ ...course, credits: Number(credits), grade: grade || null });
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 1800);
    } catch {
      setStatus("error");
    }
  }

  return (
    <article className={styles.courseRow}>
      <div className={styles.courseIdentity}>
        <span style={{ backgroundColor: course.color ?? "#6f86c7" }} aria-hidden />
        <div>
          <strong>{course.name}</strong>
          <p>
            {[course.professor, course.location].filter(Boolean).join(" · ") || "강의 정보 미입력"}
          </p>
        </div>
      </div>
      <label>
        <span className="sr-only">{course.name} 학점</span>
        <select value={credits} onChange={(event) => setCredits(event.target.value)}>
          {CREDIT_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value}학점
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="sr-only">{course.name} 등급</span>
        <select
          value={grade}
          onChange={(event) => setGrade(event.target.value as CourseGrade | "")}
        >
          <option value="">미입력</option>
          {COURSE_GRADES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={save}
        disabled={status === "saving"}
        className={styles.saveButton}
      >
        {status === "saved" ? <Check size={15} /> : <Save size={15} />}
        {status === "saving"
          ? "저장 중"
          : status === "saved"
            ? "저장됨"
            : status === "error"
              ? "다시 저장"
              : "저장"}
      </button>
    </article>
  );
}

function AddCourseForm({
  year,
  term,
  onCancel,
  onCreated,
}: {
  year: number;
  term: SemesterTerm;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [professor, setProfessor] = useState("");
  const [credits, setCredits] = useState("3");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          professor: professor || null,
          category: "semester",
          semesterYear: year,
          semesterTerm: term,
          credits: Number(credits),
        }),
      });
      const result = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !result.ok) throw new Error(result.error ?? "과목을 추가하지 못했어요");
      onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "잠시 후 다시 시도해주세요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.addForm} onSubmit={submit}>
      <div>
        <p>{academicTermLabel(year, term)}</p>
        <h2>수강 과목 추가</h2>
      </div>
      <label>
        <span>과목명</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={60}
        />
      </label>
      <label>
        <span>교수명</span>
        <input
          value={professor}
          onChange={(event) => setProfessor(event.target.value)}
          maxLength={60}
          placeholder="선택"
        />
      </label>
      <label>
        <span>학점</span>
        <select value={credits} onChange={(event) => setCredits(event.target.value)}>
          {CREDIT_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value}학점
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className={styles.formError}>
          {error}
        </p>
      )}
      <div className={styles.formActions}>
        <button type="button" onClick={onCancel} disabled={busy}>
          취소
        </button>
        <button type="submit" disabled={busy}>
          {busy ? "추가 중…" : "과목 추가"}
        </button>
      </div>
    </form>
  );
}

function buildTermOptions(
  courses: CourseListItem[],
  selected: { year: number; term: SemesterTerm },
): Array<{ year: number; term: SemesterTerm }> {
  const map = new Map<string, { year: number; term: SemesterTerm }>();
  for (const value of recentAcademicTerms()) {
    map.set(academicTermKey(value.year, value.term), value);
  }
  map.set(academicTermKey(selected.year, selected.term), selected);
  for (const course of courses) {
    if (!course.semesterYear || !course.semesterTerm) continue;
    const value = { year: course.semesterYear, term: course.semesterTerm };
    map.set(academicTermKey(value.year, value.term), value);
  }
  return [...map.values()].sort(compareAcademicTerms);
}
