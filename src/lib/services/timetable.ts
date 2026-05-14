import "server-only";
import { generate, generateWithFile, estimateCost } from "@/lib/claude";
import { extractTimetableGrid } from "@/lib/parsers/pdf-grid";
import { extractTimetableGridFromXlsx } from "@/lib/parsers/xlsx-grid";
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
 * 시간표 서비스 — 시간표 자료 → 강의 N개 추출 → courses upsert (사용자 검토 후 events 생성).
 *
 * 추출 우선순위 (정확도 ↓ 비용 ↑):
 *   1) PDF면 좌표 파서로 격자 재구성 시도 → 성공하면 markdown 표를 LLM에
 *      Haiku로 매핑만 시키기 (가장 정확·저비용. 학교 포털 PDF 99% 잡힘)
 *   2) 좌표 못 찾으면(스캔 PDF·이미지) Vision Sonnet으로 그림 그대로
 *   3) 그것도 안 되면 단순 텍스트 추출 결과로 폴백 (docx 등)
 */

export interface TimetableExtractInput {
  ownerId: string;
  materialId: string;
  title: string;
  fullText: string;
  semesterHint?: string;
  /** PDF·이미지면 vision API로 직접 보냄. 셋이 같이 오면 fileBytes 우선 */
  fileBytes?: Uint8Array;
  fileMediaType?: string;
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

  // 1) 좌표 기반 그리드 재구성 — PDF/Excel은 좌표가 사실로 박혀있어 99% 정확.
  let gridMarkdown: string | null = null;
  let gridSource: "pdf" | "xlsx" | null = null;
  const isPdf = input.fileMediaType === "application/pdf";
  const isXlsx =
    input.fileMediaType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    input.fileMediaType === "application/vnd.ms-excel" ||
    /\.xlsx?$/i.test(input.title);
  const HEADER_KEYWORDS = ["일", "월", "화", "수", "목", "금", "토"] as const;
  if (isPdf && input.fileBytes) {
    try {
      const g = await extractTimetableGrid(input.fileBytes);
      if (g.ok) {
        gridMarkdown = g.markdown;
        gridSource = "pdf";
      }
    } catch {
      // pdf 좌표 실패 → vision 폴백으로 자연스럽게
    }
  }
  if (!gridMarkdown && isXlsx && input.fileBytes) {
    try {
      const g = await extractTimetableGridFromXlsx(input.fileBytes, {
        headerKeywords: HEADER_KEYWORDS,
        minMatches: 4,
      });
      if (g.ok && g.grids.length > 0) {
        // 가장 row 많은 시트를 메인으로 (보통 한 시트에 한 학기)
        const main = g.grids.sort((a, b) => b.rows.length - a.rows.length)[0];
        gridMarkdown = `시트: ${main.sheetName}\n\n${main.markdown}`;
        gridSource = "xlsx";
      }
    } catch {
      // xlsx 좌표 실패 → 일반 텍스트 폴백
    }
  }

  // 2) 추출 경로 결정
  //    - gridMarkdown 있음 → 텍스트로 LLM에 (Haiku, 저비용·고정확)
  //    - 좌표 못 잡고 PDF/이미지 있음 → Vision (Sonnet, 비싸지만 그림 그대로)
  //    - 둘 다 안 되면 → 일반 텍스트 추출 결과 (docx 등 마지막 폴백)
  let result: Awaited<ReturnType<typeof generate>>;
  const fallbackToVision =
    !gridMarkdown &&
    input.fileBytes &&
    input.fileMediaType &&
    (input.fileMediaType === "application/pdf" || input.fileMediaType.startsWith("image/"));

  try {
    if (gridMarkdown) {
      const sourceLabel = gridSource === "xlsx" ? "Excel 셀 좌표" : "PDF 텍스트 좌표";
      const userPayload = [
        `아래는 시간표 자료에서 ${sourceLabel} 기반으로 정확히 재구성한 격자 표입니다.`,
        "각 셀의 요일은 컬럼 헤더에 의해 이미 확정됐으니 추측하지 말고 그대로 매핑하세요.",
        "빈 셀(\"-\")은 강의 없음.",
        "",
        gridMarkdown,
      ].join("\n");
      result = await generate({
        tool: "timetable-extract",
        rulePrompt,
        dynamicContext,
        userInput: userPayload,
        maxTokens: 4096,
        temperature: 0.1,
      });
    } else if (fallbackToVision && input.fileBytes && input.fileMediaType) {
      result = await generateWithFile({
        tool: "timetable-extract",
        rulePrompt,
        dynamicContext,
        fileBytes: input.fileBytes,
        mediaType: input.fileMediaType,
        userText:
          "위 시간표 그림을 그대로 보고, 격자의 행=교시(시간), 열=요일을 정확히 매칭해서 JSON으로 답하세요. 빈 칸은 제외.",
        maxTokens: 4096,
        temperature: 0.1,
      });
    } else {
      result = await generate({
        tool: "timetable-extract",
        rulePrompt,
        dynamicContext,
        userInput: input.fullText.slice(0, 80_000),
        maxTokens: 4096,
        temperature: 0.1,
      });
    }
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

  // 같은 시간표를 다시 올린 경우 — 이전 자동 생성된 class events 먼저 삭제.
  // sourceMaterialId 일치하는 것 + 같은 강의명으로 묶인 class kind까지 같이 청소.
  // (다른 파일로 다시 올린 경우에도 같은 강의명이면 깨끗하게 갈아끼워짐)
  if (input.sourceMaterialId) {
    await admin
      .from("events")
      .delete()
      .eq("owner_id", input.ownerId)
      .eq("source_material_id", input.sourceMaterialId);
  }
  const incomingNames = input.courses.map((c) => c.name);
  if (incomingNames.length > 0) {
    const { data: existingCourses } = await admin
      .from("courses")
      .select("id")
      .eq("owner_id", input.ownerId)
      .in("name", incomingNames);
    const existingIds = (existingCourses ?? []).map((c) => c.id);
    if (existingIds.length > 0) {
      await admin
        .from("events")
        .delete()
        .eq("owner_id", input.ownerId)
        .eq("kind", "class")
        .in("course_id", existingIds);
    }
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
