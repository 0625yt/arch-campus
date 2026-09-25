import { redirect } from "next/navigation";
import { academicTermKey, inferAcademicTerm, parseAcademicTermKey } from "@/lib/academic";
import { tryGetOwnerId } from "@/lib/auth";
import { listCoursesGrouped } from "@/lib/data/materials";
import { Gradebook } from "./gradebook";

export const dynamic = "force-dynamic";

export default async function GradesPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string }>;
}) {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");
  const grouped = await listCoursesGrouped({ ownerId });
  const inferred = inferAcademicTerm();
  const requested = parseAcademicTermKey((await searchParams).term);
  const selected = requested ?? inferred;

  return (
    <Gradebook
      initialCourses={grouped.semester}
      selectedKey={academicTermKey(selected.year, selected.term)}
    />
  );
}
