import { redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { ImportTabs } from "./import-tabs";

export default async function CalendarImportPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const { kind } = await searchParams;
  const initialKind = kind === "syllabus" ? "syllabus" : "timetable";

  return (
    <div className="bg-[var(--color-apple-pearl)]">
      <div className="mx-auto w-full max-w-[920px] px-6 pb-32 pt-8 sm:px-10 sm:pb-40 sm:pt-12 md:px-12">
        <ImportTabs initialKind={initialKind} />
      </div>
    </div>
  );
}
