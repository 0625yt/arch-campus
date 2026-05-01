import { HistoryPanel } from "./history-panel";

export default function StudyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full">
      <HistoryPanel />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
