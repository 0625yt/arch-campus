import { after, NextResponse } from "next/server";
import { z } from "zod";
import { runQuizJob, runSummarizeJob, stripExt } from "@/app/api/materials/route";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { enqueueJob } from "@/lib/data/jobs";
import { parseDocument, ParserRejectedError } from "@/lib/parsers";
import { type Difficulty } from "@/lib/services/quiz";
import { downloadMaterialFile } from "@/lib/storage";
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
  count: z.coerce.number().int().min(1).max(10).optional(),
});

interface PipelineOk {
  ok: true;
  materialId: string;
  parser: string;
  pageCount: number | null;
  jobs: {
    summarize: { id: string; status: "pending" | "running" | "done" | "error" | "cancelled" };
    quiz: { id: string; status: "pending" | "running" | "done" | "error" | "cancelled" };
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
export async function POST(req: Request): Promise<NextResponse<PipelineOk | PipelineErr>> {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    throw e;
  }

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

  // 1) Storage 다운로드
  let bytes: Uint8Array;
  try {
    bytes = await downloadMaterialFile(body.storagePath);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "파일을 못 찾았어요" },
      { status: 404 },
    );
  }

  const mimeType = body.mimeType ?? "application/octet-stream";

  // 2) Parse
  let parsed: Awaited<ReturnType<typeof parseDocument>>;
  try {
    parsed = await parseDocument({
      bytes,
      filename: body.filename,
      mimeType,
    });
  } catch (e) {
    if (e instanceof ParserRejectedError) {
      const message = e.message;
      parsed = {
        text: `[자동 추출 실패]\n파일명: ${body.filename}\n사유: ${message}`,
        sanitizedText: `[자동 추출 실패]\n파일명: ${body.filename}\n사유: ${message}`,
        mimeType,
        source: "rejected",
        warnings: [message],
      };
    } else {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "파싱 실패" },
        { status: 500 },
      );
    }
  }

  // 3) materials 행
  const admin = getAdminSupabase();
  const title = (body.title ?? "").trim() || stripExt(body.filename);
  const type: MaterialType = body.type ?? "lecture";

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

  // 4) 두 잡 큐잉
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

  // 5) 백그라운드 실행 — runSummarizeJob/runQuizJob은 기존 materials/route.ts와 공유
  after(async () => {
    await Promise.all([
      runSummarizeJob({
        jobId: summarizeEnqueue.job.id,
        ownerId,
        materialId: material.id,
        title,
        type,
        fullText: parsed.text,
        sanitizedText: parsed.sanitizedText,
        pageCount: parsed.pageCount ?? null,
        parserWarnings: parsed.warnings,
      }),
      runQuizJob({
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
      }),
    ]);
  });

  return NextResponse.json({
    ok: true,
    materialId: material.id,
    parser: parsed.source,
    pageCount: parsed.pageCount ?? null,
    jobs: {
      summarize: { id: summarizeEnqueue.job.id, status: summarizeEnqueue.job.status },
      quiz: { id: quizEnqueue.job.id, status: quizEnqueue.job.status },
    },
  });
}
