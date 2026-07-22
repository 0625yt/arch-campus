import { redirect } from "next/navigation";
import { AppleHero, AppleHeroTopBar } from "@/components/apple-hero";
import { AppleShell } from "@/components/apple-shell";
import { WizardHistorySidebar } from "@/components/wizard-history-sidebar";
import { tryGetOwnerId } from "@/lib/auth";
import { listAllWizardHistory } from "@/lib/data/wizard-history";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { type CourseOption, ExamCramWizard, type MaterialOption } from "./wizard";

export const dynamic = "force-dynamic";

export default async function ExamCramPage() {
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
      <WizardHistorySidebar items={history} pageTitle="시험 벼락치기" />
      <AppleShell width="narrow">
        <AppleHeroTopBar back={{ href: "/dashboard/tools", label: "도구" }} chip="시험 · 3단계" />
        <AppleHero
          eyebrow="시험 벼락치기"
          eyebrowColor="var(--color-urgent)"
          title="남은 시간을"
          titleMuted="한 블록씩"
          sub="자료에서 단원 우선순위 · 시간 블록 · 자기 점검 질문까지. 평균 1분 안쪽."
        />

        <div className="mt-6 fade-up fade-up-3 sm:mt-8">
          <ExamCramWizard courses={courses} materials={materials} />
        </div>
      </AppleShell>
    </div>
  );
}
