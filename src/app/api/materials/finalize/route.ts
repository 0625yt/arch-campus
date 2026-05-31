import { after, NextResponse } from "next/server";
import { z } from "zod";
import { runQuizJob, runSummarizeJob, stripExt } from "@/app/api/materials/route";
import { pickRequestContext, recordAudit } from "@/lib/audit";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { convertToPdf, isConvertibleToPdf } from "@/lib/cloudconvert";
import { enqueueJob, markJobDone } from "@/lib/data/jobs";
import { ParserRejectedError, parseDocument } from "@/lib/parsers";
import { guardRateLimit, type RateLimitErrBody } from "@/lib/ratelimit";
import type { Difficulty } from "@/lib/services/quiz";
import { createSignedReadUrl, downloadMaterialFile } from "@/lib/storage";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

const ALLOWED_TYPES = ["lecture", "assignment", "exam", "team", "syllabus", "notice"] as const;
type MaterialType = (typeof ALLOWED_TYPES)[number];

const Body = z.object({
  /** /api/materials/upload-url이 발급한 storagePath. owner-prefix가 박혀있어야 통과 */
  storagePath: z.string().min(1).max(500),
  /** 원본 파일명 (UI 표시·확장자 파싱·title fallback) */
  filename: z.string().min(1).max(300),
  /** 클라이언트가 PUT할 때 사용한 mimeType. 파서가 분기 판단에 씀 */
  mimeType: z.string().max(200).optional(),
  /** UploadZone이 라우팅에 쓸 materialId — upload-url 응답으로 받음 */
  materialId: z.string().uuid(),
  courseId: z.string().uuid().optional(),
  title: z.string().max(200).optional(),
  type: z.enum(ALLOWED_TYPES).optional(),
  difficulty: z.enum(["쉬움", "보통", "어려움"]).optional(),
  // direct-upload도 동일 — 1~30, 미지정 시 10
  count: z.coerce.number().int().min(1).max(30).optional(),
});

interface PipelineOk {
  ok: true;
  materialId: string;
  parser: string;
  pageCount: number | null;
  jobs: {
    summarize: { id: string; status: "pending" | "running" | "done" | "error" | "cancelled" };
    quiz: { id: string; status: "pending" | "running" | "done" | "error" | "cancelled" };
    convertPdf?: { id: string; status: "pending" | "running" | "done" | "error" | "cancelled" };
  };
}

interface PipelineErr {
  ok: false;
  error: string;
  reason?: string;
}

/**
 * Direct upload 후속 처리.
 *
 * 클라이언트가 Supabase Storage에 직접 PUT한 다음 호출. 흐름:
 *
 *   1) 인증
 *   2) storagePath가 ownerId prefix인지 검증 — RLS 우회 service-role을 쓰므로 필수
 *   3) Storage에서 파일 다운로드
 *   4) 파싱 (실패는 placeholder)
 *   5) materials 행 INSERT (id = 클라이언트가 받은 materialId)
 *   6) summarize · quiz 잡 큐잉 + after()로 백그라운드 실행
 *
 * 기존 /api/materials POST(멀티파트)와 5단계 이후는 동일 — runSummarizeJob·runQuizJob을
 * 그대로 import해서 재사용.
 */
export async function POST(
  req: Request,
): Promise<NextResponse<PipelineOk | PipelineErr | RateLimitErrBody>> {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    throw e;
  }

  // ★ direct-upload 동선도 Sonnet × 2를 트리거 — POST /api/materials와 동일하게 두 버킷 가드.
  const uploadBlock = await guardRateLimit("upload", ownerId);
  if (uploadBlock) return uploadBlock;
  const aiBlock = await guardRateLimit("ai", ownerId);
  if (aiBlock) return aiBlock;

  let body: z.infer<typeof Body>;
  try {
    const raw = await req.json();
    body = Body.parse(raw);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `요청 형식 오류: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 400 },
    );
  }

  // storagePath가 본인 영역인지 확인 — admin.ts §4-1 storage 가드
  if (!body.storagePath.startsWith(`${ownerId}/`)) {
    return NextResponse.json(
      { ok: false, error: "다른 사용자 영역엔 접근할 수 없어요" },
      { status: 403 },
    );
  }

  const mimeType = body.mimeType ?? "application/octet-stream";
  const admin = getAdminSupabase();
  const title = (body.title ?? "").trim() || stripExt(body.filename);
  const type: MaterialType = body.type ?? "lecture";

  // 1) materials 행 즉시 INSERT (placeholder — full_text·page_count는 after()에서 채움)
  //    parse를 응답 전에 돌리면 5~15초 걸려 사용자가 dock을 못 보고 페이지 이동 시
  //    fetch가 abort되어 after()가 등록조차 안 됨. INSERT만 먼저 박고 빨리 응답한 뒤
  //    Storage download + parse + 잡 실행은 after()에 위임.
  const { data: material, error: materialErr } = await admin
    .from("materials")
    .insert({
      id: body.materialId,
      owner_id: ownerId,
      course_id: body.courseId ?? null,
      title,
      type,
      original_filename: body.filename,
      mime_type: mimeType,
      storage_path: body.storagePath,
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

  // 감사 로그 (fire-and-forget) — PIPA 24h 대응
  const ctx = pickRequestContext(req);
  void recordAudit({
    ownerId,
    action: "material.upload",
    targetType: "material",
    targetId: material.id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    metadata: { filename: body.filename, mimeType, type },
  });

  // 2) 잡 enqueue도 응답 전에 — dock 폴링이 즉시 잡음
  const [summarizeEnqueue, quizEnqueue] = await Promise.all([
    enqueueJob({
      ownerId,
      materialId: material.id,
      tool: "summarize",
      inputParams: { materialId: material.id, title, type },
    }),
    enqueueJob({
      ownerId,
      materialId: material.id,
      tool: "quiz",
      inputParams: {
        materialId: material.id,
        difficulty: body.difficulty ?? "보통",
        count: body.count ?? 10,
      },
    }),
  ]);

  // convert-pdf 큐잉 조건: (a) 이미 PDF 아니고 (b) cloudconvert가 처리 가능한 Office 확장자.
  // 텍스트·이미지·미지원 형식은 잡 자체를 안 만들어 사용자에게 "PDF로 못 바꿈" 에러 노출 X.
  // 원본은 dock에서 그대로 다운로드 가능.
  const needsPdfConvert =
    mimeType !== "application/pdf" && isConvertibleToPdf(body.filename);
  const convertEnqueue = needsPdfConvert
    ? await enqueueJob({
        ownerId,
        materialId: material.id,
        tool: "convert-pdf",
        inputParams: {
          materialId: material.id,
          sourceStoragePath: body.storagePath,
          filename: body.filename,
        },
      })
    : null;

  // 3) 무거운 작업 전부 백그라운드:
  //    a. Office면 cloudconvert로 PDF 변환 먼저 (await) — Gemini OCR이 표·수식·이미지까지 다 읽게
  //    b. Storage download (변환된 PDF or 원본)
  //    c. parseDocument
  //    d. materials.full_text/page_count 보정 UPDATE
  //    e. summarize/quiz 잡 실행
  //
  // 종전 흐름은 원본 PPTX를 officeparser로 텍스트만 뽑아 요약 시도 → 본문이 부실해 "요약 못 만듦"
  // 에러가 사용자에게 노출됐다. 사용자 결정(2026-05-31): Office는 변환 끝날 때까지 대기.
  after(async () => {
    let bytes: Uint8Array;
    let effectiveFilename = body.filename;
    let effectiveMimeType = mimeType;

    // Office 파일 → cloudconvert로 PDF 변환 먼저 (3~30s). 성공 시 변환된 PDF로 진행,
    // 실패 시 원본 폴백 (요약 부실 < 요약 0개).
    if (convertEnqueue) {
      try {
        const sourceUrl = await createSignedReadUrl({
          storagePath: body.storagePath,
          ttlSec: 600,
        });
        const pdfBytes = await convertToPdf({ sourceUrl, filename: body.filename });
        const pdfPath = `${ownerId}/${material.id}.pdf`;
        const { error: putErr } = await admin.storage
          .from("materials")
          .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
        if (putErr) throw new Error(`PDF 저장 실패: ${putErr.message}`);
        await admin
          .from("materials")
          .update({
            original_storage_path: body.storagePath,
            storage_path: pdfPath,
            mime_type: "application/pdf",
          })
          .eq("id", material.id)
          .eq("owner_id", ownerId);
        await markJobDone({
          jobId: convertEnqueue.job.id,
          ownerId,
          result: { pdfPath },
          modelId: "cloudconvert",
          usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
          costUsd: 0,
        });
        bytes = pdfBytes;
        effectiveFilename = body.filename.replace(/\.[^.]+$/, ".pdf");
        effectiveMimeType = "application/pdf";
      } catch (e) {
        // 변환 실패 — convert 잡은 error 마킹하되 요약·퀴즈는 원본으로 시도 (완전 실패보단 부실 결과)
        const msg = e instanceof Error ? e.message : "PDF 변환 실패";
        console.warn("[finalize] convert 실패 → 원본 폴백:", msg);
        await markBgJobError(convertEnqueue.job.id, ownerId, msg);
        try {
          bytes = await downloadMaterialFile(body.storagePath);
        } catch (e2) {
          const errMsg = e2 instanceof Error ? e2.message : "파일을 못 찾았어요";
          await Promise.all([
            markBgJobError(summarizeEnqueue.job.id, ownerId, errMsg),
            markBgJobError(quizEnqueue.job.id, ownerId, errMsg),
          ]);
          return;
        }
      }
    } else {
      // PDF·이미지·텍스트 — 종전 그대로 원본 다운로드
      try {
        bytes = await downloadMaterialFile(body.storagePath);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "파일을 못 찾았어요";
        await Promise.all([
          markBgJobError(summarizeEnqueue.job.id, ownerId, errMsg),
          markBgJobError(quizEnqueue.job.id, ownerId, errMsg),
        ]);
        return;
      }
    }

    let parsed: Awaited<ReturnType<typeof parseDocument>>;
    try {
      parsed = await parseDocument({
        bytes,
        filename: effectiveFilename,
        mimeType: effectiveMimeType,
      });
    } catch (e) {
      if (e instanceof ParserRejectedError) {
        const message = e.message;
        parsed = {
          text: `[자동 추출 실패]\n파일명: ${effectiveFilename}\n사유: ${message}`,
          sanitizedText: `[자동 추출 실패]\n파일명: ${effectiveFilename}\n사유: ${message}`,
          mimeType: effectiveMimeType,
          source: "rejected",
          warnings: [message],
        };
      } else {
        const errMsg = e instanceof Error ? e.message : "파싱 실패";
        await Promise.all([
          markBgJobError(summarizeEnqueue.job.id, ownerId, errMsg),
          markBgJobError(quizEnqueue.job.id, ownerId, errMsg),
        ]);
        return;
      }
    }

    // parse 결과로 materials row 보정
    await admin
      .from("materials")
      .update({
        page_count: parsed.pageCount ?? null,
        full_text: parsed.sanitizedText.slice(0, 200_000),
      })
      .eq("id", material.id)
      .eq("owner_id", ownerId);

    // 순차 실행 — Anthropic concurrent connection · 분당 토큰 limit 보호.
    await runSummarizeJob({
      jobId: summarizeEnqueue.job.id,
      ownerId,
      materialId: material.id,
      title,
      type,
      fullText: parsed.text,
      sanitizedText: parsed.sanitizedText,
      pageCount: parsed.pageCount ?? null,
      parserWarnings: parsed.warnings,
    });
    await runQuizJob({
      jobId: quizEnqueue.job.id,
      ownerId,
      materialId: material.id,
      courseId: body.courseId ?? null,
      title,
      type,
      fullText: parsed.text,
      sanitizedText: parsed.sanitizedText,
      pageCount: parsed.pageCount ?? null,
      parserWarnings: parsed.warnings,
      difficulty: (body.difficulty ?? "보통") as Difficulty,
      requestedCount: body.count ?? 10,
    });
  });

  return NextResponse.json({
    ok: true,
    materialId: material.id,
    parser: "pending",
    pageCount: null,
    jobs: {
      summarize: { id: summarizeEnqueue.job.id, status: summarizeEnqueue.job.status },
      quiz: { id: quizEnqueue.job.id, status: quizEnqueue.job.status },
      ...(convertEnqueue && {
        convertPdf: { id: convertEnqueue.job.id, status: convertEnqueue.job.status },
      }),
    },
  });
}

async function markBgJobError(jobId: string, ownerId: string, message: string): Promise<void> {
  const { markJobError } = await import("@/lib/data/jobs");
  await markJobError({ jobId, ownerId, errorMessage: message });
}
