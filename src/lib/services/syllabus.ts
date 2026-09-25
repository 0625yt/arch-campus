import "server-only";
import { inferAcademicTerm, type SemesterTerm } from "@/lib/academic";
import {
  estimateCost,
  type GenerateUsage,
  generate,
  generateWithFile,
  getModelIdFor,
  getModelVendor,
} from "@/lib/claude";
import { extractPdfTablesByHeader } from "@/lib/parsers/pdf-grid";
import { loadPrompt } from "@/lib/prompts";
import { parseModelJson, SyllabusOutput, type SyllabusOutputT } from "@/lib/schemas";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { breakdown } from "@/lib/tokens";

/**
 * Syllabus 서비스 — 강의계획서 본문 → 일정·과목 메타 추출 → DB 등록 후보 반환.
 *
 * 책임:
 *   - Haiku 호출 (저비용)
 *   - Zod 검증
 *   - course upsert (같은 학기의 같은 이름 코스가 있으면 업데이트, 없으면 생성)
 *   - events 후보 반환 (사용자 검토 후 별도 API로 confirm)
 *
 * 보안:
 *   - admin 클라이언트 쓰지만 항상 owner_id 강제
 *   - course 매칭은 (owner_id, 학기, name) 기준 — 다른 학기·사용자 코스로 새지 않음
 */

export interface SyllabusExtractInput {
  ownerId: string;
  materialId: string;
  title: string;
  fullText: string;
  semesterHint?: string; // 예: "2026 봄학기"
  /** PDF/이미지 원본. 표가 본문에 많이 포함된 강의계획서를 정확히 읽기 위함 */
  fileBytes?: Uint8Array;
  fileMediaType?: string;
}

export type SyllabusExtractResult =
  | {
      ok: true;
      courseId: string;
      course: SyllabusOutputT["course"];
      eventsExtracted: SyllabusOutputT["events"];
      modelId: string;
      usage: GenerateUsage;
      costUsd: number;
      tokenBudget: ReturnType<typeof breakdown>;
    }
  | { ok: false; status: 422 | 502 | 500; error: string };

export async function runSyllabusExtraction(
  input: SyllabusExtractInput,
): Promise<SyllabusExtractResult> {
  const rulePrompt = loadPrompt("syllabus");
  const dynamicContext = buildDynamicContext({
    title: input.title,
    semesterHint: input.semesterHint,
  });
  const tokenBudget = breakdown({
    rule: rulePrompt,
    dynamic: dynamicContext,
    user: input.fullText,
  });

  // pdfjs·unpdf는 받은 Uint8Array의 underlying ArrayBuffer를 worker로 transfer해
  // detach 시킬 수 있다. 표 추출 후 같은 bytes를 vision 호출에 다시 쓰면 0바이트로
  // 갈 수 있으므로 용도별 복사본을 미리 분리한다.
  const fileBytesForTables = input.fileBytes ? input.fileBytes.slice() : undefined;
  const fileBytesForVision = input.fileBytes ? input.fileBytes.slice() : undefined;

  // 1) PDF면 본문 안의 주차표·평가표·강의시간 표를 좌표 기반으로 미리 뽑아 부록처럼 붙임.
  //    LLM이 표를 정확히 보게 됨 (본문 텍스트만으론 합쳐서 의미 깨짐).
  let extractedTablesNote = "";
  if (fileBytesForTables && input.fileMediaType === "application/pdf") {
    try {
      // 흔한 강의계획서 표 헤더들. 한쪽이라도 매칭되면 표로 변환.
      const candidates: ReadonlyArray<readonly string[]> = [
        ["주차", "강의주제", "과제", "비고"],
        ["주차", "주제", "과제"],
        ["평가항목", "비중", "방법"],
        ["주", "내용"],
        ["요일", "시간", "강의실"],
        ["요일", "교시", "강의실"],
        ["강의시간", "강의실"],
        ["수업시간", "강의실"],
      ];
      const tables: string[] = [];
      for (const headers of candidates) {
        const r = await extractPdfTablesByHeader(fileBytesForTables, {
          headerKeywords: headers,
          minMatches: Math.max(2, Math.floor(headers.length * 0.6)),
        });
        if (r.ok) {
          for (const t of r.tables) tables.push(t.markdown);
        }
      }
      if (tables.length > 0) {
        extractedTablesNote = [
          "",
          "[부록 — 본문에서 좌표 기반으로 정확히 재구성한 표]",
          ...tables,
        ].join("\n\n");
      }
    } catch {
      // 표 추출 실패는 본문만으로 진행
    }
  }

  let result: Awaited<ReturnType<typeof generate>>;
  const useVision =
    fileBytesForVision &&
    input.fileMediaType &&
    (input.fileMediaType === "application/pdf" || input.fileMediaType.startsWith("image/"));
  const textContext = dynamicContext + extractedTablesNote;
  const textInput = input.fullText.slice(0, 80_000);
  let fileReadError: unknown = null;
  try {
    if (useVision && fileBytesForVision && input.fileMediaType) {
      // 강의계획서가 PDF/이미지로 들어오면 vision으로 그림 그대로 보기.
      // 원본 판독이 외부 API/파일 제한으로 끊기면, 이미 파싱해둔 본문 텍스트로 한 번 더 살린다.
      try {
        result = await generateWithFile({
          tool: "syllabus-extract",
          rulePrompt,
          dynamicContext: textContext,
          fileBytes: fileBytesForVision,
          mediaType: input.fileMediaType,
          userText:
            "위 강의계획서를 읽고 시험·과제·발표 일정과 과목 메타를 JSON으로 답하세요. 표가 있으면 시각적으로 정확히 매핑하고, 강의 요일·시간(course.schedule)을 가능한 한 빠짐없이 추출하세요.",
          maxTokens: 4096,
          temperature: 0.1,
        });
      } catch (e) {
        fileReadError = e;
        console.error("[syllabus] file extraction failed; retrying text extraction", {
          message: errorMessage(e),
          mediaType: input.fileMediaType,
          bytes: fileBytesForVision.byteLength,
        });
        result = await generate({
          tool: "syllabus-extract",
          rulePrompt,
          dynamicContext:
            textContext +
            "\n\n[처리 메모] 원본 파일 직접 판독이 실패해, 서버가 추출한 본문 텍스트와 표 부록만으로 일정을 찾는다. 강의 요일·시간(course.schedule)도 본문에서 최대한 복원하라.",
          userInput: textInput,
          maxTokens: 4096,
          temperature: 0.1,
        });
      }
    } else {
      result = await generate({
        tool: "syllabus-extract",
        rulePrompt,
        dynamicContext: textContext,
        userInput: textInput,
        maxTokens: 4096,
        temperature: 0.1,
      });
    }
  } catch (e) {
    const detail = [
      fileReadError ? `file=${errorMessage(fileReadError)}` : null,
      `final=${errorMessage(e)}`,
    ]
      .filter(Boolean)
      .join(" | ");
    console.error("[syllabus] extraction failed", detail);
    await logGeneration({
      ownerId: input.ownerId,
      materialId: input.materialId,
      modelId: getModelIdFor("syllabus-extract"),
      status: "error",
      errorMessage: detail,
    });
    return {
      ok: false,
      status: 502,
      error:
        "강의계획서를 읽는 중 연결이 끊겼어요. 잠시 후 다시 시도하거나, 텍스트 선택이 되는 PDF/DOCX 파일로 올려주세요.",
    };
  }

  let parsed: SyllabusOutputT;
  try {
    parsed = parseModelJson(SyllabusOutput, result.text);
    parsed = fillMissingCourseSchedule(parsed, textInput);
    parsed = autoAlignScheduleAnchoredEvents(parsed);
    parsed = markScheduleWeekdayMismatches(parsed);
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
    return {
      ok: false,
      status: 502,
      error: "강의계획서에서 일정 후보를 정리하지 못했어요. 다시 시도해주세요.",
    };
  }

  // course upsert — owner_id + 학기 + name 기준
  const admin = getAdminSupabase();
  const courseId = await upsertCourse({
    ownerId: input.ownerId,
    name: parsed.course.name,
    professor: parsed.course.professor ?? null,
    location: parsed.course.location ?? null,
    schedule: parsed.course.schedule ?? null,
    termStart: parsed.course.termStart ?? null,
    termEnd: parsed.course.termEnd ?? null,
  });

  if (!courseId) {
    return { ok: false, status: 500, error: "courses upsert 실패" };
  }

  // 자료가 어느 코스 소속인지 갱신
  const { error: materialUpdateError } = await admin
    .from("materials")
    .update({ course_id: courseId, type: "syllabus" })
    .eq("id", input.materialId)
    .eq("owner_id", input.ownerId);
  if (materialUpdateError) {
    console.error("materials course 연결 실패:", materialUpdateError.message);
    return { ok: false, status: 500, error: "강의계획서와 과목 연결에 실패했어요." };
  }

  const costUsd = estimateCost(result.usage, result.modelId);
  await logGeneration({
    ownerId: input.ownerId,
    materialId: input.materialId,
    modelId: result.modelId,
    usage: result.usage,
    cost: costUsd,
    status: "ok",
    payload: { eventCount: parsed.events.length, courseId },
  });

  return {
    ok: true,
    courseId,
    course: parsed.course,
    eventsExtracted: parsed.events,
    modelId: result.modelId,
    usage: result.usage,
    costUsd,
    tokenBudget,
  };
}

async function upsertCourse(opts: {
  ownerId: string;
  name: string;
  professor: string | null;
  location: string | null;
  schedule: string[] | null;
  termStart: string | null;
  termEnd: string | null;
}): Promise<string | null> {
  const admin = getAdminSupabase();
  const semester = academicTermFromStart(opts.termStart);

  // 같은 학기의 같은 이름 코스가 이미 있으면 update
  const { data: existing, error: findError } = await admin
    .from("courses")
    .select("id")
    .eq("owner_id", opts.ownerId)
    .eq("name", opts.name)
    .eq("semester_year", semester.year)
    .eq("semester_term", semester.term)
    .eq("archived", false)
    .limit(1)
    .maybeSingle();
  if (findError) {
    console.error("courses 조회 실패:", findError.message);
    return null;
  }

  if (existing?.id) {
    const { error } = await admin
      .from("courses")
      .update({
        professor: opts.professor,
        location: opts.location,
        schedule: opts.schedule,
        term_start: opts.termStart,
        term_end: opts.termEnd,
        semester_year: semester.year,
        semester_term: semester.term,
      })
      .eq("id", existing.id)
      .eq("owner_id", opts.ownerId);
    if (error) {
      console.error("courses update 실패:", error.message);
      return null;
    }
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
      semester_year: semester.year,
      semester_term: semester.term,
      credits: 3,
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

function academicTermFromStart(
  termStart: string | null,
  now: Date = new Date(),
): { year: number; term: SemesterTerm } {
  const match = /^(\d{4})-(\d{2})-\d{2}/.exec(termStart ?? "");
  if (!match) return inferAcademicTerm(now);
  const calendarYear = Number(match[1]);
  const month = Number(match[2]);
  if (month <= 2) return { year: calendarYear - 1, term: "winter" };
  if (month <= 6) return { year: calendarYear, term: "spring" };
  if (month <= 8) return { year: calendarYear, term: "summer" };
  if (month <= 11) return { year: calendarYear, term: "fall" };
  return { year: calendarYear, term: "winter" };
}

function buildDynamicContext(meta: { title: string; semesterHint?: string }): string {
  const lines = [`강의계획서 메타:`, `- 제목/파일: ${meta.title}`];
  if (meta.semesterHint) lines.push(`- 사용자 학기 힌트: ${meta.semesterHint}`);
  lines.push("", "위 정보를 기준으로 본문에서 명시된 일정만 추출. 추측 X. confidence 정직하게.");
  return lines.join("\n");
}

function fillMissingCourseSchedule(parsed: SyllabusOutputT, fullText: string): SyllabusOutputT {
  const existing = parsed.course.schedule?.filter((v) => v.trim().length > 0) ?? [];
  if (existing.length > 0) return parsed;
  const inferred = inferScheduleFromText(fullText);
  if (inferred.length === 0) return parsed;
  return {
    ...parsed,
    course: {
      ...parsed.course,
      schedule: inferred,
    },
  };
}

function inferScheduleFromText(fullText: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (day: string, start: string, end: string) => {
    const normalized = `${day} ${normalizeTime(start)}-${normalizeTime(end)}`;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };

  const text = fullText.replace(/\u00a0/g, " ");
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const dayFirst = Array.from(
      line.matchAll(
        /((?:[월화수목금토일](?:요일)?(?:\s*(?:\/|,|·|&)\s*|\s+및\s+|\s+))*[월화수목금토일](?:요일)?)\s*(\d{1,2}:\d{2})\s*[~\-–—]\s*(\d{1,2}:\d{2})/g,
      ),
    );
    for (const match of dayFirst) {
      const days = extractWeekdayLabels(match[1] ?? "");
      const start = match[2];
      const end = match[3];
      if (!start || !end) continue;
      for (const day of days) push(day, start, end);
    }

    const timeFirst = Array.from(
      line.matchAll(
        /(\d{1,2}:\d{2})\s*[~\-–—]\s*(\d{1,2}:\d{2})\s*\(?(월|화|수|목|금|토|일)(?:요일)?\)?/g,
      ),
    );
    for (const match of timeFirst) {
      const start = match[1];
      const end = match[2];
      const day = match[3];
      if (!start || !end || !day) continue;
      push(day, start, end);
    }
  }

  return out.slice(0, 7);
}

function extractWeekdayLabels(raw: string): string[] {
  const found = raw.match(/[월화수목금토일](?=요일|[^가-힣]|$)/g) ?? [];
  return Array.from(new Set(found));
}

function normalizeTime(raw: string): string {
  const [hour, minute] = raw.split(":").map(Number);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function autoAlignScheduleAnchoredEvents(parsed: SyllabusOutputT): SyllabusOutputT {
  const scheduleWeekdays = extractScheduleWeekdays(parsed.course.schedule ?? []);
  if (scheduleWeekdays.length === 0) return parsed;

  return {
    ...parsed,
    events: parsed.events.map((event) => {
      if (!shouldAutoAlignToCourseDay(event)) return event;
      const eventDay = weekdayIndexOfStartsAt(event.startsAt);
      if (eventDay == null || scheduleWeekdays.includes(eventDay)) return event;
      const target = uniqueNearestWeekday(eventDay, scheduleWeekdays);
      if (target == null) return event;
      const delta = nearestWeekdayDelta(eventDay, target);
      const startsAt = shiftIsoDatePart(event.startsAt, delta);
      if (!startsAt) return event;
      const endsAt = event.endsAt ? shiftIsoDatePart(event.endsAt, delta) : event.endsAt;
      const note = `강의 요일(${WEEKDAY_KO[target]}) 기준으로 날짜를 자동 보정했어요.`;
      return {
        ...event,
        startsAt,
        endsAt,
        notes: event.notes?.trim() ? `${event.notes}\n${note}` : note,
        confidence: Math.max(event.confidence ?? 0.7, 0.8),
      };
    }),
  };
}

function markScheduleWeekdayMismatches(parsed: SyllabusOutputT): SyllabusOutputT {
  const scheduleWeekdays = extractScheduleWeekdays(parsed.course.schedule ?? []);
  if (scheduleWeekdays.length === 0) return parsed;

  const scheduleText = scheduleWeekdays.map((day) => WEEKDAY_KO[day]).join("/");
  return {
    ...parsed,
    events: parsed.events.map((event) => {
      if (!shouldCheckAgainstCourseDay(event)) return event;
      const eventDay = weekdayIndexOfStartsAt(event.startsAt);
      if (eventDay == null || scheduleWeekdays.includes(eventDay)) return event;
      const actualText = WEEKDAY_KO[eventDay];
      const warning = `확인 필요: 강의시간은 ${scheduleText}요일인데 이 일정은 ${actualText}요일로 잡혔어요.`;
      const notes = event.notes?.trim()
        ? event.notes.includes("강의시간은")
          ? event.notes
          : `${event.notes}\n${warning}`
        : warning;
      return {
        ...event,
        notes,
        confidence: Math.min(event.confidence ?? 0.7, 0.55),
      };
    }),
  };
}

function shouldCheckAgainstCourseDay(event: SyllabusOutputT["events"][number]): boolean {
  const text = `${event.title} ${event.notes ?? ""}`;
  if (/(제출|마감|LMS|입력|업로드|온라인|까지|deadline|due)/i.test(text)) return false;
  return (
    event.kind === "class" ||
    event.kind === "exam" ||
    event.kind === "presentation" ||
    /(시험|발표|퀴즈|워크북|Workbook|수업|Unit)/i.test(text)
  );
}

function shouldAutoAlignToCourseDay(event: SyllabusOutputT["events"][number]): boolean {
  if (!shouldCheckAgainstCourseDay(event)) return false;
  const text = `${event.title} ${event.notes ?? ""}`;
  if (extractWeekdayLabels(text).length > 0) return false;
  return (
    event.kind === "class" ||
    /(\d+\s*주차|\d+\s*주\b|week\s*\d+|unit\s*\d+|chapter\s*\d+|lesson\s*\d+|퀴즈|quiz|워크북|workbook|진도|수업|휴강|보강|토론|활동)/i.test(
      text,
    )
  );
}

function extractScheduleWeekdays(schedule: string[]): number[] {
  const out = new Set<number>();
  for (const item of schedule) {
    for (const [label, index] of Object.entries(WEEKDAY_TO_INDEX)) {
      const re = new RegExp(`(^|[^가-힣])${label}([^가-힣]|$)`);
      if (re.test(item)) out.add(index);
    }
  }
  return Array.from(out).sort((a, b) => a - b);
}

function weekdayIndexOfStartsAt(value: string): number | null {
  const dateKey = toKstDateKey(value);
  if (!dateKey) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function uniqueNearestWeekday(current: number, targets: number[]): number | null {
  const ranked = targets
    .map((target) => ({ target, distance: Math.abs(nearestWeekdayDelta(current, target)) }))
    .sort((a, b) => a.distance - b.distance);
  if (ranked.length === 0) return null;
  if (ranked.length > 1 && ranked[0].distance === ranked[1].distance) return null;
  return ranked[0].target;
}

function nearestWeekdayDelta(current: number, target: number): number {
  let delta = target - current;
  if (delta > 3) delta -= 7;
  if (delta < -3) delta += 7;
  return delta;
}

function shiftIsoDatePart(value: string, deltaDays: number): string | null {
  const dateKey = toKstDateKey(value);
  if (!dateKey) return null;
  const shifted = shiftDateKey(dateKey, deltaDays);
  if (!value.includes("T")) return shifted;
  return `${shifted}${value.slice(10)}`;
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function toKstDateKey(value: string): string | null {
  if (!value) return null;
  if (!value.includes("T")) return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

const WEEKDAY_TO_INDEX: Record<string, number> = {
  일: 0,
  월: 1,
  화: 2,
  수: 3,
  목: 4,
  금: 5,
  토: 6,
};

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

export const __test = {
  inferScheduleFromText,
  autoAlignScheduleAnchoredEvents,
  markScheduleWeekdayMismatches,
  academicTermFromStart,
};

async function logGeneration(opts: {
  ownerId: string;
  materialId: string;
  modelId: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
  cost?: number;
  status: "ok" | "rejected" | "error";
  errorMessage?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const admin = getAdminSupabase();
  const { error } = await admin.from("generations").insert({
    owner_id: opts.ownerId,
    material_id: opts.materialId,
    tool: "syllabus",
    model_id: opts.modelId,
    model_provider: getModelVendor(opts.modelId),
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

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
