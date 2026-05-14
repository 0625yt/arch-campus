import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CommandPalette } from "@/components/command-palette";
import { JobsDock } from "@/components/jobs-dock";
import { MobileTabBar, MobileTopbar } from "@/components/mobile-nav";
import { NavigationProgress } from "@/components/navigation-progress";
import { Sidebar } from "@/components/sidebar";
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
    <div className="flex h-screen-safe overflow-hidden">
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopbar />
        <main className="dashboard-canvas flex-1 overflow-y-auto overscroll-contain">
          {children}
        </main>
        <MobileTabBar />
      </div>
      <CommandPalette />
      <JobsDock />
    </div>
  );
}
