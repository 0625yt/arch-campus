import { redirect } from "next/navigation";
import { AppleHero, AppleHeroTopBar } from "@/components/apple-hero";
import { AppleShell } from "@/components/apple-shell";
import { tryGetOwnerId } from "@/lib/auth";
import { BookReviewWizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function BookReviewWizardPage() {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  return (
    <AppleShell width="narrow">
      <AppleHeroTopBar back={{ href: "/dashboard/tools", label: "도구" }} chip="독후감 · 3단계" />
      <AppleHero
        eyebrow="독후감 초안"
        eyebrowColor="var(--color-apple-cobalt)"
        title="책 한 권을"
        titleMuted="내 글로"
        sub="책 정보·메모만 넣어도 4~8단락 초안. 인용·워터마크 자동, 내 표현으로 다시 쓰기 1초."
      />

      <div className="mt-6 fade-up fade-up-3 sm:mt-8">
        <BookReviewWizard />
      </div>
    </AppleShell>
  );
}
