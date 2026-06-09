import { after, NextResponse } from "next/server";
import { z } from "zod";
import { runQuizJob, runSummarizeJob, stripExt } from "@/app/api/materials/route";
import { pickRequestContext, recordAudit } from "@/lib/audit";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { enqueueJob } from "@/lib/data/jobs";
import { detectMergeMode, mergeAsText, mergePdfs } from "@/lib/merge-files";
import { guardRateLimit, type RateLimitErrBody } from "@/lib/ratelimit";
import type { Difficulty } from "@/lib/services/quiz";
import { downloadMaterialFile, uploadMergedPdf } from "@/lib/storage";
import { getAdminSupabase } from "@/lib/supabase/admin";

/** Office/HWP — PDF 변환 미지원, 업로드 차단 (CloudConvert 제거 2026-05-31). */
const REJECT_EXTENSIONS = new Set([
  "pptx",
  "ppt",
  "doc",
  "docx",
  "hwp",
  "hwpx",
  "odt",
  "odp",
  "rtf",
]);
function hasOfficeFile(filenames: string[]): boolean {
  return filenames.some((name) => {
    const dot = name.lastIndexOf(".");
    if (dot === -1) return false;
    return REJECT_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
  });
}

export const runtime = "nodejs";
export const maxDuration = 300;

const ALLOWED_TYPES = ["lecture", "assignment", "exam", "team", "syllabus", "notice"] as const;
type MaterialType = (typeof ALLOWED_TYPES)[number];

const SourceFile = z.object({
  storagePath: z.string().min(1).max(500),
  filename: z.string().min(1).max(300),
  mimeType: z.string().max(200).optional(),
});

const Body = z.object({
  /** primary material — quizzes/summaries가 이 materialId에 묶임. 1번째 파일 권장. */
  materialId: z.string().uuid(),
  /** 합칠 파일 목록 — 2개 이상. 첫 번째가 primary 파일 (제목·확장자 기준). */
  sources: z.array(SourceFile).min(2).max(10),
  courseId: z.string().uuid().optional(),
  /** 머지된 자료 제목 — 미지정 시 primary filename + "외 N개" */
  title: z.string().max(200).optional(),
  type: z.enum(ALLOWED_TYPES).optional(),
  difficulty: z.enum(["쉬움", "보통", "어려움"]).optional(),
  count: z.coerce.number().int().min(1).max(50).optional(),
  /** 업로드 모달에서 사용자가 입력한 한 줄 요약 요청. 120자 cap. */
  intentNote: z.string().max(120).optional(),
});

interface MergedOk {
  ok: true;
  materialId: string;
  /** "pdf" | "text-concat" — UI에서 안내 */
  mergeMode: "pdf" | "text-concat";
  mergedCount: number;
  jobs: {
    summarize: { id: string; status: "pending" | "running" | "done" | "error" | "cancelled" };
    quiz: { id: string; status: "pending" | "running" | "done" | "error" | "cancelled" };
  };
}

interface MergedErr {
  ok: false;
  error: string;
  /** "incompatible" — 형식 섞여서 합칠 수 없음 (클라가 "각각 등록" 폴백 가능) */
  reason?: "incompatible" | "validation" | "internal";
}

/**
 * 멀티 파일을 하나의 자료로 합쳐 등록.
 *
 * 흐름:
 *   1) 인증 + storagePath 모두 본인 영역인지 검증
 *   2) 형식 동질성 판단 (모두 PDF or 모두 비-PDF)
 *   3) 모든 파일 Storage download
 *   4) PDF면 pdf-lib로 merge → 새 PDF storage upload, 비-PDF면 텍스트 concat
 *   5) primary materials 행 INSERT (storage_path는 새 merged path 혹은 primary 원본)
 *   6) summarize/quiz 잡 enqueue + after()로 백그라운드 실행
 *
 * 안전:
 *   - 형식 섞이면 422 + reason="incompatible" → 클라가 "각각 등록" 폴백
 *   - PDF merge 실패 시 500 (호출자가 다시 시도하거나 각각 등록)
 *   - 합쳐진 결과 200K자 cap
 */
export async function POST(
  req: Request,
): Promise<NextResponse<MergedOk | MergedErr | RateLimitErrBody>> {
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

  let body: z.infer<typeof Body>;
  try {
    const raw = await req.json();
    body = Body.parse(raw);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: `요청 형식 오류: ${e instanceof Error ? e.message : "unknown"}`,
        reason: "validation",
      },
      { status: 400 },
    );
  }

  // 모든 storagePath가 본인 영역인지 검증
  for (const s of body.sources) {
    if (!s.storagePath.startsWith(`${ownerId}/`)) {
      return NextResponse.json(
        { ok: false, error: "다른 사용자 영역엔 접근할 수 없어요", reason: "validation" },
        { status: 403 },
      );
    }
  }

  // Office/HWP는 자동 변환 지원 X — 파일을 PDF로 저장해 다시 올리도록 안내.
  if (hasOfficeFile(body.sources.map((s) => s.filename))) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "PPTX·DOCX·HWP는 자동 변환을 지원하지 않아요. 각 파일을 PDF로 저장한 뒤 다시 올려주세요.",
        reason: "incompatible",
      },
      { status: 422 },
    );
  }

  const mimeTypes = body.sources.map((s) => s.mimeType ?? "application/octet-stream");
  const mode = detectMergeMode(mimeTypes);
  if (mode === "incompatible") {
    return NextResponse.json(
      {
        ok: false,
        error: "PDF와 다른 형식은 한 자료로 합칠 수 없어요. 각각 등록해 주세요.",
        reason: "incompatible",
      },
      { status: 422 },
    );
  }

  const admin = getAdminSupabase();
  const primary = body.sources[0];
  const title =
    (body.title ?? "").trim() || `${stripExt(primary.filename)} 외 ${body.sources.length - 1}개`;
  const type: MaterialType = body.type ?? "lecture";

  // primary mimeType — pdf merge면 application/pdf, text-concat이면 첫 파일의 mime
  const finalMimeType =
    mode === "pdf" ? "application/pdf" : (primary.mimeType ?? "application/octet-stream");

  // materials row 즉시 INSERT (full_text·page_count·storage_path는 after()에서 보정)
  // storage_path는 일단 primary 원본으로 잡고, pdf merge 성공 시 새 path로 update
  const { data: material, error: materialErr } = await admin
    .from("materials")
    .insert({
      id: body.materialId,
      owner_id: ownerId,
      course_id: body.courseId ?? null,
      title,
      type,
      original_filename: title,
      mime_type: finalMimeType,
      storage_path: primary.storagePath,
      page_count: null,
      full_text: null,
    })
    .select("id")
    .single();

  if (materialErr || !material) {
    return NextResponse.json(
      {
        ok: false,
        error: `materials 저장 실패: ${materialErr?.message ?? "unknown"}`,
        reason: "internal",
      },
      { status: 500 },
    );
  }

  // 감사 로그
  const ctx = pickRequestContext(req);
  void recordAudit({
    ownerId,
    action: "material.upload",
    targetType: "material",
    targetId: material.id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    metadata: {
      filename: title,
      mimeType: finalMimeType,
      type,
      merged: true,
      mergedCount: body.sources.length,
      mergeMode: mode,
    },
  });

  // 잡 enqueue
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

  // 백그라운드: download all → merge → update materials → 잡 실행
  // Office/HWP는 위에서 이미 422 차단. 여기 도달한 자료는 PDF·이미지·텍스트뿐.
  after(async () => {
    let downloaded: Array<{ filename: string; mimeType: string; bytes: Uint8Array }>;
    try {
      downloaded = await Promise.all(
        body.sources.map(async (s) => ({
          filename: s.filename,
          mimeType: s.mimeType ?? "application/octet-stream",
          bytes: await downloadMaterialFile(s.storagePath),
        })),
      );
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "파일을 못 찾았어요";
      await Promise.all([
        markBgJobError(summarizeEnqueue.job.id, ownerId, errMsg),
        markBgJobError(quizEnqueue.job.id, ownerId, errMsg),
      ]);
      return;
    }

    let merged: Awaited<ReturnType<typeof mergePdfs>>;
    try {
      merged = mode === "pdf" ? await mergePdfs(downloaded) : await mergeAsText(downloaded);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "병합 실패";
      await Promise.all([
        markBgJobError(summarizeEnqueue.job.id, ownerId, errMsg),
        markBgJobError(quizEnqueue.job.id, ownerId, errMsg),
      ]);
      return;
    }

    // PDF merge 성공 시 합쳐진 PDF를 새 storage path에 upload
    let finalStoragePath = primary.storagePath;
    if (merged.mode === "pdf" && merged.mergedPdfBytes) {
      try {
        const uploaded = await uploadMergedPdf({
          ownerId,
          materialId: material.id,
          bytes: merged.mergedPdfBytes,
        });
        finalStoragePath = uploaded.storagePath;
      } catch (e) {
        console.warn(
          "merged PDF upload 실패 — primary path 유지:",
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    // materials row 보정 (storage_path는 PDF 합본이 생겼으면 그쪽, mimeType도 같이)
    await admin
      .from("materials")
      .update({
        page_count: merged.pageCount,
        full_text: merged.sanitizedText.slice(0, 200_000),
        storage_path: finalStoragePath,
        ...(merged.mode === "pdf" ? { mime_type: "application/pdf" } : {}),
      })
      .eq("id", material.id)
      .eq("owner_id", ownerId);

    // 순차 실행 — Anthropic concurrent/token-per-min 보호.
    await runSummarizeJob({
      jobId: summarizeEnqueue.job.id,
      ownerId,
      materialId: material.id,
      title,
      type,
      fullText: merged.text,
      sanitizedText: merged.sanitizedText,
      pageCount: merged.pageCount,
      parserWarnings: merged.warnings,
      intentNote: body.intentNote?.trim() || undefined,
    });
    await runQuizJob({
      jobId: quizEnqueue.job.id,
      ownerId,
      materialId: material.id,
      courseId: body.courseId ?? null,
      title,
      type,
      fullText: merged.text,
      sanitizedText: merged.sanitizedText,
      pageCount: merged.pageCount,
      parserWarnings: merged.warnings,
      difficulty: (body.difficulty ?? "보통") as Difficulty,
      requestedCount: body.count ?? 10,
    });
  });

  return NextResponse.json({
    ok: true,
    materialId: material.id,
    mergeMode: mode,
    mergedCount: body.sources.length,
    jobs: {
      summarize: { id: summarizeEnqueue.job.id, status: summarizeEnqueue.job.status },
      quiz: { id: quizEnqueue.job.id, status: quizEnqueue.job.status },
    },
  });
}

async function markBgJobError(jobId: string, ownerId: string, message: string): Promise<void> {
  const { markJobError } = await import("@/lib/data/jobs");
  await markJobError({ jobId, ownerId, errorMessage: message });
}
