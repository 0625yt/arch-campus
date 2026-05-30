import { after, NextResponse } from "next/server";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { enqueueJob, markJobDone, markJobError, markJobRunning } from "@/lib/data/jobs";
import { ParserRejectedError, parseDocument } from "@/lib/parsers";
import { guardRateLimit, type RateLimitErrBody } from "@/lib/ratelimit";
import { inferSemester } from "@/lib/semester";
import { runTimetableExtraction } from "@/lib/services/timetable";
import { storeMaterialFile } from "@/lib/storage";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

interface OkResponse {
  ok: true;
  materialId: string;
  jobId: string;
  status: "pending";
}

interface ErrResponse {
  ok: false;
  error: string;
}

export async function POST(
  req: Request,
): Promise<NextResponse<OkResponse | ErrResponse | RateLimitErrBody>> {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    throw e;
  }

  const uploadBlock = await guardRateLimit("upload", ownerId);
  if (uploadBlock) return uploadBlock;
  const aiBlock = await guardRateLimit("ai", ownerId);
  if (aiBlock) return aiBlock;

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
      page_count: null,
      full_text: null,
    })
    .select("id")
    .single();

  if (materialErr || !material) {
    return NextResponse.json(
      { ok: false, error: `materials 저장 실패: ${materialErr?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  const { job } = await enqueueJob({
    ownerId,
    materialId: material.id,
    tool: "timetable-extract",
    inputParams: { materialId: material.id, title, filename: uploaded.filename },
  });

  const bytesForParse = uploaded.bytes.slice();
  const bytesForExtract = uploaded.bytes.slice();
  const mimeType = uploaded.mimeType;
  after(async () => {
    try {
      await markJobRunning({ jobId: job.id, ownerId });

      let parsed: Awaited<ReturnType<typeof parseDocument>>;
      try {
        parsed = await parseDocument({
          bytes: bytesForParse,
          filename: uploaded.filename,
          mimeType,
        });
      } catch (e) {
        if (e instanceof ParserRejectedError) {
          await markJobError({
            jobId: job.id,
          ownerId,
            errorMessage: `파일을 읽을 수 없어요: ${e.message}`,
          });
          return;
        }
        throw e;
      }

      await admin
        .from("materials")
        .update({
          page_count: parsed.pageCount ?? null,
          full_text: parsed.sanitizedText.slice(0, 200_000),
        })
        .eq("id", material.id)
        .eq("owner_id", ownerId);

      if (parsed.sanitizedText.trim().length < 80) {
        await markJobError({
          jobId: job.id,
          ownerId,
          errorMessage: "본문 추출이 너무 짧아 시간표를 파싱할 수 없어요",
        });
        return;
      }

      const visionEligible = mimeType === "application/pdf" || mimeType.startsWith("image/");
      const result = await runTimetableExtraction({
        ownerId,
        materialId: material.id,
        title,
        fullText: parsed.sanitizedText,
        semesterHint,
        fileBytes: visionEligible ? bytesForExtract : undefined,
        fileMediaType: visionEligible ? mimeType : undefined,
      });

      if (!result.ok) {
        await markJobError({ jobId: job.id, ownerId, errorMessage: result.error });
        return;
      }

      await markJobDone({
        jobId: job.id,
        ownerId,
        result: {
          extracted: {
            materialId: material.id,
            termYear: result.output.termYear,
            termLabel: result.output.termLabel,
            courses: result.output.courses,
            parser: parsed.source,
            pageCount: parsed.pageCount ?? null,
            usage: { costUsd: result.costUsd },
          },
        },
        modelId: result.modelId,
        usage: result.usage,
        costUsd: result.costUsd,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "시간표 분석 실패";
      await markJobError({ jobId: job.id, ownerId, errorMessage: message });
    }
  });
  return NextResponse.json({ ok: true, materialId: material.id, jobId: job.id, status: "pending" });
}
