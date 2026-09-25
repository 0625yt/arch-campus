"use client";

import {
  ArrowDown,
  ArrowUpRight,
  BookOpen,
  CalendarPlus,
  Clock3,
  FileText,
  MapPin,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { type CSSProperties, useMemo, useRef, useState } from "react";
import { AppleShell } from "@/components/apple-shell";
import {
  academicTermKey,
  academicTermLabel,
  compareAcademicTerms,
  isCourseInTerm,
  parseAcademicTermKey,
  type SemesterTerm,
} from "@/lib/academic";
import { courseAccentRgb } from "@/lib/course-palette";
import type { Activity } from "@/lib/data/activity";
import type { CourseListItem } from "@/lib/data/materials";
import { AddPersonalButton } from "./add-personal-button";
import { CourseActionsMenu } from "./course-actions-menu";
import { CourseContextWrapper } from "./course-context-wrapper";
import s from "./study.module.css";

const filters = [
  { id: "all", label: "전체" },
  { id: "semester", label: "선택 학기" },
  { id: "personal", label: "개인 공부" },
] as const;

export function StudyWorkspace({
  courses,
  recent,
}: {
  courses: CourseListItem[];
  recent: Activity[];
}) {
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const termOptions = useMemo(() => collectCourseTerms(courses), [courses]);
  const [selectedTermKey, setSelectedTermKey] = useState(() =>
    termOptions[0] ? academicTermKey(termOptions[0].year, termOptions[0].term) : "",
  );
  const selectedTerm = parseAcademicTermKey(selectedTermKey);
  const totalMaterials = courses.reduce((sum, course) => sum + course.materialCount, 0);
  const normalized = query.trim().toLocaleLowerCase("ko-KR");
  const visible = courses.filter(
    (course) =>
      (course.category === "personal"
        ? filter !== "semester"
        : filter !== "personal" &&
          Boolean(selectedTerm && isCourseInTerm(course, selectedTerm.year, selectedTerm.term))) &&
      [course.name, course.professor, course.location].some((value) =>
        value?.toLocaleLowerCase("ko-KR").includes(normalized),
      ),
  );
  const visibleSemesterCount = courses.filter(
    (course) =>
      course.category === "semester" &&
      Boolean(selectedTerm && isCourseInTerm(course, selectedTerm.year, selectedTerm.term)),
  ).length;
  const personalCount = courses.filter((course) => course.category === "personal").length;
  const latest = recent[0];

  return (
    <AppleShell width="wide" className={s.workspace}>
      <div className={s.topline}>
        <span>공부 공간</span>
        <Link href="/dashboard">
          내 캠퍼스 <ArrowUpRight size={14} aria-hidden />
        </Link>
      </div>
      <header className={s.hero}>
        <div className={s.heroCopy}>
          <p className={s.eyebrow}>
            MY STUDY SPACE <span aria-hidden> / 01</span>
          </p>
          <h1>
            쌓이는 자료가
            <br />
            <span>내 실력이 되는 곳.</span>
          </h1>
          <p className={s.heroDescription}>
            강의마다 한 공간. 자료를 읽고, 질문하고,
            <br className={s.mobileBreak} /> 내 것으로 만드는 공부.
          </p>
          <div className={s.heroActions}>
            <a href="#study-library" className={s.heroButton}>
              내 과목 살펴보기 <ArrowDown size={15} aria-hidden />
            </a>
            <span className={s.heroCount}>
              과목 <b>{courses.length}</b>
              <i aria-hidden />
              자료 <b>{totalMaterials}</b>
            </span>
          </div>
        </div>
        <StudySculpture />
      </header>

      {latest && (
        <Link href={latest.href} className={s.continue}>
          <span className={s.continueIcon}>
            <Clock3 size={18} aria-hidden />
          </span>
          <span className={s.continueBody}>
            <small>마지막 공부에서 이어서</small>
            <strong>{latest.title}</strong>
          </span>
          <span className={s.continueKind}>{latest.kindLabel}</span>
          <ArrowUpRight size={18} aria-hidden />
        </Link>
      )}

      <section id="study-library" className={s.library} aria-labelledby="study-library-title">
        <div className={s.sectionHeading}>
          <div>
            <p className={s.sectionIndex}>YOUR LIBRARY</p>
            <h2 id="study-library-title">
              내 과목 <span>{courses.length.toString().padStart(2, "0")}</span>
            </h2>
          </div>
          <div className={s.libraryActions}>
            <Link
              href={`/dashboard/calendar/import?kind=timetable${selectedTermKey ? `&term=${selectedTermKey}` : ""}`}
            >
              <CalendarPlus size={15} aria-hidden />
              <span>시간표 등록</span>
            </Link>
            <AddPersonalButton variant="ghost" />
          </div>
        </div>
        <div className={s.toolbar}>
          <div className={s.toolbarControls}>
            {termOptions.length > 0 && (
              <label className={s.termPicker}>
                <span className="sr-only">공부할 학기</span>
                <select
                  value={selectedTermKey}
                  onChange={(event) => {
                    setSelectedTermKey(event.target.value);
                    if (filter === "personal") setFilter("semester");
                  }}
                >
                  {termOptions.map(({ year, term }) => {
                    const key = academicTermKey(year, term);
                    return (
                      <option key={key} value={key}>
                        {academicTermLabel(year, term)}
                      </option>
                    );
                  })}
                </select>
              </label>
            )}
            <fieldset className={s.filters} aria-label="과목 분류">
              {filters.map((item) => {
                const count =
                  item.id === "personal"
                    ? personalCount
                    : item.id === "semester"
                      ? visibleSemesterCount
                      : visibleSemesterCount + personalCount;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={filter === item.id}
                    onClick={() => setFilter(item.id)}
                  >
                    {item.label}
                    <span>{count}</span>
                  </button>
                );
              })}
            </fieldset>
          </div>
          <div className={s.search}>
            <Search size={16} aria-hidden />
            <input
              ref={searchRef}
              aria-label="과목 검색"
              placeholder="과목, 교수님, 강의실 검색"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                type="button"
                aria-label="검색어 지우기"
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
              >
                <X size={15} aria-hidden />
              </button>
            )}
          </div>
        </div>
        <p role="status" className={s.resultCount}>
          {query
            ? `“${query}” 검색 결과 ${visible.length}개`
            : filter === "personal" || !selectedTerm
              ? `${visible.length}개의 과목`
              : `${academicTermLabel(selectedTerm.year, selectedTerm.term)} · ${visible.length}개의 과목`}
        </p>
        {visible.length > 0 ? (
          <div className={s.courseGrid}>
            {visible.map((course, index) => (
              <CourseCard key={course.id} course={course} index={index} />
            ))}
          </div>
        ) : (
          <div className={s.empty}>
            <BookOpen size={30} strokeWidth={1.2} aria-hidden />
            <h3>
              {query
                ? "찾는 과목이 없어요"
                : courses.length === 0
                  ? "첫 공부 공간을 만들어 보세요"
                  : filter === "personal"
                    ? "관심 있는 공부도 한곳에"
                    : "이번 학기 과목을 불러오세요"}
            </h3>
            <p>
              {query
                ? "과목 이름이나 강의실을 짧게 입력해 보세요."
                : "시간표를 올리면 과목이 한 번에 만들어져요. 개인 공부는 주제를 직접 추가할 수 있어요."}
            </p>
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                  searchRef.current?.focus();
                }}
              >
                검색 초기화
              </button>
            ) : (
              <div className={s.emptyActions}>
                <Link
                  href={`/dashboard/calendar/import?kind=timetable${selectedTermKey ? `&term=${selectedTermKey}` : ""}`}
                >
                  시간표로 시작하기 <ArrowUpRight size={15} aria-hidden />
                </Link>
                <AddPersonalButton variant="ghost" />
              </div>
            )}
          </div>
        )}
      </section>

      {recent.length > 0 && (
        <section className={s.activity} aria-labelledby="recent-study-title">
          <div className={s.sectionHeading}>
            <div>
              <p className={s.sectionIndex}>IN PROGRESS</p>
              <h2 id="recent-study-title">공부의 발자취</h2>
            </div>
            <Link className={s.textLink} href="/dashboard/history">
              전체 기록 <ArrowUpRight size={15} aria-hidden />
            </Link>
          </div>
          <ul>
            {recent.map((activity, index) => (
              <li key={activity.id}>
                <Link href={activity.href}>
                  <span className={s.activityNumber}>{String(index + 1).padStart(2, "0")}</span>
                  <span className={s.activityBody}>
                    <strong>{activity.title}</strong>
                    {activity.detail && <small>{activity.detail}</small>}
                  </span>
                  <span className={s.activityKind}>{activity.kindLabel}</span>
                  <ArrowUpRight size={16} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppleShell>
  );
}

function CourseCard({ course, index }: { course: CourseListItem; index: number }) {
  const isPersonal = course.category === "personal";
  const accent = courseAccentRgb(course.name, course.color);
  const props = {
    courseId: course.id,
    initialName: course.name,
    initialProfessor: course.professor,
    initialColor: course.color,
    isPersonal,
  };
  return (
    <CourseContextWrapper {...props}>
      <article
        className={s.courseCard}
        style={
          {
            "--course-rgb": `${accent.r} ${accent.g} ${accent.b}`,
            "--card-order": Math.min(index, 8),
          } as CSSProperties
        }
      >
        <div className={s.courseMenu}>
          <CourseActionsMenu {...props} />
        </div>
        <Link className={s.courseLink} href={`/dashboard/study/${course.id}`}>
          <div className={s.courseTop}>
            <span className={s.courseNumber}>{String(index + 1).padStart(2, "0")}</span>
            <span>
              {isPersonal
                ? "개인 공부"
                : [
                    course.semesterYear && course.semesterTerm
                      ? academicTermLabel(course.semesterYear, course.semesterTerm)
                      : null,
                    course.professor || "교수 정보 미등록",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
            </span>
          </div>
          <h3>{course.name}</h3>
          <div className={s.courseMeta}>
            {!isPersonal && (
              <span>
                <MapPin size={13} aria-hidden />
                {course.location || "강의실 미등록"}
              </span>
            )}
            {course.schedule?.length ? (
              <span>
                <Clock3 size={13} aria-hidden />
                {course.schedule.join(" · ")}
              </span>
            ) : null}
          </div>
          <div className={s.courseFooter}>
            <span>
              <FileText size={14} aria-hidden />
              자료 <b>{course.materialCount}</b>
            </span>
            <span className={s.openCourse}>
              {course.materialCount ? "공부 시작" : "자료 올리기"}
              <ArrowUpRight size={16} aria-hidden />
            </span>
          </div>
        </Link>
      </article>
    </CourseContextWrapper>
  );
}

function collectCourseTerms(
  courses: CourseListItem[],
): Array<{ year: number; term: SemesterTerm }> {
  const terms = new Map<string, { year: number; term: SemesterTerm }>();
  for (const course of courses) {
    if (course.category !== "semester" || !course.semesterYear || !course.semesterTerm) continue;
    const value = { year: course.semesterYear, term: course.semesterTerm };
    terms.set(academicTermKey(value.year, value.term), value);
  }
  return [...terms.values()].sort(compareAcademicTerms);
}

function StudySculpture() {
  const sculpture = useRef<HTMLDivElement>(null);
  return (
    <div
      className={s.sculpture}
      aria-hidden="true"
      onPointerMove={(event) => {
        if (
          event.pointerType !== "mouse" ||
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
        )
          return;
        const box = event.currentTarget.getBoundingClientRect();
        sculpture.current?.style.setProperty(
          "--tilt-x",
          `${((event.clientY - box.top) / box.height - 0.5) * -12}deg`,
        );
        sculpture.current?.style.setProperty(
          "--tilt-y",
          `${((event.clientX - box.left) / box.width - 0.5) * 16}deg`,
        );
      }}
      onPointerLeave={() => {
        sculpture.current?.style.setProperty("--tilt-x", "0deg");
        sculpture.current?.style.setProperty("--tilt-y", "0deg");
      }}
    >
      <div className={s.orbit} />
      <div className={s.orbitSmall} />
      <div ref={sculpture} className={s.sculptureTilt}>
        <div className={s.documentStack}>
          <div className={`${s.document} ${s.backDocument}`} />
          <div className={`${s.document} ${s.midDocument}`} />
          <div className={`${s.document} ${s.frontDocument}`}>
            <span className={s.documentLabel}>arch / STUDY</span>
            <BookOpen size={35} strokeWidth={1} />
            <span className={s.documentTitle}>
              작은 이해가
              <br />
              쌓이는 중.
            </span>
            <span className={s.documentLine} />
            <span className={s.documentLine} />
            <span className={s.documentFooter}>READ. THINK. CONNECT.</span>
          </div>
          <span className={s.floatingChip}>
            <span>↗</span> 생각을 연결하다
          </span>
        </div>
      </div>
      <span className={s.sculptureCaption}>A SPACE FOR YOUR NEXT IDEA</span>
    </div>
  );
}
