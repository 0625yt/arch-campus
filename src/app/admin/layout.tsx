import { redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { isAdminUserId } from "@/lib/auth/admin";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ownerId = await tryGetOwnerId();
  if (!ownerId || !isAdminUserId(ownerId)) {
    redirect("/");
  }
  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 text-xs font-medium tracking-widest text-neutral-400">
        ADMIN
      </div>
      {children}
    </div>
  );
}
