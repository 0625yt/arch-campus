import "server-only";
import { generate, estimateCost } from "@/lib/claude";
import { loadPrompt } from "@/lib/prompts";
import {
  parseModelJson,
  TimetableOutput,
  type TimetableOutputT,
  type TimetableSlotT,
} from "@/lib/schemas";
import { inferSemester } from "@/lib/semester";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { breakdown } from "@/lib/tokens";

/**
 * 시간표 서비스 — 시간표 PDF/이미지 본문 → 강의 N개 추출 → courses upsert (사용자 검토 후 events 생성).
 *
 * 책임:
 *   - Haiku 호출 (시간표는 구조 단순, 비용 적게)
 *   - Zod 검증
 *   - 추출된 강의 후보 반환 (사용자 검토 후 별도 confirm API에서 courses upsert)
 */

export interface TimetableExtractInput {
  ownerId: string;
  materialId: string;
  title: string;
  fullText: string;
  semesterHint?: string;
}

export type TimetableExtractResult =
  | {
      ok: true;
      output: TimetableOutputT;
      modelId: string;
      costUsd: number;
      tokenBudget: ReturnType<typeof breakdown>;
    }
  | { ok: false; status: 422 | 502 | 500; error: string };

export async function runTimetableExtraction(
  input: TimetableExtractInput,
): Promise<TimetableExtractResult> {
  const rulePrompt = loadPrompt("timetable");
  const dynamicContext = buildDynamicContext({
    title: input.title,
    semesterHint: input.semesterHint,
  });
  const tokenBudget = breakdown({
    rule: rulePrompt,
    dynamic: dynamicContext,
    user: input.fullText,
  });

  let result: Awaited<ReturnType<typeof generate>>;
  try {
    result = await generate({
      tool: "timetable-extract",
      rulePrompt,
      dynamicContext,
      userInput: input.fullText.slice(0, 80_000),
      maxTokens: 4096,
      temperature: 0.1,
    });
  } catch (e) {
    await logGeneration({
      ownerId: input.ownerId,
      materialId: input.materialId,
      modelId: "claude-haiku-4-5",
      status: "error",
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, status: 502, error: "AI 호출 실패" };
  }

  let parsed: TimetableOutputT;
  try {
    parsed = parseModelJson(TimetableOutput, result.text);
  } catch (e) {
    const costUsd = estimateCost(result.usage, result.modelId);
    await logGeneration({
      ownerId: input.ownerId,
      materialId: input.materialId,
      modelId: result.modelId,
      usage: result.usage,
      cost: costUsd,
      status: "error",
      errorMessage: `Zod 검증 실패: ${e instanceof Error ? e.message : String(e)}`,
      payload: { rawText: result.text.slice(0, 4000) },
    });
    if (process.env.NODE_ENV !== "production") {
      console.error("[timetable] Zod 검증 실패. 모델 raw 출력:\n" + result.text.slice(0, 4000));
    }
    return {
      ok: false,
      status: 502,
      error: "AI 출력이 형식에 안 맞아요. 다시 시도해주세요.",
    };
  }

  const costUsd = estimateCost(result.usage, result.modelId);
  await logGeneration({
    ownerId: input.ownerId,
    materialId: input.materialId,
    modelId: result.modelId,
    usage: result.usage,
    cost: costUsd,
    status: "ok",
    payload: { courseCount: parsed.courses.length },
  });

  return { ok: true, output: parsed, modelId: result.modelId, costUsd, tokenBudget };
}

/**
 * 사용자가 검토 후 확정한 강의들을 courses 테이블에 upsert + 매주 반복 class 이벤트 생성.
 *
 * 의도:
 *   - 시간표 등록 = 한 학기 동안 매주 같은 요일·시간에 수업 있음
 *   - 캘린더·Today에서 보이려면 events 테이블에 행이 박혀야 함 (둘 다 events만 조회)
 *   - 학기 시작·종료는 inferSemester로 추정 (3월~6월 봄, 9월~12월 가을)
 *
 * idempotency:
 *   - 같은 source_material_id로 이미 박힌 events 먼저 지우고 다시 박음
 *   - 사용자가 재시도해도 events 중복 안 생김
 */
export async function confirmTimetable(input: {
  ownerId: string;
  sourceMaterialId: string | null;
  termYear: number | null;
  termLabel: string | null;
  courses: Array<{
    name: string;
    professor: string | null;
    location: string | null;
    slots: TimetableSlotT[];
  }>;
}): Promise<
  | { ok: true; insertedCourses: number; insertedEvents: number }
  | { ok: false; error: string }
> {
  const admin = getAdminSupabase();
  const semester = inferSemester();
  const termStart = new Date(`${semester.termStart}T00:00:00+09:00`);
  const termEnd = new Date(`${semester.termEnd}T23:59:59+09:00`);

  // 같은 시간표를 다시 올린 경우 — 이전 자동 생성된 class events 먼저 삭제
  if (input.sourceMaterialId) {
    await admin
      .from("events")
      .delete()
      .eq("owner_id", input.ownerId)
      .eq("source_material_id", input.sourceMaterialId);
  }

  let insertedCourses = 0;
  const eventRows: Array<{
    owner_id: string;
    course_id: string;
    source_material_id: string | null;
    kind: "class";
    title: string;
    notes: string | null;
    starts_at: string;
    ends_at: string;
    all_day: false;
    confidence: number;
    confirmed: true;
  }> = [];

  for (const c of input.courses) {
    const courseId = await upsertCourse({
      ownerId: input.ownerId,
      name: c.name,
      professor: c.professor,
      location: c.location,
      schedule: c.slots.map(slotToScheduleString),
      termStart: semester.termStart,
      termEnd: semester.termEnd,
    });
    if (!courseId) continue;
    insertedCourses += 1;

    for (const slot of c.slots) {
      const occurrences = expandWeekly(slot, termStart, termEnd);
      for (const { startsAt, endsAt } of occurrences) {
        eventRows.push({
          owner_id: input.ownerId,
          course_id: courseId,
          source_material_id: input.sourceMaterialId,
          kind: "class",
          title: c.name,
          notes: c.location ?? null,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          all_day: false,
          confidence: 1,
          confirmed: true,
        });
      }
    }
  }

  // events 일괄 insert (chunk 분할 — 한 학기 8과목 × 주 2회 × 15주 = 240행 정도)
  let insertedEvents = 0;
  const CHUNK = 200;
  for (let i = 0; i < eventRows.length; i += CHUNK) {
    const chunk = eventRows.slice(i, i + CHUNK);
    const { error } = await admin.from("events").insert(chunk);
    if (error) {
      console.error("events insert 실패:", error.message);
      return { ok: false, error: `events 저장 실패: ${error.message}` };
    }
    insertedEvents += chunk.length;
  }

  return { ok: true, insertedCourses, insertedEvents };
}

/**
 * 학기 시작~종료 사이에 같은 요일이 들어오는 모든 날짜를 찾아
 * 매 주 반복되는 class 이벤트로 펼친다.
 */
function expandWeekly(
  slot: TimetableSlotT,
  termStart: Date,
  termEnd: Date,
): Array<{ startsAt: Date; endsAt: Date }> {
  const targetDay = WEEKDAY_TO_INDEX[slot.weekday];
  const [startH, startM] = slot.startTime.split(":").map(Number);
  const [endH, endM] = slot.endTime.split(":").map(Number);

  // 학기 시작 이후 첫 번째 targetDay 찾기
  const firstClass = new Date(termStart);
  while (firstClass.getDay() !== targetDay) {
    firstClass.setDate(firstClass.getDate() + 1);
    if (firstClass > termEnd) return [];
  }

  const list: Array<{ startsAt: Date; endsAt: Date }> = [];
  const cursor = new Date(firstClass);
  while (cursor <= termEnd) {
    const startsAt = new Date(cursor);
    startsAt.setHours(startH, startM, 0, 0);
    const endsAt = new Date(cursor);
    endsAt.setHours(endH, endM, 0, 0);
    list.push({ startsAt, endsAt });
    cursor.setDate(cursor.getDate() + 7);
  }
  return list;
}

const WEEKDAY_TO_INDEX: Record<TimetableSlotT["weekday"], number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

async function upsertCourse(opts: {
  ownerId: string;
  name: string;
  professor: string | null;
  location: string | null;
  schedule: string[];
  termStart: string;
  termEnd: string;
}): Promise<string | null> {
  const admin = getAdminSupabase();

  const { data: existing } = await admin
    .from("courses")
    .select("id")
    .eq("owner_id", opts.ownerId)
    .eq("name", opts.name)
    .maybeSingle();

  if (existing?.id) {
    await admin
      .from("courses")
      .update({
        professor: opts.professor,
        location: opts.location,
        schedule: opts.schedule,
        term_start: opts.termStart,
        term_end: opts.termEnd,
      })
      .eq("id", existing.id)
      .eq("owner_id", opts.ownerId);
    return existing.id;
  }

  const { data: created, error } = await admin
    .from("courses")
    .insert({
      owner_id: opts.ownerId,
      name: opts.name,
      professor: opts.professor,
      location: opts.location,
      schedule: opts.schedule,
      term_start: opts.termStart,
      term_end: opts.termEnd,
      category: "semester",
    })
    .select("id")
    .single();
  if (error || !created) {
    console.error("courses insert 실패:", error?.message);
    return null;
  }
  return created.id;
}

const WEEKDAY_KO: Record<TimetableSlotT["weekday"], string> = {
  MON: "월",
  TUE: "화",
  WED: "수",
  THU: "목",
  FRI: "금",
  SAT: "토",
  SUN: "일",
};

function slotToScheduleString(slot: TimetableSlotT): string {
  return `${WEEKDAY_KO[slot.weekday]} ${slot.startTime}-${slot.endTime}`;
}

function buildDynamicContext(meta: { title: string; semesterHint?: string }): string {
  const lines = [`시간표 메타:`, `- 제목/파일: ${meta.title}`];
  if (meta.semesterHint) lines.push(`- 학기 힌트: ${meta.semesterHint}`);
  lines.push(
    "",
    "위 자료는 한 학기 듣는 강의 N개를 표 형식으로 모아둔 시간표예요.",
    "본문에서 명시된 강의·요일·시간만 추출. 시험·과제 일정은 다루지 않아요.",
    "연속 교시는 한 슬롯으로 합치고, 같은 강의가 여러 요일에 있으면 한 강의의 slots에 모아요.",
  );
  return lines.join("\n");
}

async function logGeneration(opts: {
  ownerId: string;
  materialId: string;
  modelId: string;
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number };
  cost?: number;
  status: "ok" | "rejected" | "error";
  errorMessage?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const admin = getAdminSupabase();
  const { error } = await admin.from("generations").insert({
    owner_id: opts.ownerId,
    material_id: opts.materialId,
    tool: "timetable",
    model_id: opts.modelId,
    input_tokens: opts.usage?.inputTokens ?? 0,
    output_tokens: opts.usage?.outputTokens ?? 0,
    cache_read_tokens: opts.usage?.cacheReadTokens ?? 0,
    cache_creation_tokens: opts.usage?.cacheCreationTokens ?? 0,
    cost_usd: opts.cost ?? 0,
    status: opts.status,
    error_message: opts.errorMessage ?? null,
    payload: opts.payload ?? {},
  });
  if (error) console.error("generations 기록 실패:", error.message);
}
