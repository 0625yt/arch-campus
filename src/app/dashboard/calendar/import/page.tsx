import { redirect } from "next/navigation";
import { parseAcademicTermKey } from "@/lib/academic";
import { tryGetOwnerId } from "@/lib/auth";
import { listCoursesGrouped } from "@/lib/data/materials";
import { ImportTabs } from "./import-tabs";

export const dynamic = "force-dynamic";

export default async function CalendarImportPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; term?: string }>;
}) {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const { kind, term } = await searchParams;
  const initialKind = kind === "syllabus" ? "syllabus" : "timetable";
  const defaultTerm = parseAcademicTermKey(term);

  const grouped = await listCoursesGrouped({ ownerId });
  const existingCourseCount = grouped.semester.length;

  return (
    <div>
      <div className="mx-auto w-full max-w-[920px] px-6 pb-32 pt-8 sm:px-10 sm:pb-40 sm:pt-12 md:px-12">
        <ImportTabs
          initialKind={initialKind}
          existingCourseCount={existingCourseCount}
          defaultTerm={defaultTerm}
        />
      </div>
    </div>
  );
}
