import "server-only";
import { type GenerateUsage, streamChatReply } from "@/lib/claude";
import { getRecentActivities } from "@/lib/data/activity";
import { listUpcomingEvents } from "@/lib/data/events";
import { listCoursesWithMaterialCount } from "@/lib/data/materials";
import { loadPrompt } from "@/lib/prompts";
import { getAdminSupabase } from "@/lib/supabase/admin";

/**
 * 자유 텍스트 챗 서비스 — `/api/chat/free`에서 호출.
 *
 * 자료 챗과 차이:
 *   - 자료(thread) 모델 없음. 메시지 DB 저장 X (MVP — 클라이언트 state만)
 *   - materialBlock 대신 학생 컨텍스트(강의·임박 일정·최근 활동) 박힘
 *   - 가드가 더 무거움 (자료 없으니 환각·치팅 위험 두 배)
 *
 * 모델: Haiku 4.5 + 1h prompt cache.
 *   학생 컨텍스트는 session 내 거의 안 변함 → cache 효율 좋음.
 *   CHAT_FREE_MODEL=sonnet env로 격상 가능.
 */

const MAX_USER_MESSAGE_LEN = 2000;
const MAX_COURSE_LIST = 8;
const MAX_UPCOMING = 5;
const MAX_ACTIVITY = 5;

export interface StartChatFreeTurnInput {
  ownerId: string;
  userMessage: string;
  /** 최근 user/assistant turn — 클라이언트가 매번 보낸다 (DB 저장 X) */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export type StartChatFreeTurnResult =
  | { ok: true; response: Response }
  | { ok: false; status: number; error: string };

export async function startChatFreeTurn(
  input: StartChatFreeTurnInput,
): Promise<StartChatFreeTurnResult> {
  if (!input.userMessage || input.userMessage.length === 0) {
    return { ok: false, status: 400, error: "메시지가 비어있어요" };
  }
  if (input.userMessage.length > MAX_USER_MESSAGE_LEN) {
    return {
      ok: false,
      status: 400,
      error: `메시지가 너무 길어요 (${MAX_USER_MESSAGE_LEN}자 이내)`,
    };
  }

  const ctx = await loadStudentContext(input.ownerId);
  const rulePrompt = loadPrompt("chat-free");
  const materialBlock = buildContextBlock(ctx); // cache 1h
  const dynamicContext = buildDynamicNow(); // 매 호출 다름, no cache

  const history = (input.history ?? []).slice(-6); // 최근 6 turn

  const result = streamChatReply({
    tool: "chat-free",
    rulePrompt,
    materialBlock,
    dynamicContext,
    history,
    userMessage: input.userMessage,
    maxTokens: 1200,
    temperature: 0.35,
    onFinish: async ({ text, usage, modelId, costUsd }) => {
      await logGeneration({
        ownerId: input.ownerId,
        modelId,
        usage,
        cost: costUsd,
        status: "ok",
        payload: {
          userMessage: input.userMessage.slice(0, 500),
          responsePreview: text.slice(0, 300),
        },
      });
    },
  });

  return { ok: true, response: result.toUIMessageStreamResponse() };
}

interface StudentContext {
  courses: Array<{ name: string; materialCount: number; color: string | null }>;
  upcoming: Array<{
    kind: string;
    title: string;
    courseName: string | null;
    daysLeft: number | null;
  }>;
  activities: Array<{ kind: string; title: string; daysAgo: number }>;
}

async function loadStudentContext(ownerId: string): Promise<StudentContext> {
  // 학생 컨텍스트는 cache되는 시스템 블록에 박히므로 — 너무 자주 변하지 않는 정보만.
  // 임박 일정·활동은 그날그날 다르지만, 1h cache는 학생이 페이지를 떠나기 전엔 hit률 좋음.
  const [grouped, upcomingRaw, activitiesRaw] = await Promise.all([
    listCoursesWithMaterialCount({ ownerId }).catch(() => []),
    listUpcomingEvents({ ownerId, limit: MAX_UPCOMING }).catch(() => []),
    getRecentActivities({ ownerId, limit: MAX_ACTIVITY }).catch(() => []),
  ]);

  const now = Date.now();
  const day = 1000 * 60 * 60 * 24;

  return {
    courses: grouped.slice(0, MAX_COURSE_LIST).map((c) => ({
      name: c.name,
      materialCount: c.materialCount,
      color: c.color,
    })),
    upcoming: upcomingRaw.map((e) => {
      const starts = Date.parse(e.startsAt);
      const daysLeft = Number.isFinite(starts) ? Math.floor((starts - now) / day) : null;
      return {
        kind: e.kind,
        title: e.title,
        courseName: e.courseName,
        daysLeft,
      };
    }),
    activities: activitiesRaw.map((a) => {
      const at = Date.parse(a.createdAt);
      const daysAgo = Number.isFinite(at) ? Math.max(0, Math.floor((now - at) / day)) : 0;
      return { kind: a.kind, title: a.title, daysAgo };
    }),
  };
}

function buildContextBlock(ctx: StudentContext): string {
  const lines: string[] = ["## 학생 컨텍스트", ""];

  if (ctx.courses.length === 0) {
    lines.push("등록된 강의 없음 — 시간표를 아직 안 올렸거나 학기 초입.");
  } else {
    lines.push(`이번 학기 강의 ${ctx.courses.length}개:`);
    for (const c of ctx.courses) {
      const matLabel = c.materialCount > 0 ? `${c.materialCount}건` : "자료 없음";
      lines.push(`- ${c.name} (${matLabel})`);
    }
  }

  lines.push("");
  if (ctx.upcoming.length === 0) {
    lines.push("임박 일정 없음.");
  } else {
    lines.push("임박 일정:");
    for (const e of ctx.upcoming) {
      const kindLabel = formatKind(e.kind);
      const courseLabel = e.courseName ? ` [${e.courseName}]` : "";
      const dDay =
        e.daysLeft === null
          ? ""
          : e.daysLeft <= 0
            ? " (D-Day)"
            : ` (D-${e.daysLeft})`;
      lines.push(`- ${kindLabel} ${e.title}${courseLabel}${dDay}`);
    }
  }

  lines.push("");
  if (ctx.activities.length === 0) {
    lines.push("최근 활동 없음.");
  } else {
    lines.push("최근 활동:");
    for (const a of ctx.activities) {
      const ago = a.daysAgo === 0 ? "오늘" : `${a.daysAgo}일 전`;
      lines.push(`- [${ago}] ${formatKind(a.kind)} ${a.title}`);
    }
  }

  lines.push(
    "",
    "이 컨텍스트는 답변의 유도용 단서다. 학생이 명시적으로 언급하지 않은 강의·일정을 마치 본인이 입에 올린 것처럼 가정하지 말 것.",
  );

  return lines.join("\n");
}

function buildDynamicNow(): string {
  // 매 호출마다 다른 — 시각만. cache 밖으로 빠뜨려 학생 시간 인식 정확하게.
  const now = new Date();
  const iso = now.toISOString();
  const local = now.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "long",
    timeStyle: "short",
  });
  return `현재 시각: ${local} (UTC ${iso})`;
}

function formatKind(kind: string): string {
  switch (kind) {
    case "exam":
      return "시험";
    case "assignment":
      return "과제";
    case "presentation":
      return "발표";
    case "class":
      return "수업";
    case "summarize":
      return "요약";
    case "quiz":
      return "문제풀이";
    case "presentation_gen":
      return "발표 위저드";
    default:
      return kind;
  }
}

async function logGeneration(opts: {
  ownerId: string;
  modelId: string;
  usage: GenerateUsage;
  cost: number;
  status: "ok" | "rejected" | "error";
  errorMessage?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const admin = getAdminSupabase();
  const { error } = await admin.from("generations").insert({
    owner_id: opts.ownerId,
    tool: "chat-free",
    model_id: opts.modelId,
    input_tokens: opts.usage.inputTokens,
    output_tokens: opts.usage.outputTokens,
    cache_read_tokens: opts.usage.cacheReadTokens,
    cache_creation_tokens: opts.usage.cacheCreationTokens,
    cost_usd: opts.cost,
    status: opts.status,
    error_message: opts.errorMessage ?? null,
    payload: opts.payload ?? {},
  });
  if (error) {
    console.error("[chat-free] generations log failed", error.message);
  }
}
