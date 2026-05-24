import Link from "next/link";
import { redirect } from "next/navigation";
import { WizardHistoryStrip } from "@/components/wizard-history-strip";
import { tryGetOwnerId } from "@/lib/auth";
import { listWizardHistory } from "@/lib/data/wizard-history";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { Wizard, type CourseOption, type MaterialOption } from "./wizard";

export const dynamic = "force-dynamic";

export default async function ReportStructurePage() {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const admin = getAdminSupabase();
  const [{ data: coursesRaw }, { data: materialsRaw }, history] = await Promise.all([
    admin
      .from("courses")
      .select("id, name, color")
      .eq("owner_id", ownerId)
      .eq("archived", false)
      .order("name"),
    admin
      .from("materials")
      .select("id, title, type, course_id, page_count, uploaded_at")
      .eq("owner_id", ownerId)
      .order("uploaded_at", { ascending: false })
      .limit(80),
    listWizardHistory({ ownerId, tool: "report-structure" }),
  ]);

  const courses: CourseOption[] = (coursesRaw ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
  }));
  const materials: MaterialOption[] = (materialsRaw ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    type: m.type,
    courseId: m.course_id,
    pageCount: m.page_count,
  }));

  return (
    <div>
      <div className="mx-auto w-full max-w-[820px] px-6 pb-32 pt-8 sm:px-10 sm:pb-40 sm:pt-12 md:px-12">
        <header className="fade-up flex items-baseline justify-between gap-3">
          <Link
            href="/dashboard/tools"
            className="group inline-flex items-baseline gap-1 text-[12px] wght-450 text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            <span className="transition-transform group-hover:-translate-x-0.5">‹</span>
            도구
          </Link>
          <span className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
            과제 · 4단계
          </span>
        </header>

        <section className="mt-10 fade-up fade-up-1 sm:mt-14">
          <p
            className="text-[12px] wght-560 uppercase tracking-[0.06em]"
            style={{ color: "var(--color-apple-warn)" }}
          >
            리포트 구조 설계
          </p>
          <h1
            className="mt-3 text-[34px] leading-[1.07] wght-620 text-[var(--color-apple-ink)] sm:text-[44px] md:text-[52px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            본문 쓰기 전,{" "}
            <span className="text-[var(--color-apple-muted)]">목차부터 잡아드릴게요.</span>
          </h1>
          <p
            className="mt-4 max-w-[600px] text-[15px] leading-[1.55] wght-450 text-[var(--color-apple-muted)] sm:text-[17px] sm:leading-[1.5]"
            style={{ letterSpacing: "-0.022em" }}
          >
            본문은 본인이 직접 써야 학습이 돼요. 우리는 흐름·각 섹션 핵심 질문·체크리스트만 잡아드려요.
          </p>
        </section>

        {history.length > 0 && (
          <div className="mt-10 fade-up fade-up-2 sm:mt-12">
            <WizardHistoryStrip items={history} />
          </div>
        )}

        <div className="mt-12 fade-up fade-up-3 sm:mt-14">
          <Wizard courses={courses} materials={materials} />
        </div>
      </div>
    </div>
  );
}
