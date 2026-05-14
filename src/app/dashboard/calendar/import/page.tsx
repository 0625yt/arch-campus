import { redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { listCoursesGrouped } from "@/lib/data/materials";
import { ImportTabs } from "./import-tabs";

export const dynamic = "force-dynamic";

export default async function CalendarImportPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const { kind } = await searchParams;
  const initialKind = kind === "syllabus" ? "syllabus" : "timetable";

  const grouped = await listCoursesGrouped({ ownerId });
  const existingCourseCount = grouped.semester.length;

  return (
    <div>
      <div className="mx-auto w-full max-w-[920px] px-6 pb-32 pt-8 sm:px-10 sm:pb-40 sm:pt-12 md:px-12">
        <ImportTabs initialKind={initialKind} existingCourseCount={existingCourseCount} />
      </div>
    </div>
  );
}
