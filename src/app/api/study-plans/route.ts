import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { tryGetOwnerId } from "@/lib/auth";
import {
  getStudyCatalog,
  getStudyWorkspace,
  StudyStorageError,
  saveStudyWorkspace,
} from "@/lib/data/study-plans";
import { kstDateKey } from "@/lib/kst";
import { guardRateLimit } from "@/lib/ratelimit";
import {
  applyStudyTaskAction,
  createStudyTasks,
  type StudyAction,
  StudyPlanAction,
  validateStudyTarget,
} from "@/lib/study-plan";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const fail = (error: string, status: number) =>
  NextResponse.json({ ok: false, error }, { status, headers });
function storageFailure(error: unknown) {
  if (error instanceof StudyStorageError) return fail(error.message, error.status);
  console.error("study workspace failed", error instanceof Error ? error.name : "unknown");
  return fail("공부 계획을 처리하지 못했어요. 잠시 후 다시 시도해주세요.", 503);
}

export async function GET() {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) return fail("로그인이 필요해요.", 401);
  try {
    const [workspace, catalog] = await Promise.all([
      getStudyWorkspace(ownerId),
      getStudyCatalog(ownerId),
    ]);
    return NextResponse.json({ ok: true, workspace, catalog }, { headers });
  } catch (error) {
    return storageFailure(error);
  }
}

export async function POST(req: Request) {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) return fail("로그인이 필요해요.", 401);
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin)
    return fail("서비스 화면에서 다시 요청해주세요.", 403);
  const blocked = await guardRateLimit("default", ownerId);
  if (blocked) return blocked;
  let action: StudyAction;
  try {
    const text = await req.text();
    if (text.length > 8192) return fail("입력이 너무 길어요.", 413);
    action = StudyPlanAction.parse(JSON.parse(text));
  } catch {
    return fail("계획 입력을 확인해주세요.", 400);
  }
  try {
    const workspace = await getStudyWorkspace(ownerId);
    if (workspace.revision !== action.revision)
      return fail("다른 화면에서 계획이 바뀌었어요. 최신 계획을 불러온 뒤 다시 시도해주세요.", 409);
    const now = new Date();
    let next = workspace;
    if (action.action === "create") {
      const dateError = validateStudyTarget(action.targetDate, kstDateKey(now));
      if (dateError) return fail(dateError, 400);
      if (workspace.plans.length >= 30)
        return fail(
          "저장한 시험 계획은 30개까지예요. 필요 없는 보관 기록을 삭제한 뒤 다시 만들어주세요.",
          400,
        );
      if (workspace.plans.filter((plan) => !plan.archived).length >= 8)
        return fail("진행 중인 계획은 8개까지 만들 수 있어요. 끝난 계획을 보관해주세요.", 400);
      if (new Set(action.materialIds).size !== action.materialIds.length)
        return fail("같은 자료를 중복으로 선택할 수 없어요.", 400);
      const admin = getAdminSupabase();
      const [course, materials] = await Promise.all([
        admin
          .from("courses")
          .select("id")
          .eq("owner_id", ownerId)
          .eq("id", action.courseId)
          .eq("archived", false)
          .maybeSingle(),
        admin
          .from("materials")
          .select("id, title")
          .eq("owner_id", ownerId)
          .eq("course_id", action.courseId)
          .eq("type", "lecture")
          .in("id", action.materialIds),
      ]);
      if (course.error || materials.error) return fail("선택한 자료를 확인하지 못했어요.", 503);
      if (!course.data || materials.data?.length !== action.materialIds.length)
        return fail("이 과목에서 사용할 수 있는 자료를 선택해주세요.", 404);
      if (action.eventId) {
        const event = await admin
          .from("events")
          .select("starts_at")
          .eq("owner_id", ownerId)
          .eq("course_id", action.courseId)
          .eq("id", action.eventId)
          .eq("kind", "exam")
          .eq("confirmed", true)
          .maybeSingle();
        if (event.error) return fail("시험 일정을 확인하지 못했어요.", 503);
        if (!event.data || kstDateKey(event.data.starts_at) !== action.targetDate)
          return fail("시험 일정의 날짜와 계획 날짜를 확인해주세요.", 400);
      }
      const byId = new Map(materials.data.map((material) => [material.id, material]));
      const tasks = createStudyTasks(
        action.materialIds.map((id) => byId.get(id)!),
        kstDateKey(now),
        randomUUID,
      );
      next = {
        ...workspace,
        plans: [
          ...workspace.plans,
          {
            id: randomUUID(),
            courseId: action.courseId,
            title: action.title,
            targetDate: action.targetDate,
            scope: action.scope,
            eventId: action.eventId,
            materialIds: action.materialIds,
            createdAt: now.toISOString(),
            archived: false,
            tasks,
          },
        ],
      };
    } else if (action.action === "budget") {
      next = { ...workspace, dailyMinutes: action.dailyMinutes };
    } else if (action.action === "archive") {
      if (!workspace.plans.some((plan) => plan.id === action.planId))
        return fail("계획을 찾을 수 없어요.", 404);
      next = {
        ...workspace,
        plans: workspace.plans.map((plan) =>
          plan.id === action.planId ? { ...plan, archived: true } : plan,
        ),
      };
    } else if (action.action === "remove") {
      if (!workspace.plans.some((plan) => plan.id === action.planId && plan.archived))
        return fail("보관한 계획만 삭제할 수 있어요.", 400);
      next = { ...workspace, plans: workspace.plans.filter((plan) => plan.id !== action.planId) };
    } else {
      const updated = applyStudyTaskAction(workspace, action, now);
      if (!updated) return fail("변경할 공부 작업을 찾을 수 없어요.", 404);
      next = updated;
    }
    const saved = await saveStudyWorkspace(ownerId, next);
    revalidatePath("/dashboard/today");
    revalidatePath("/dashboard/study/plans");
    return NextResponse.json({ ok: true, workspace: saved }, { headers });
  } catch (error) {
    return storageFailure(error);
  }
}
