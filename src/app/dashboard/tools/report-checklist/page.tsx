import { redirect } from "next/navigation";
import { AppleHero, AppleHeroTopBar } from "@/components/apple-hero";
import { AppleShell } from "@/components/apple-shell";
import { WizardHistorySidebar } from "@/components/wizard-history-sidebar";
import { tryGetOwnerId } from "@/lib/auth";
import { listAllWizardHistory } from "@/lib/data/wizard-history";
import { ReportChecklistWizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function ReportChecklistPage() {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const history = await listAllWizardHistory({ ownerId });

  return (
    <div className="lg:pr-[280px]">
      <WizardHistorySidebar items={history} pageTitle="교수 요구사항 체크" />
      <AppleShell width="narrow">
        <AppleHeroTopBar back={{ href: "/dashboard/tools", label: "도구" }} chip="과제 · 2단계" />
        <AppleHero
          eyebrow="교수 요구사항 체크"
          title="공지에 숨은"
          titleMuted="감점 포인트"
          sub="분량·형식·인용·마감·제출 방식까지 체크리스트로 정리. 본문은 본인이 직접."
        />

        <div className="mt-6 fade-up fade-up-3 sm:mt-8">
          <ReportChecklistWizard />
        </div>
      </AppleShell>
    </div>
  );
}
