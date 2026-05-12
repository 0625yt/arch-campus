import { NextResponse } from "next/server";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { parseDocument, ParserRejectedError } from "@/lib/parsers";
import { runQuizGeneration, type Difficulty } from "@/lib/services/quiz";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { storeMaterialFile } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 90;

interface QuizResponseOk {
  ok: true;
  quizId: string;
  materialId: string;
  parser: string;
  pageCount?: number;
  questions: Array<{
    id: number;
    difficulty: string;
    topic: string;
    stem: string;
    choices: { key: "A" | "B" | "C" | "D"; text: string }[];
    hint?: string;
  }>;
  total: number;
  watermark: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    costUsd: number;
  };
}

interface QuizResponseErr {
  ok: false;
  error: string;
  reason?: string;
}

/**
 * 신규 파일 업로드 + 첫 퀴즈. 라우트의 책임은 인증 + 파일 → materials 행까지.
 * 모델 호출·검증·저장은 lib/services/quiz.ts에 위임.
 */
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
  const difficulty = (form.get("difficulty") ?? "보통") as Difficulty;
  const requestedCount = Math.min(
    Math.max(parseInt(String(form.get("count") ?? "5"), 10) || 5, 1),
    10,
  );

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

  // 2. Parse
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
  const allowedTypes = ["lecture", "assignment", "exam", "team", "syllabus", "notice"] as const;
  const safeType = (allowedTypes as readonly string[]).includes(typeField)
    ? (typeField as (typeof allowedTypes)[number])
    : "lecture";

  const { data: material, error: materialErr } = await admin
    .from("materials")
    .insert({
      owner_id: ownerId,
      course_id: courseId || null,
      title,
      type: safeType,
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

  // 4. 서비스 호출
  const result = await runQuizGeneration({
    ownerId,
    materialId: material.id,
    courseId: courseId || null,
    title,
    type: typeField,
    fullText: parsed.text,
    sanitizedText: parsed.sanitizedText,
    pageCount: parsed.pageCount ?? null,
    parserWarnings: parsed.warnings,
    difficulty,
    requestedCount,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, reason: result.status === 422 ? "rejected" : undefined },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    quizId: result.quizId,
    materialId: material.id,
    parser: parsed.source,
    pageCount: parsed.pageCount,
    questions: result.quiz.questions.map((q) => ({
      id: q.id,
      difficulty: q.difficulty,
      topic: q.topic,
      stem: q.stem,
      choices: q.choices,
      hint: q.hint,
    })),
    total: result.quiz.questions.length,
    watermark: result.quiz.watermark,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheReadTokens: result.usage.cacheReadTokens,
      cacheCreationTokens: result.usage.cacheCreationTokens,
      costUsd: result.costUsd,
    },
  });
}
