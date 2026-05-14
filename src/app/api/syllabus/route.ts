import { NextResponse } from "next/server";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { parseDocument, ParserRejectedError } from "@/lib/parsers";
import { inferSemester } from "@/lib/semester";
import { runSyllabusExtraction } from "@/lib/services/syllabus";
import { type SyllabusOutputT } from "@/lib/schemas";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { storeMaterialFile } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

interface OkResponse {
  ok: true;
  materialId: string;
  courseId: string;
  course: SyllabusOutputT["course"];
  events: SyllabusOutputT["events"];
  parser: string;
  pageCount?: number;
  usage: { costUsd: number };
}

interface ErrResponse {
  ok: false;
  error: string;
}

/**
 * 강의계획서 파일 업로드 → AI 파싱 → courses upsert → events 후보 반환.
 * 후보는 즉시 DB에 박지 않음 (사용자 검토 후 /api/syllabus/confirm).
 */
export async function POST(req: Request): Promise<NextResponse<OkResponse | ErrResponse>> {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    throw e;
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `form-data 파싱 실패: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 400 },
    );
  }

  const file = form.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "file 필드가 비어있어요" }, { status: 400 });
  }

  // 학기는 자동 추정 — 사용자 입력 없이 오늘 날짜 기준
  const semesterHint = inferSemester().label;

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
      return NextResponse.json(
        { ok: false, error: `파일을 읽을 수 없어요: ${e.message}` },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "파싱 실패" },
      { status: 500 },
    );
  }

  if (parsed.sanitizedText.trim().length < 80) {
    return NextResponse.json(
      { ok: false, error: "본문 추출이 너무 짧아 강의계획서를 파싱할 수 없어요" },
      { status: 422 },
    );
  }

  // 3. materials 행 (type = syllabus)
  const admin = getAdminSupabase();
  const title = file.name.replace(/\.[^.]+$/, "");
  const { data: material, error: materialErr } = await admin
    .from("materials")
    .insert({
      owner_id: ownerId,
      title,
      type: "syllabus",
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

  // 4. AI 추출 — PDF/이미지면 vision 경로(서비스가 알아서 분기).
  // parseDocument()가 uploaded.bytes의 underlying buffer를 detach시키므로
  // 서비스에 줄 바이트는 Storage에서 다시 받는다.
  const visionEligible =
    uploaded.mimeType === "application/pdf" || uploaded.mimeType.startsWith("image/");
  let freshFileBytes: Uint8Array | undefined;
  if (visionEligible) {
    try {
      const { downloadMaterialFile } = await import("@/lib/storage");
      freshFileBytes = await downloadMaterialFile(uploaded.storagePath);
    } catch (e) {
      console.error("[syllabus] storage redownload failed, vision path disabled", e);
    }
  }
  const result = await runSyllabusExtraction({
    ownerId,
    materialId: material.id,
    title,
    fullText: parsed.sanitizedText,
    semesterHint,
    fileBytes: freshFileBytes,
    fileMediaType: freshFileBytes ? uploaded.mimeType : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    materialId: material.id,
    courseId: result.courseId,
    course: result.course,
    events: result.eventsExtracted,
    parser: parsed.source,
    pageCount: parsed.pageCount,
    usage: { costUsd: result.costUsd },
  });
}
