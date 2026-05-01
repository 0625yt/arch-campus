import { Sidebar } from "@/components/sidebar";
import { MobileTopbar, MobileTabBar } from "@/components/mobile-nav";
import { CommandPalette } from "@/components/command-palette";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen-safe overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopbar />
        <main className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </main>
        <MobileTabBar />
      </div>
      <CommandPalette />
    </div>
  );
}
