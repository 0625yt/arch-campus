import { notFound } from "next/navigation";
import styles from "@/app/dashboard/study/[course]/course.module.css";
import { MaterialsGrid } from "@/app/dashboard/study/[course]/materials-grid";
import { AppleShell } from "@/components/apple-shell";

export const dynamic = "force-dynamic";

/** Fictional material data for local UI verification; never served in production. */
export default async function StudyPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ empty?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { empty } = await searchParams;
  const materials =
    empty === "1"
      ? []
      : [
          {
            id: "preview-stack",
            title: "03. 스택과 큐 — 데이터가 흐르는 방식",
            type: "lecture" as const,
            pageCount: 28,
            uploadedAt: "2026-09-09T01:00:00.000Z",
            hasSummary: true,
          },
          {
            id: "preview-tree",
            title: "04. 트리와 그래프",
            type: "lecture" as const,
            pageCount: 32,
            uploadedAt: "2026-09-08T01:00:00.000Z",
            hasSummary: false,
          },
          {
            id: "preview-exam",
            title: "중간고사 기출문제",
            type: "exam" as const,
            pageCount: 8,
            uploadedAt: "2026-09-07T01:00:00.000Z",
            hasSummary: true,
          },
        ];
  return (
    <main>
      <AppleShell width="wide" className={styles.page}>
        <header className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>DEVELOPMENT PREVIEW · 예시 데이터</p>
            <h1 className="mt-3 text-3xl wght-700">자료구조 · 학습 자료</h1>
          </div>
        </header>
        <MaterialsGrid
          courseName="자료구조"
          materials={materials}
          dotColor="#7aa6d6"
          currentCourseId="preview-course"
          moveTargets={[]}
        />
        <section id="upload-zone" className="mt-12 border-t border-[var(--color-line)] pt-6">
          <h2>자료 추가 위치</h2>
        </section>
      </AppleShell>
    </main>
  );
}
