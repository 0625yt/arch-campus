import { redirect } from "next/navigation";
import { AppleHero, AppleHeroTopBar } from "@/components/apple-hero";
import { WizardHistorySidebar } from "@/components/wizard-history-sidebar";
import { tryGetOwnerId } from "@/lib/auth";
import { listAllWizardHistory } from "@/lib/data/wizard-history";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { type CourseOption, type MaterialOption, Wizard } from "./wizard";

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
      <WizardHistorySidebar items={history} pageTitle="리포트 구조 설계" />
      <div className="mx-auto w-full max-w-[820px] px-6 pb-32 pt-8 sm:px-10 sm:pb-40 sm:pt-12 md:px-12">
        <AppleHeroTopBar back={{ href: "/dashboard/tools", label: "도구" }} chip="과제 · 4단계" />
        <AppleHero
          eyebrow="리포트 구조 설계"
          eyebrowColor="var(--color-apple-warn)"
          title="본문 쓰기 전,"
          titleMuted="목차부터"
          sub="본문은 본인이 직접. 흐름·섹션별 핵심 질문·체크리스트만 잡습니다."
        />

        <div className="mt-12 fade-up fade-up-3 sm:mt-14">
          <Wizard courses={courses} materials={materials} />
        </div>
      </div>
    </div>
  );
}
