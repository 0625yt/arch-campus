import { NextResponse } from "next/server";
import { generate, estimateCost } from "@/lib/claude";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { parseDocument, ParserRejectedError } from "@/lib/parsers";
import { loadPrompt } from "@/lib/prompts";
import { parseModelJson, QuizOutput, type QuizOutputT } from "@/lib/schemas";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { storeMaterialFile } from "@/lib/storage";
import { breakdown } from "@/lib/tokens";

export const runtime = "nodejs";
export const maxDuration = 90;

interface QuizResponseOk {
  ok: true;
  quizId: string;
  materialId: string;
  parser: string;
  pageCount?: number;
  // 정답·해설은 풀이 끝나기 전엔 안 보냄 (사용자 무결성)
  questions: Array<{
    id: number;
    difficulty: string;
    topic: string;
    stem: string;
    choices: { key: "A" | "B" | "C" | "D"; text: string }[];
  }>;
  total: number;
  watermark: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    costUsd: number;
    tokenBudget: ReturnType<typeof breakdown>;
  };
}

interface QuizResponseErr {
  ok: false;
  error: string;
  reason?: string;
}

export async function POST(req: Request): Promise<NextResponse<QuizResponseOk | QuizResponseErr>> {
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
    return NextResponse.json(
      {
        ok: false,
        error: `form-data 파싱 실패: ${e instanceof Error ? e.message : "unknown"}`,
        reason: contentType,
      },
      { status: 400 },
    );
  }

  const file = form.get("file");
  const courseId = (form.get("courseId") ?? "") as string;
  const titleField = (form.get("title") ?? "") as string;
  const typeField = (form.get("type") ?? "lecture") as string;
  const difficulty = (form.get("difficulty") ?? "보통") as "쉬움" | "보통" | "어려움";
  const requestedCount = Math.min(Math.max(parseInt(String(form.get("count") ?? "5"), 10) || 5, 1), 10);

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "file 필드가 비어있어요" }, { status: 400 });
  }

  // 1. Storage
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

  // 2. parse + sanitize (거절도 placeholder)
  let parsed: Awaited<ReturnType<typeof parseDocument>>;
  try {
    parsed = await parseDocument({
      bytes: uploaded.bytes,
      filename: uploaded.filename,
      mimeType: uploaded.mimeType,
    });
  } catch (e) {
    if (e instanceof ParserRejectedError) {
      parsed = {
        text: `[자동 추출 실패]\n파일명: ${uploaded.filename}\n사유: ${e.message}`,
        sanitizedText: `[자동 추출 실패]\n파일명: ${uploaded.filename}\n사유: ${e.message}`,
        mimeType: uploaded.mimeType,
        source: "rejected",
        warnings: [e.message],
      };
    } else {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "파싱 실패" },
        { status: 500 },
      );
    }
  }

  // 3. materials 행
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

  // 4. Claude 호출
  const rulePrompt = loadPrompt("quiz");
  const isMetadataOnly = !parsed.sanitizedText || parsed.sanitizedText.trim().length < 60;
  const dynamicContext = buildDynamicContext({
    title,
    type: typeField,
    difficulty,
    requestedCount,
    pageCount: parsed.pageCount,
    isMetadataOnly,
    parserWarnings: parsed.warnings,
  });
  const tokenBudget = breakdown({
    rule: rulePrompt,
    dynamic: dynamicContext,
    user: parsed.sanitizedText,
  });

  let result: Awaited<ReturnType<typeof generate>>;
  try {
    result = await generate({
      tool: "quiz",
      rulePrompt,
      dynamicContext,
      userInput: parsed.sanitizedText.trim().length > 0
        ? parsed.sanitizedText.slice(0, 60_000)
        : `[본문 자동 추출 실패 — 파일명 ${title} · 종류 ${typeField}]`,
      maxTokens: 4096,
      temperature: 0.4,
    });
  } catch (e) {
    await logGen({
      ownerId,
      materialId: material.id,
      modelId: "claude-sonnet-4-6",
      status: "error",
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ ok: false, error: "AI 호출 실패" }, { status: 502 });
  }

  // 5. JSON + Zod
  let parsedQuiz: QuizOutputT;
  try {
    parsedQuiz = parseModelJson(QuizOutput, result.text);
  } catch (e) {
    await logGen({
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

  if (parsedQuiz.rejected) {
    return NextResponse.json(
      { ok: false, error: parsedQuiz.reason, reason: "rejected" },
      { status: 422 },
    );
  }

  // 6. quizzes 행 + generations 기록
  const costUsd = estimateCost(result.usage, result.modelId);
  const { data: quizRow, error: quizErr } = await admin
    .from("quizzes")
    .insert({
      owner_id: ownerId,
      material_id: material.id,
      course_id: courseId || null,
      title,
      difficulty,
      question_count: parsedQuiz.questions.length,
      questions: parsedQuiz.questions,
      watermark: parsedQuiz.watermark,
      model_id: result.modelId,
    })
    .select("id")
    .single();

  if (quizErr || !quizRow) {
    return NextResponse.json(
      { ok: false, error: `quizzes 저장 실패: ${quizErr?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  await logGen({
    ownerId,
    materialId: material.id,
    modelId: result.modelId,
    usage: result.usage,
    cost: costUsd,
    status: "ok",
    payload: { quizId: quizRow.id, questionCount: parsedQuiz.questions.length },
  });

  return NextResponse.json({
    ok: true,
    quizId: quizRow.id,
    materialId: material.id,
    parser: parsed.source,
    pageCount: parsed.pageCount,
    // 정답·해설·증거는 빼고 보냄 (제출 후 공개)
    questions: parsedQuiz.questions.map((q) => ({
      id: q.id,
      difficulty: q.difficulty,
      topic: q.topic,
      stem: q.stem,
      choices: q.choices,
    })),
    total: parsedQuiz.questions.length,
    watermark: parsedQuiz.watermark,
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
  difficulty: string;
  requestedCount: number;
  pageCount?: number;
  isMetadataOnly: boolean;
  parserWarnings: string[];
}): string {
  const lines: string[] = [
    `자료 메타:`,
    `- 제목: ${meta.title}`,
    `- 종류: ${meta.type}`,
    `- 요청 난이도: ${meta.difficulty}`,
    `- 요청 문제 개수: ${meta.requestedCount}`,
  ];
  if (meta.pageCount) lines.push(`- 분량: ${meta.pageCount}쪽`);
  if (meta.parserWarnings.length) lines.push(`- 파서 경고: ${meta.parserWarnings.join(", ")}`);
  if (meta.isMetadataOnly) {
    lines.push(
      "",
      "⚠ 본문 텍스트가 충분하지 않아요. 그래도 거절하지 말고:",
      "- 자료 종류·제목 기준으로 일반적인 학습 점검 문제 만들어주세요",
      "- evidence는 비울 수 있음 (메타만이라 substring 불가)",
      "- reason 없이 questions 채워서 응답",
    );
  }
  return lines.join("\n");
}

async function logGen(opts: {
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
    tool: "quiz",
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
