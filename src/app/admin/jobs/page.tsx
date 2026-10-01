import Link from "next/link";
import { notFound } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { isAdminUserId } from "@/lib/auth/admin";
import { lastProcessingCheckpoint, parseJobCheckpoints } from "@/lib/job-checkpoints";
import { keyedItems } from "@/lib/keyed-items";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
const STATUSES = ["all", "pending", "running", "error", "done", "cancelled"] as const;

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; tool?: string }>;
}) {
  const ownerId = await tryGetOwnerId();
  if (!isAdminUserId(ownerId)) notFound();
  const params = await searchParams;
  const status = STATUSES.includes(params.status as (typeof STATUSES)[number])
    ? (params.status as (typeof STATUSES)[number])
    : "all";
  const tool = params.tool?.trim().slice(0, 80) ?? "";
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const admin = getAdminSupabase();

  let query = admin
    .from("jobs")
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);
  if (status !== "all") query = query.eq("status", status);
  if (tool) query = query.eq("tool", tool);

  const [{ data: rows, error }, { data: summaryRows }] = await Promise.all([
    query,
    admin
      .from("jobs")
      .select("status, retry_count, started_at, finished_at")
      .gte("created_at", since)
      .limit(5000),
  ]);

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 p-5 text-sm text-red-700">
        작업 기록을 불러오지 못했어요: {error.message}
      </div>
    );
  }

  const summary = summarize(summaryRows ?? []);
  const tools = Array.from(new Set((rows ?? []).map((row) => row.tool))).sort();

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-600">
            Operations · 7 days
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em] text-neutral-950">
            백그라운드 작업
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            실패한 단계와 자동 재시도 결과를 최근 작업부터 확인합니다.
          </p>
        </div>
        <Link
          href="/admin/jobs"
          className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-neutral-600 hover:border-neutral-300"
        >
          새로고침
        </Link>
      </header>

      <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="전체" value={summary.total} detail="최근 7일" />
        <Metric label="진행 중" value={summary.active} detail="대기 포함" tone="blue" />
        <Metric label="실패" value={summary.failed} detail="원인 확인 필요" tone="red" />
        <Metric
          label="자동 복구"
          value={summary.retried}
          detail={`완료 평균 ${formatDuration(summary.averageDurationMs)}`}
          tone="green"
        />
      </section>

      <section className="mt-7 flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-3">
        {STATUSES.map((item) => (
          <Link
            key={item}
            href={jobFilterHref(item, tool)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              status === item
                ? "bg-neutral-950 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {statusLabel(item)}
          </Link>
        ))}
        {tools.length > 0 && (
          <form className="ml-auto flex items-center gap-2" action="/admin/jobs">
            {status !== "all" && <input type="hidden" name="status" value={status} />}
            <label className="sr-only" htmlFor="job-tool-filter">
              도구 필터
            </label>
            <select
              id="job-tool-filter"
              name="tool"
              defaultValue={tool}
              className="h-8 rounded-full border border-neutral-200 bg-white px-3 text-xs text-neutral-700"
            >
              <option value="">모든 도구</option>
              {tools.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="h-8 rounded-full bg-neutral-900 px-3 text-xs font-semibold text-white"
            >
              적용
            </button>
          </form>
        )}
      </section>

      <section className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        {(rows ?? []).length === 0 ? (
          <div className="p-12 text-center text-sm text-neutral-400">
            조건에 맞는 작업이 없어요.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-xs">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] uppercase tracking-[0.06em] text-neutral-500">
                <tr>
                  <Th>상태</Th>
                  <Th>도구 / 사용자</Th>
                  <Th>마지막 단계</Th>
                  <Th>오류</Th>
                  <Th>재시도</Th>
                  <Th>처리 시간</Th>
                  <Th>시작</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {(rows ?? []).map((job) => (
                  <JobTableRow key={job.id} job={job} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="mt-3 text-[11px] text-neutral-400">
        최대 200건을 표시합니다. 사용자 ID와 오류 메시지는 운영 점검에 필요한 범위만 노출합니다.
      </p>
    </div>
  );
}

function JobTableRow({ job }: { job: JobRow }) {
  const duration = durationMs(job);
  const history = parseJobCheckpoints(job.checkpoint_history);
  const interrupted =
    job.status === "error" ? lastProcessingCheckpoint(job.checkpoint_history) : null;
  const stage = interrupted?.stage ?? job.checkpoint_stage;
  const progress = interrupted?.progress ?? job.checkpoint_progress;
  return (
    <tr className="align-top hover:bg-neutral-50/70">
      <td className="px-4 py-3">
        <StatusBadge status={job.status} />
      </td>
      <td className="px-4 py-3">
        <p className="font-semibold text-neutral-800">{job.tool}</p>
        <p className="mt-1 font-mono text-[10px] text-neutral-400">{job.owner_id.slice(0, 8)}…</p>
      </td>
      <td className="w-[230px] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-neutral-700">{stageLabel(stage)}</span>
          <span className="tabular-nums text-neutral-400">{progress}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
          <div
            className={`h-full rounded-full ${job.status === "error" ? "bg-red-500" : "bg-blue-600"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        {job.checkpoint_message && job.status !== "error" && (
          <p className="mt-1.5 line-clamp-2 text-[10px] leading-4 text-neutral-400">
            {job.checkpoint_message}
          </p>
        )}
        {history.length > 0 && (
          <details className="mt-2 text-[10px] text-neutral-500">
            <summary className="cursor-pointer">단계 이력 {history.length}개</summary>
            <ol className="mt-2 space-y-1 border-l border-neutral-200 pl-2">
              {keyedItems(history).map(({ item, key }) => (
                <li key={key} className="flex justify-between gap-2">
                  <span>{stageLabel(item.stage)}</span>
                  <time dateTime={item.at} className="tabular-nums">
                    {formatDate(item.at)}
                  </time>
                </li>
              ))}
            </ol>
          </details>
        )}
      </td>
      <td className="max-w-[280px] px-4 py-3">
        <p
          className={`line-clamp-3 leading-5 ${job.error_message ? "text-red-700" : "text-neutral-300"}`}
        >
          {job.error_message ?? "—"}
        </p>
      </td>
      <td className="px-4 py-3 text-center tabular-nums text-neutral-600">{job.retry_count}</td>
      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-neutral-600">
        {formatDuration(duration)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-neutral-500">{formatDate(job.created_at)}</td>
    </tr>
  );
}

function Metric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: number;
  detail: string;
  tone?: "neutral" | "blue" | "red" | "green";
}) {
  const colors = {
    neutral: "border-neutral-200 bg-white",
    blue: "border-blue-200 bg-blue-50/60",
    red: "border-red-200 bg-red-50/60",
    green: "border-emerald-200 bg-emerald-50/60",
  };
  return (
    <div className={`rounded-2xl border p-4 ${colors[tone]}`}>
      <p className="text-xs font-semibold text-neutral-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums tracking-[-0.03em] text-neutral-950">
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-[11px] text-neutral-400">{detail}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: JobRow["status"] }) {
  const styles = {
    pending: "bg-amber-100 text-amber-800",
    running: "bg-blue-100 text-blue-800",
    done: "bg-emerald-100 text-emerald-800",
    error: "bg-red-100 text-red-800",
    cancelled: "bg-neutral-100 text-neutral-600",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${styles[status]}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-semibold">{children}</th>;
}

function summarize(
  rows: Array<Pick<JobRow, "status" | "retry_count" | "started_at" | "finished_at">>,
) {
  const completedDurations = rows
    .filter((row) => row.status === "done")
    .map(durationMs)
    .filter((value): value is number => value !== null);
  return {
    total: rows.length,
    active: rows.filter((row) => row.status === "pending" || row.status === "running").length,
    failed: rows.filter((row) => row.status === "error").length,
    retried: rows.filter((row) => row.retry_count > 0).length,
    averageDurationMs:
      completedDurations.length > 0
        ? completedDurations.reduce((sum, value) => sum + value, 0) / completedDurations.length
        : null,
  };
}

function durationMs(row: Pick<JobRow, "started_at" | "finished_at">): number | null {
  if (!row.started_at) return null;
  const end = row.finished_at ? Date.parse(row.finished_at) : Date.now();
  const start = Date.parse(row.started_at);
  return Number.isFinite(end - start) ? Math.max(0, end - start) : null;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}분 ${seconds % 60}초`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: string): string {
  return (
    {
      all: "전체",
      pending: "대기",
      running: "진행",
      done: "완료",
      error: "실패",
      cancelled: "취소",
    }[status] ?? status
  );
}

function stageLabel(stage: string): string {
  return (
    {
      queued: "대기",
      "retry-queued": "자동 복구 대기",
      processing: "입력 준비",
      "rebuilding-input": "입력 복구",
      "generating-summary": "요약 생성",
      "generating-quiz": "문제 생성",
      "verifying-output": "결과 검증·저장",
      completed: "완료",
      failed: "실패",
      cancelled: "취소",
    }[stage] ?? stage
  );
}

function jobFilterHref(status: string, tool: string): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (tool) params.set("tool", tool);
  const query = params.toString();
  return query ? `/admin/jobs?${query}` : "/admin/jobs";
}
