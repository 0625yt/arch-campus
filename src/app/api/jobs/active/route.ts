import { NextResponse } from "next/server";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { listActiveJobs } from "@/lib/data/jobs";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const TOOL_LABEL: Record<string, string> = {
  summarize: "요약",
  quiz: "문제",
  presentation: "발표 위저드",
  "wizard-cram": "벼락치기",
  "wizard-assignment": "과제 가이드",
  "wizard-exam": "시험 위저드",
  "syllabus-extract": "강의계획서 분석",
  "timetable-extract": "시간표 분석",
  "post-mortem": "시험 후 회고",
};

/**
 * GET /api/jobs/active
 *
 * 사이드바 JobsDock에서 폴링. 진행 중 작업 + 어느 자료 작업인지까지 한 번에.
 */
export async function GET(): Promise<NextResponse> {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    throw e;
  }

  const jobs = await listActiveJobs({ ownerId });
  if (jobs.length === 0) {
    return NextResponse.json({ ok: true, jobs: [] });
  }

  // 자료 제목 한 번에 join (materials 조회 1번)
  const admin = getAdminSupabase();
  const materialIds = Array.from(
    new Set(jobs.map((j) => j.materialId).filter((v): v is string => Boolean(v))),
  );
  const titleMap = new Map<string, { title: string; courseId: string | null }>();
  if (materialIds.length > 0) {
    const { data } = await admin
      .from("materials")
      .select("id, title, course_id")
      .eq("owner_id", ownerId)
      .in("id", materialIds);
    for (const row of data ?? []) {
      titleMap.set(row.id, { title: row.title, courseId: row.course_id });
    }
  }

  return NextResponse.json({
    ok: true,
    jobs: jobs.map((j) => {
      const meta = j.materialId ? titleMap.get(j.materialId) : null;
      return {
        id: j.id,
        tool: j.tool,
        toolLabel: TOOL_LABEL[j.tool] ?? j.tool,
        status: j.status,
        materialId: j.materialId,
        materialTitle: meta?.title ?? null,
        courseId: meta?.courseId ?? null,
        createdAt: j.createdAt,
        startedAt: j.startedAt,
      };
    }),
  });
}
