import { NextResponse } from "next/server";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { parseDocument, ParserRejectedError } from "@/lib/parsers";
import { runSummarize } from "@/lib/services/summarize";
import { type SummarizeOutputT } from "@/lib/schemas";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { storeMaterialFile } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

interface SummarizeResponseOk {
  ok: true;
  materialId: string;
  parser: string;
  pageCount?: number;
  summary: SummarizeOutputT;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    costUsd: number;
  };
}

interface SummarizeResponseError {
  ok: false;
  error: string;
  reason?: string;
}

/**
 * 신규 자료 업로드 + 첫 요약. 라우트의 책임은 "파일을 받아서 materials 행 만들고 본문 뽑기"까지.
 * 모델 호출·검증·캐시 갱신은 lib/services/summarize.ts에 위임.
 */
export async function POST(
  req: Request,
): Promise<NextResponse<SummarizeResponseOk | SummarizeResponseError>> {
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

  // 1. Storage 저장
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

  // 2. 파싱 — 거절도 placeholder로 살려서 사용자 결과 끊기지 않게
  let parsed: Awaited<ReturnType<typeof parseDocument>>;
  try {
    parsed = await parseDocument({
      bytes: uploaded.bytes,
      filename: uploaded.filename,
      mimeType: uploaded.mimeType,
    });
  } catch (e) {
    if (e instanceof ParserRejectedError) {
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

  // 3. materials 행 생성
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

  // 4. 요약 서비스 위임
  const result = await runSummarize({
    ownerId,
    materialId: material.id,
    title,
    type: typeField,
    fullText: parsed.text,
    sanitizedText: parsed.sanitizedText,
    pageCount: parsed.pageCount ?? null,
    parserWarnings: parsed.warnings,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.stage === "ai" ? 502 : 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    materialId: material.id,
    parser: parsed.source,
    pageCount: parsed.pageCount,
    summary: result.summary,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheReadTokens: result.usage.cacheReadTokens,
      cacheCreationTokens: result.usage.cacheCreationTokens,
      costUsd: result.costUsd,
    },
  });
}
