import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CommandPalette } from "@/components/command-palette";
import { DashboardScrollReset } from "@/components/dashboard-scroll-reset";
import { GlobalTopbar } from "@/components/global-topbar";
import { JobsDock } from "@/components/jobs-dock";
import { MobileTabBar, MobileTopbar } from "@/components/mobile-nav";
import { NavigationProgress } from "@/components/navigation-progress";
import { tryGetOwnerId } from "@/lib/auth";
import { getProfile } from "@/lib/data/profile";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const profile = await getProfile(ownerId);
  // DEV에서는 fallback user가 profile 없이도 통과 — auth.ts §1 정책과 짝
  if (!profile?.onboarded && process.env.NODE_ENV === "production") {
    redirect("/onboarding");
  }

  return (
    <div className="flex h-screen-safe flex-col overflow-hidden">
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <GlobalTopbar />
      <MobileTopbar />
      <main
        data-dashboard-scroll
        className="dashboard-canvas flex-1 overflow-y-auto overscroll-contain"
      >
        <DashboardScrollReset />
        {children}
      </main>
      <MobileTabBar />
      <CommandPalette />
      <JobsDock />
    </div>
  );
}
