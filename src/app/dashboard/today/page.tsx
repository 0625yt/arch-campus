import { redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { listUpcomingEvents } from "@/lib/data/events";
import { getSemesterSafetySnapshot } from "@/lib/data/semester-safety";
import { TodayOverview } from "./today-overview";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");
  const [safety, events] = await Promise.all([
    getSemesterSafetySnapshot(ownerId),
    listUpcomingEvents({ ownerId, limit: 6 }),
  ]);
  return <TodayOverview signals={safety.signals} events={events} />;
}
