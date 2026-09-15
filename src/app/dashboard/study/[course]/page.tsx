import { ArrowDownToLine, ArrowUpRight, Clock3, MapPin, Plus } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { AppleShell } from "@/components/apple-shell";
import { tryGetOwnerId } from "@/lib/auth";
import { getCourseByName, listCoursesWithMaterialCount } from "@/lib/data/materials";
import { getCourseSafetyDetail, type RiskLevel } from "@/lib/data/semester-safety";
import { formatEventLabel } from "@/lib/format-event";
import styles from "./course.module.css";
import { MaterialsGrid } from "./materials-grid";
import { UploadZone } from "./upload-zone";

export const dynamic = "force-dynamic";

type Course = NonNullable<Awaited<ReturnType<typeof getCourseByName>>>;
type CourseSafety = Awaited<ReturnType<typeof getCourseSafetyDetail>>;

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course: courseParam } = await params;
  const courseName = decodeURIComponent(courseParam);
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const [course, allCourses] = await Promise.all([
    getCourseByName({ ownerId, name: courseName }),
    listCoursesWithMaterialCount({ ownerId }),
  ]);
  if (!course) notFound();
  const safety = await getCourseSafetyDetail(ownerId, course.id);
  const dotColor = course.color ?? "#7aa6d6";
  const moveTargets = allCourses
    .filter((c) => c.id !== course.id)
    .map((c) => ({ id: c.id, name: c.name }));

  return (
    <AppleShell width="wide" className={styles.page}>
      <nav aria-label="현재 위치" className={styles.breadcrumb}>
        <Link href="/dashboard/study">공부</Link>
        <span aria-hidden> / </span>
        <span aria-current="page">{course.name}</span>
      </nav>

      <div className={styles.overview}>
        <header className={styles.hero} style={{ "--course-color": dotColor } as CSSProperties}>
          <p className={styles.eyebrow}>
            <span className={styles.courseDot} /> COURSE SPACE
          </p>
          <h1>{course.name}</h1>
          <p className={styles.professor}>{course.professor ?? "교수 정보 미등록"}</p>
          <dl className={styles.courseDetails}>
            <div>
              <dt>
                <MapPin size={15} aria-hidden /> 강의실
              </dt>
              <dd>{course.location || "아직 등록되지 않았어요"}</dd>
            </div>
            <div>
              <dt>
                <Clock3 size={15} aria-hidden /> 수업 시간
              </dt>
              <dd>
                {course.schedule?.length ? course.schedule.join(" · ") : "아직 등록되지 않았어요"}
              </dd>
            </div>
          </dl>
          <Link href="#upload-zone" className={styles.uploadLink}>
            <Plus size={16} aria-hidden /> 새 자료 추가 <ArrowUpRight size={15} aria-hidden />
          </Link>
        </header>
        <CourseSafetyPanel course={course} safety={safety} />
      </div>

      <section aria-labelledby="course-materials-title" className={styles.library}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>YOUR LIBRARY</p>
            <h2 id="course-materials-title">
              학습 자료 <span>{course.materials.length}</span>
            </h2>
          </div>
          <a href="#upload-zone" className={styles.textLink}>
            자료 추가 <Plus size={15} aria-hidden />
          </a>
        </div>
        <MaterialsGrid
          courseName={course.name}
          materials={course.materials.map((m) => ({
            id: m.id,
            title: m.title,
            type: m.type,
            pageCount: m.pageCount,
            uploadedAt: m.uploadedAt,
            hasSummary: m.hasSummary,
          }))}
          dotColor={dotColor}
          moveTargets={moveTargets}
          currentCourseId={course.id}
        />
      </section>

      <section aria-labelledby="course-upload-title" className={styles.uploadSection}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>ADD TO YOUR SPACE</p>
            <h2 id="course-upload-title">새 자료 추가</h2>
          </div>
          <ArrowDownToLine size={20} className={styles.sectionIcon} aria-hidden />
        </div>
        <p className={styles.sectionDescription}>
          강의 자료를 올리면 요약부터 연습 문제까지 한곳에 모여요.
        </p>
        <div className={styles.uploadSurface}>
          <UploadZone courseId={course.id} courseName={course.name} />
        </div>
      </section>
    </AppleShell>
  );
}

function CourseSafetyPanel({ course, safety }: { course: Course; safety: CourseSafety }) {
  const tone = riskTone(safety.risk);
  const unreadMaterial = safety.unreadMaterials[0] ?? null;
  const recentMaterial = course.materials[0] ?? null;
  const materialHref = (materialId: string) =>
    `/dashboard/study/${encodeURIComponent(course.name)}/${materialId}`;
  const todayTask = safety.nextCritical
    ? `${formatEventLabel(safety.nextCritical)} 준비`
    : unreadMaterial
      ? `${unreadMaterial.title} 정리`
      : safety.wrongCount > 0
        ? "오답만 다시 풀기"
        : recentMaterial
          ? `${recentMaterial.title} 이어보기`
          : "첫 자료로 시작해 볼까요";
  const primaryAction = safety.nextCritical
    ? { href: "/dashboard/calendar", label: "일정 확인" }
    : unreadMaterial
      ? { href: materialHref(unreadMaterial.id), label: "자료 정리" }
      : safety.wrongCount > 0
        ? { href: "/dashboard/review", label: "오답 풀기" }
        : recentMaterial
          ? { href: materialHref(recentMaterial.id), label: "이어보기" }
          : { href: "#upload-zone", label: "자료 넣기" };
  const secondaryAction =
    safety.wrongCount > 0 && primaryAction.href !== "/dashboard/review"
      ? { href: "/dashboard/review", label: "오답 보기" }
      : recentMaterial
        ? { href: `/dashboard/quiz?material=${recentMaterial.id}`, label: "문제 만들기" }
        : primaryAction.href !== "#upload-zone"
          ? { href: "#upload-zone", label: "자료 추가" }
          : null;

  return (
    <section className={styles.focusPanel} aria-label={`${course.name} 다음 학습`}>
      <div className={styles.focusTop}>
        <p className={styles.eyebrow}>NEXT UP</p>
        <span className={styles.riskLabel} data-risk={safety.risk}>
          <span />
          {tone}
        </span>
      </div>
      <h2>{todayTask}</h2>
      <p className={styles.focusDescription}>
        {safety.risk === "safe"
          ? "지금 할 수 있는 한 가지부터 가볍게 이어가요."
          : "다가오는 일정과 아직 남은 학습을 확인해 보세요."}
      </p>
      <dl className={styles.metrics}>
        <CourseMetric label="안 본 자료" value={safety.unreadMaterials.length} />
        <CourseMetric label="오답" value={safety.wrongCount} />
        <CourseMetric label="확인 필요" value={safety.unconfirmedCount} />
      </dl>
      {safety.reasons.length > 0 && (
        <ul className={styles.reasons}>
          {safety.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      <div className={styles.focusActions}>
        <Link href={primaryAction.href} className={styles.focusPrimary}>
          {primaryAction.label}
          <ArrowUpRight size={16} aria-hidden />
        </Link>
        {secondaryAction && (
          <Link href={secondaryAction.href} className={styles.focusSecondary}>
            {secondaryAction.label}
          </Link>
        )}
      </div>
    </section>
  );
}

function CourseMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value.toString().padStart(2, "0")}</dd>
    </div>
  );
}

function riskTone(risk: RiskLevel): string {
  return risk === "danger" ? "우선 확인" : risk === "watch" ? "살펴볼 항목" : "차근차근 진행 중";
}
