import { NextResponse } from "next/server";
import { generate, estimateCost } from "@/lib/claude";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { classifyMaterial, classificationToContext, type Classification } from "@/lib/classify-material";
import { parseDocument, ParserRejectedError } from "@/lib/parsers";
import { loadPrompt } from "@/lib/prompts";
import { parseModelJson, SummarizeOutput } from "@/lib/schemas";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { storeMaterialFile } from "@/lib/storage";
import { breakdown } from "@/lib/tokens";

export const runtime = "nodejs";
export const maxDuration = 60;

interface SummarizeResponseOk {
  ok: true;
  materialId: string;
  parser: string;
  pageCount?: number;
  summary: ReturnType<typeof SummarizeOutput.parse>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    costUsd: number;
    tokenBudget: ReturnType<typeof breakdown>;
  };
}

interface SummarizeResponseError {
  ok: false;
  error: string;
  reason?: string;
}

export async function POST(req: Request): Promise<NextResponse<SummarizeResponseOk | SummarizeResponseError>> {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    throw e;
  }

  const contentType = req.headers.get("content-type") ?? "";
  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[/api/summarize] formData parse 실패", { contentType, detail });
    return NextResponse.json(
      { ok: false, error: `form-data 파싱 실패: ${detail}`, reason: contentType },
      { status: 400 },
    );
  }

  const file = form.get("file");
  const courseId = (form.get("courseId") ?? "") as string;
  const titleField = (form.get("title") ?? "") as string;
  const typeField = (form.get("type") ?? "lecture") as string;

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "file 필드가 비어있어요" }, { status: 400 });
  }

  // 1. Storage에 저장 + 바이트 확보
  let uploaded: Awaited<ReturnType<typeof storeMaterialFile>>;
  try {
    uploaded = await storeMaterialFile({
      ownerId,
      file,
      filename: file.name,
      mimeType: file.type,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "업로드 실패" },
      { status: 500 },
    );
  }

  // 2. 파싱 + sanitize — 거절도 placeholder로 살려냄 (사용자 자료는 무조건 결과 보장)
  let parsed: Awaited<ReturnType<typeof parseDocument>>;
  try {
    parsed = await parseDocument({
      bytes: uploaded.bytes,
      filename: uploaded.filename,
      mimeType: uploaded.mimeType,
    });
  } catch (e) {
    if (e instanceof ParserRejectedError) {
      // 빈 파일·파싱 실패도 placeholder 요약을 반환해서 UI가 끊기지 않게
      const message = e.message;
      parsed = {
        text: `[자동 추출 실패]\n파일명: ${uploaded.filename}\n사유: ${message}`,
        sanitizedText: `[자동 추출 실패]\n파일명: ${uploaded.filename}\n사유: ${message}`,
        mimeType: uploaded.mimeType,
        source: "rejected" as const,
        warnings: [message],
      };
    } else {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "파싱 실패" },
        { status: 500 },
      );
    }
  }

  // 짧은 텍스트(메타만)여도 거절하지 않음. 모델에게 "메타만으로 안내성 요약 만들어줘"로 지시.
  const isMetadataOnly = !parsed.sanitizedText || parsed.sanitizedText.trim().length < 60;

  // 3. materials 행 생성 (요약 결과랑 같이 묶어 두기)
  const admin = getAdminSupabase();
  const title = titleField || file.name.replace(/\.[^.]+$/, "");
  const { data: material, error: materialErr } = await admin
    .from("materials")
    .insert({
      owner_id: ownerId,
      course_id: courseId || null,
      title,
      type: (["lecture", "assignment", "exam", "team", "syllabus", "notice"].includes(typeField)
        ? typeField
        : "lecture") as "lecture",
      original_filename: uploaded.filename,
      mime_type: uploaded.mimeType,
      storage_path: uploaded.storagePath,
      page_count: parsed.pageCount ?? null,
      full_text: parsed.sanitizedText.slice(0, 200_000),
    })
    .select("id")
    .single();

  if (materialErr || !material) {
    return NextResponse.json(
      { ok: false, error: `materials 저장 실패: ${materialErr?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  // 4. 분류 (어떤 종류 자료인지 Haiku로 1차 판별)
  let classification: Classification | null = null;
  if (!isMetadataOnly) {
    classification = await classifyMaterial({
      title,
      type: typeField,
      fullText: parsed.sanitizedText,
      pageCount: parsed.pageCount,
    });
  }

  // 5. Claude 호출 (분류 힌트 주입)
  const rulePrompt = loadPrompt("summarize");
  const dynamicContext = buildDynamicContext({
    title,
    type: typeField,
    pageCount: parsed.pageCount,
    isMetadataOnly,
    parserWarnings: parsed.warnings,
    classification,
  });
  const tokenBudget = breakdown({
    rule: rulePrompt,
    dynamic: dynamicContext,
    user: parsed.sanitizedText,
  });

  let result: Awaited<ReturnType<typeof generate>>;
  try {
    result = await generate({
      tool: "summarize",
      rulePrompt,
      dynamicContext,
      userInput: parsed.sanitizedText.trim().length > 0
        ? parsed.sanitizedText.slice(0, 60_000)
        : `[본문 자동 추출 실패 — 파일명 ${title} · 종류 ${typeField}]`,
      maxTokens: 2048,
      temperature: 0.3,
    });
  } catch (e) {
    await logGeneration({
      ownerId,
      materialId: material.id,
      modelId: "claude-haiku-4-5",
      status: "error",
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { ok: false, error: "AI 호출 실패" },
      { status: 502 },
    );
  }

  // 5. JSON 파싱 + Zod 검증
  let summary: ReturnType<typeof SummarizeOutput.parse>;
  try {
    summary = parseModelJson(SummarizeOutput, result.text);
  } catch (e) {
    await logGeneration({
      ownerId,
      materialId: material.id,
      modelId: result.modelId,
      usage: result.usage,
      cost: estimateCost(result.usage, result.modelId),
      status: "error",
      errorMessage: `Zod 검증 실패: ${e instanceof Error ? e.message : String(e)}`,
      payload: { rawText: result.text.slice(0, 4000) },
    });
    return NextResponse.json(
      { ok: false, error: "AI 출력이 형식에 안 맞아요. 다시 시도해주세요." },
      { status: 502 },
    );
  }

  // 6. 비용·기록
  const costUsd = estimateCost(result.usage, result.modelId);
  await logGeneration({
    ownerId,
    materialId: material.id,
    modelId: result.modelId,
    usage: result.usage,
    cost: costUsd,
    status: "ok",
    payload: { summary },
  });

  return NextResponse.json({
    ok: true,
    materialId: material.id,
    parser: parsed.source,
    pageCount: parsed.pageCount,
    summary,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheReadTokens: result.usage.cacheReadTokens,
      cacheCreationTokens: result.usage.cacheCreationTokens,
      costUsd,
      tokenBudget,
    },
  });
}

function buildDynamicContext(meta: {
  title: string;
  type: string;
  pageCount?: number;
  isMetadataOnly?: boolean;
  parserWarnings?: string[];
  classification?: Classification | null;
}): string {
  const lines: string[] = [
    `자료 메타:`,
    `- 제목: ${meta.title}`,
    `- 종류: ${meta.type}`,
  ];
  if (meta.pageCount) lines.push(`- 분량: ${meta.pageCount}쪽`);
  if (meta.parserWarnings?.length) {
    lines.push(`- 파서 경고: ${meta.parserWarnings.join(", ")}`);
  }
  if (meta.classification) {
    lines.push("", classificationToContext(meta.classification));
  }
  if (meta.isMetadataOnly) {
    lines.push(
      "",
      "⚠ 본문 텍스트가 충분하지 않아요. 그래도 거절하지 말고:",
      "- leadSentence: 어떤 자료인지 메타로 한 줄 (예: '운영체제 5장 강의자료예요. 본문 추출이 안 돼서 정확한 요약은 어려워요.')",
      "- blocks: 자료 종류·제목 기준으로 학생이 다음에 할 수 있는 행동 가이드",
      "- keywords: 제목·종류에서 뽑힌 일반 용어 3~5개",
      "- reviewSpots: '본문이 더 명확한 자료를 다시 올려주세요' 같은 안내 1개",
      "본문 substring 인용 규칙은 이번엔 적용 안 함 (substring 없으니까).",
    );
  }
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
    tool: "summarize",
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
  if (error) {
    console.error("generations 기록 실패:", error.message);
  }
}
