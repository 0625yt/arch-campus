import Link from "next/link";
import { redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { isAdminUserId } from "@/lib/auth/admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ownerId = await tryGetOwnerId();
  if (!ownerId || !isAdminUserId(ownerId)) {
    redirect("/");
  }
  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center gap-4 border-b border-neutral-200 pb-4">
        <div className="mr-2 text-xs font-bold tracking-widest text-neutral-400">ADMIN</div>
        <Link
          href="/admin/jobs"
          className="text-xs font-semibold text-neutral-600 hover:text-black"
        >
          작업
        </Link>
        <Link
          href="/admin/feedback"
          className="text-xs font-semibold text-neutral-600 hover:text-black"
        >
          피드백
        </Link>
        <Link href="/dashboard" className="ml-auto text-xs text-neutral-400 hover:text-black">
          서비스로 돌아가기
        </Link>
      </div>
      {children}
    </div>
  );
}
