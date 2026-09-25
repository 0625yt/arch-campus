import { redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { getRecentActivities } from "@/lib/data/activity";
import { listCoursesGrouped } from "@/lib/data/materials";
import { StudyWorkspace } from "./study-workspace";

export const dynamic = "force-dynamic";

export default async function StudyIndexPage() {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");
  const [grouped, recent] = await Promise.all([
    listCoursesGrouped({ ownerId }),
    getRecentActivities({ ownerId, limit: 6 }),
  ]);
  return <StudyWorkspace courses={[...grouped.semester, ...grouped.personal]} recent={recent} />;
}
