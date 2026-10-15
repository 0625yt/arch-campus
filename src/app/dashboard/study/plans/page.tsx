import Link from "next/link";
import { redirect } from "next/navigation";
import { AppleShell } from "@/components/apple-shell";
import { StudyWorkspacePanel } from "@/components/study-workspace";
import { tryGetOwnerId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function StudyPlansPage() {
  if (!(await tryGetOwnerId())) redirect("/login");
  return (
    <AppleShell>
      <header className="mb-6">
        <Link href="/dashboard/today" className="text-[13px] text-[var(--color-apple-muted)]">
          ← 오늘의 공부
        </Link>
        <p className="mt-4 text-[12px] text-[var(--color-apple-muted)]">
          시험까지, 한 번에 한 과목씩
        </p>
        <h1 className="mt-2 text-[32px] wght-620 tracking-[-0.02em]">시험 준비실</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--color-apple-muted)]">
          시험 범위와 자료를 묶고, 오늘 가능한 시간만큼 공부하세요. 끝낸 내용과 미룬 내용은 다음
          계획에 이어집니다.
        </p>
      </header>
      <StudyWorkspacePanel />
    </AppleShell>
  );
}
