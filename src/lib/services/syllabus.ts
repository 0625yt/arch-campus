import "server-only";
import { generate, generateWithFile, estimateCost } from "@/lib/claude";
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
 *   - course upsert (이미 같은 이름의 코스 있으면 업데이트, 없으면 생성)
 *   - events 후보 반환 (사용자 검토 후 별도 API로 confirm)
 *
 * 보안:
 *   - admin 클라이언트 쓰지만 항상 owner_id 강제
 *   - course 매칭은 (owner_id, name) 기준 — 다른 사용자 코스로 새지 않음
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

  // 1) PDF면 본문 안의 주차표·평가표를 좌표 기반으로 미리 뽑아 부록처럼 붙임.
  //    LLM이 표를 정확히 보게 됨 (본문 텍스트만으론 합쳐서 의미 깨짐).
  let extractedTablesNote = "";
  if (input.fileBytes && input.fileMediaType === "application/pdf") {
    try {
      // 흔한 강의계획서 표 헤더들. 한쪽이라도 매칭되면 표로 변환.
      const candidates: ReadonlyArray<readonly string[]> = [
        ["주차", "강의주제", "과제", "비고"],
        ["주차", "주제", "과제"],
        ["평가항목", "비중", "방법"],
        ["주", "내용"],
      ];
      const tables: string[] = [];
      for (const headers of candidates) {
        const r = await extractPdfTablesByHeader(input.fileBytes, {
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
    input.fileBytes &&
    input.fileMediaType &&
    (input.fileMediaType === "application/pdf" || input.fileMediaType.startsWith("image/"));
  try {
    if (useVision && input.fileBytes && input.fileMediaType) {
      // 강의계획서가 PDF/이미지로 들어오면 vision으로 그림 그대로 보기.
      // 본문 텍스트는 dynamicContext에 함께 넣어 모델이 양쪽 다 활용.
      result = await generateWithFile({
        tool: "syllabus-extract",
        rulePrompt,
        dynamicContext: dynamicContext + extractedTablesNote,
        fileBytes: input.fileBytes,
        mediaType: input.fileMediaType,
        userText:
          "위 강의계획서를 읽고 시험·과제·발표 일정과 과목 메타를 JSON으로 답하세요. 표가 있으면 시각적으로 정확히 매핑.",
        maxTokens: 4096,
        temperature: 0.1,
      });
    } else {
      result = await generate({
        tool: "syllabus-extract",
        rulePrompt,
        dynamicContext: dynamicContext + extractedTablesNote,
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

  let parsed: SyllabusOutputT;
  try {
    parsed = parseModelJson(SyllabusOutput, result.text);
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
      error: "AI 출력이 형식에 안 맞아요. 다시 시도해주세요.",
    };
  }

  // course upsert — owner_id + name 기준
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
  await admin
    .from("materials")
    .update({ course_id: courseId, type: "syllabus" })
    .eq("id", input.materialId)
    .eq("owner_id", input.ownerId);

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

  // 같은 이름 코스가 이미 있으면 update
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

function buildDynamicContext(meta: { title: string; semesterHint?: string }): string {
  const lines = [`강의계획서 메타:`, `- 제목/파일: ${meta.title}`];
  if (meta.semesterHint) lines.push(`- 사용자 학기 힌트: ${meta.semesterHint}`);
  lines.push(
    "",
    "위 정보를 기준으로 본문에서 명시된 일정만 추출. 추측 X. confidence 정직하게.",
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
    tool: "syllabus",
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
