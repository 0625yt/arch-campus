import Link from "next/link";
import { redirect } from "next/navigation";
import { WizardHistorySidebar } from "@/components/wizard-history-sidebar";
import { tryGetOwnerId } from "@/lib/auth";
import { listAllWizardHistory } from "@/lib/data/wizard-history";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { type CourseOption, type MaterialOption, Wizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function PresentationWizardPage() {
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
    listAllWizardHistory({ ownerId }),
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
    <div className="lg:pr-[280px]">
      <WizardHistorySidebar items={history} pageTitle="발표자료 구조화" />
      <div className="mx-auto w-full max-w-[820px] px-6 pb-32 pt-8 sm:px-10 sm:pb-40 sm:pt-12 md:px-12">
        {/* Top bar */}
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
            발표 · 5단계
          </span>
        </header>

        {/* Hero */}
        <section className="mt-10 fade-up fade-up-1 sm:mt-14">
          <p
            className="text-[12px] wght-560 uppercase tracking-[0.06em]"
            style={{ color: "var(--color-apple-cobalt)" }}
          >
            발표자료 구조화
          </p>
          <h1
            className="mt-3 text-[34px] leading-[1.07] wght-620 text-[var(--color-apple-ink)] sm:text-[44px] md:text-[52px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            5단계로 답하면 <span className="text-[var(--color-apple-muted)]">발표 한 세트가</span>{" "}
            만들어져요.
          </h1>
          <p
            className="mt-4 max-w-[560px] text-[15px] leading-[1.55] wght-450 text-[var(--color-apple-muted)] sm:text-[17px] sm:leading-[1.5]"
            style={{ letterSpacing: "-0.022em" }}
          >
            슬라이드 구조 · 스피커 노트 · 예상 질문 5개까지. 자료 올린 거 있으면 슬라이드 인용도
            박혀요.
          </p>
        </section>

        <div className="mt-12 fade-up fade-up-3 sm:mt-14">
          <Wizard courses={courses} materials={materials} />
        </div>
      </div>
    </div>
  );
}
