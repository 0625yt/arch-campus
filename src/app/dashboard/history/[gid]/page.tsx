import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import {
  ChecklistOutput,
  type ChecklistOutputT,
  ExamCramOutput,
  type ExamCramOutputT,
  PresentationOutput,
  type PresentationOutputT,
  ReportStructureOutput,
  type ReportStructureOutputT,
} from "@/lib/schemas";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { ExamCramResultCard } from "../../tools/exam-cram/wizard";
import { PresentationResultCard } from "../../tools/presentation/wizard";
import { ReportChecklistResultCard } from "../../tools/report-checklist/wizard";
import { ReportStructureResultCard } from "../../tools/report-structure/wizard";

export const dynamic = "force-dynamic";

/**
 * `/dashboard/history/[gid]` — 위저드 결과 재방문 페이지.
 *
 * generation row의 payload에서 input과 output을 꺼내서, 그 위저드의 ResultCard를
 * 그대로 다시 그린다. 결과는 generations 테이블에 영속화돼있으니 별도 저장 X.
 *
 * 지원 tool:
 *   - presentation → PresentationResultCard
 *   - wizard-cram → ExamCramResultCard
 *   - report-checklist → ReportChecklistResultCard
 *
 * 그 외 tool은 안내만 표시. 자료 기반 tool(summarize·quiz)은 activity의 href가 자료 페이지로
 * 직접 보내므로 여기까지 안 옴.
 */
export default async function HistoryDetailPage({ params }: { params: Promise<{ gid: string }> }) {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const { gid } = await params;

  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("generations")
    .select("id, tool, status, payload, created_at")
    .eq("id", gid)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error || !data) notFound();

  const tool = data.tool;
  const payload = (data.payload ?? {}) as Record<string, unknown>;
  const createdAtLabel = formatDateTime(data.created_at);

  return (
    <div>
      <div className="mx-auto w-full max-w-[820px] px-6 pb-32 pt-8 sm:px-10 sm:pb-40 sm:pt-12 md:px-12">
        <header className="fade-up flex items-baseline justify-between gap-3">
          <Link
            href="/dashboard/history"
            className="group inline-flex items-baseline gap-1 text-[12px] wght-450 text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            <span className="transition-transform group-hover:-translate-x-0.5">‹</span>
            기록
          </Link>
          <span className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
            {createdAtLabel}
          </span>
        </header>

        <div className="mt-10 fade-up fade-up-1 sm:mt-14">
          <ResultBody tool={tool} payload={payload} />
        </div>
      </div>
    </div>
  );
}

function ResultBody({ tool, payload }: { tool: string; payload: Record<string, unknown> }) {
  if (tool === "presentation") {
    const output = parseOutput(PresentationOutput, payload.output);
    if (!output) return <UnavailableNotice tool={tool} />;
    return (
      <PresentationResultCard
        output={output as PresentationOutputT}
        topic={asString(payload.topic) ?? "(주제 없음)"}
        durationMin={asDuration(payload.durationMin) ?? 10}
        audience={asAudience(payload.audience) ?? "동기"}
        goal={asGoal(payload.goal) ?? "이해"}
      />
    );
  }

  if (tool === "wizard-cram") {
    const output = parseOutput(ExamCramOutput, payload.output);
    if (!output) return <UnavailableNotice tool={tool} />;
    return <ExamCramResultCard output={output as ExamCramOutputT} />;
  }

  if (tool === "report-checklist") {
    const output = parseOutput(ChecklistOutput, payload.output);
    if (!output) return <UnavailableNotice tool={tool} />;
    return <ReportChecklistResultCard output={output as ChecklistOutputT} />;
  }

  if (tool === "report-structure") {
    const output = parseOutput(ReportStructureOutput, payload.output);
    if (!output) return <UnavailableNotice tool={tool} />;
    return (
      <ReportStructureResultCard
        output={output as ReportStructureOutputT}
        topic={asString(payload.topic) ?? "(주제 없음)"}
        reportType={asReportType(payload.reportType) ?? "분석"}
        targetPages={typeof payload.targetPages === "number" ? payload.targetPages : 4}
        audience={asReportAudience(payload.audience) ?? "교수님"}
      />
    );
  }

  return <UnavailableNotice tool={tool} />;
}

function asReportType(
  v: unknown,
): "분석" | "비평" | "주장" | "비교" | "사례 연구" | "조사 보고" | null {
  if (
    v === "분석" ||
    v === "비평" ||
    v === "주장" ||
    v === "비교" ||
    v === "사례 연구" ||
    v === "조사 보고"
  )
    return v;
  return null;
}

function asReportAudience(v: unknown): "교수님" | "조교" | "학우 발표용" | null {
  if (v === "교수님" || v === "조교" || v === "학우 발표용") return v;
  return null;
}

function UnavailableNotice({ tool }: { tool: string }) {
  return (
    <div className="rounded-[18px] bg-white px-7 py-12 text-center">
      <p
        className="text-[18px] wght-620 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        이 기록은 다시 열 수 없어요
      </p>
      <p
        className="mx-auto mt-3 max-w-[420px] text-[13px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {tool === "chat-free"
          ? "코치 챗 응답은 저장되지 않아요. 챗 페이지에서 다시 물어봐 주세요."
          : "결과 데이터를 찾을 수 없어요. 도구 페이지에서 새로 만들어 주세요."}
      </p>
      <Link
        href={tool === "chat-free" ? "/dashboard/chat" : "/dashboard/tools"}
        className="mt-7 inline-flex h-[44px] items-center rounded-full bg-[var(--color-apple-action)] px-6 text-[14px] wght-560 text-white transition-all hover:bg-[var(--color-apple-action-hover)]"
      >
        {tool === "chat-free" ? "코치 챗 열기" : "도구로 가기"} →
      </Link>
    </div>
  );
}

// ─── parsers ────────────────────────────────

import type { ZodType } from "zod";

function parseOutput<T>(schema: ZodType<T>, raw: unknown): T | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asDuration(v: unknown): 5 | 10 | 15 | 20 | null {
  if (v === 5 || v === 10 || v === 15 || v === 20) return v;
  return null;
}

function asAudience(v: unknown): "교수님" | "동기" | "신입생" | "외부" | null {
  if (v === "교수님" || v === "동기" || v === "신입생" || v === "외부") return v;
  return null;
}

function asGoal(v: unknown): "이해" | "설득" | "공유" | "토론 유도" | null {
  if (v === "이해" || v === "설득" || v === "공유" || v === "토론 유도") return v;
  return null;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "long",
    timeStyle: "short",
  });
}
