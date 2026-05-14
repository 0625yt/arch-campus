import { NextResponse } from "next/server";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { parseDocument, ParserRejectedError } from "@/lib/parsers";
import { inferSemester } from "@/lib/semester";
import { runTimetableExtraction } from "@/lib/services/timetable";
import type { TimetableOutputT } from "@/lib/schemas";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { storeMaterialFile } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

interface OkResponse {
  ok: true;
  materialId: string;
  termYear: TimetableOutputT["termYear"];
  termLabel: TimetableOutputT["termLabel"];
  courses: TimetableOutputT["courses"];
  parser: string;
  pageCount?: number;
  usage: { costUsd: number };
}

interface ErrResponse {
  ok: false;
  error: string;
}

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
      { ok: false, error: "본문 추출이 너무 짧아 시간표를 파싱할 수 없어요" },
      { status: 422 },
    );
  }

  // 3. materials 행
  const admin = getAdminSupabase();
  const title = file.name.replace(/\.[^.]+$/, "");
  const { data: material, error: materialErr } = await admin
    .from("materials")
    .insert({
      owner_id: ownerId,
      title,
      // 시간표는 별도 type이 없어서 syllabus로 박지만 의미상 별개. payload에서 구분.
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

  // 4. 추출 — PDF/이미지면 vision 경로 (격자의 행/열 정확히 읽기 위함).
  // 텍스트 추출 결과(unpdf)는 요일 컬럼이 무너지므로, 같은 파일을 모델 눈으로 다시 보게 한다.
  const fileBytes = uploaded.bytes;
  const fileMediaType = uploaded.mimeType;
  const visionEligible =
    fileMediaType === "application/pdf" || fileMediaType.startsWith("image/");
  const result = await runTimetableExtraction({
    ownerId,
    materialId: material.id,
    title,
    fullText: parsed.sanitizedText,
    semesterHint,
    fileBytes: visionEligible ? fileBytes : undefined,
    fileMediaType: visionEligible ? fileMediaType : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    materialId: material.id,
    termYear: result.output.termYear,
    termLabel: result.output.termLabel,
    courses: result.output.courses,
    parser: parsed.source,
    pageCount: parsed.pageCount,
    usage: { costUsd: result.costUsd },
  });
}
