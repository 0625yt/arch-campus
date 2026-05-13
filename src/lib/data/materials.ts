import "server-only";
import { z } from "zod";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { SummarizeOutput, type SummarizeOutputT } from "@/lib/schemas";

/**
 * Materials DAL (Data Access Layer).
 *
 * 의도: server pages와 route handlers가 같은 입구로 자료를 읽게 한다.
 *   - owner_id 강제 — Supabase admin 클라이언트 쓰지만 항상 .eq("owner_id", ownerId)
 *   - SummarizeOutput Zod 검증 — DB의 jsonb가 schema 어긋나면 null로 떨어뜨림 (스키마 진화 대비)
 *   - 페이지 컴포넌트가 Database["public"] 직접 import 안 해도 되게 정제된 타입 제공
 *
 * 보안: admin 클라이언트는 RLS 우회하므로, 이 모듈 외부에서는 direct query 금지.
 */

type MaterialRow = Database["public"]["Tables"]["materials"]["Row"];
type CourseRow = Database["public"]["Tables"]["courses"]["Row"];

export interface MaterialDetail {
  id: string;
  title: string;
  type: MaterialRow["type"];
  pageCount: number | null;
  uploadedAt: string;
  course: { id: string; name: string; color: string | null } | null;
  summary: SummarizeOutputT | null;
  summaryKeywords: string[] | null;
  lastSummarizedAt: string | null;
}

export interface MaterialListItem {
  id: string;
  title: string;
  type: MaterialRow["type"];
  pageCount: number | null;
  uploadedAt: string;
  hasSummary: boolean;
  courseId: string | null;
}

export type CourseCategory = "semester" | "personal";

export interface CourseListItem {
  id: string;
  name: string;
  professor: string | null;
  color: string | null;
  materialCount: number;
  /** 0010: 정규 강의 vs 개인 공부 (자격증·시험) */
  category: CourseCategory;
}

interface MaterialDetailRaw {
  id: string;
  title: string;
  type: MaterialRow["type"];
  page_count: number | null;
  uploaded_at: string;
  summary_payload: unknown;
  summary_keywords: string[] | null;
  last_summarized_at: string | null;
  course_id: string | null;
  courses: Pick<CourseRow, "id" | "name" | "color"> | null;
}

export async function getMaterialDetail(opts: {
  ownerId: string;
  materialId: string;
}): Promise<MaterialDetail | null> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("materials")
    .select(
      "id, title, type, page_count, uploaded_at, summary_payload, summary_keywords, last_summarized_at, course_id, courses(id, name, color)",
    )
    .eq("id", opts.materialId)
    .eq("owner_id", opts.ownerId)
    .maybeSingle();

  if (error || !data) return null;
  // supabase-js 타입 추론이 join + maybeSingle()에서 `never`로 떨어지는 한계 — 명시적 캐스트
  const row = data as unknown as MaterialDetailRaw;

  return {
    id: row.id,
    title: row.title,
    type: row.type,
    pageCount: row.page_count,
    uploadedAt: row.uploaded_at,
    course: extractCourse(row.courses),
    summary: parseSummary(row.summary_payload),
    summaryKeywords: row.summary_keywords ?? null,
    lastSummarizedAt: row.last_summarized_at,
  };
}

export async function listMaterialsByCourse(opts: {
  ownerId: string;
  courseId: string;
}): Promise<MaterialListItem[]> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("materials")
    .select("id, title, type, page_count, uploaded_at, summary_payload, course_id")
    .eq("owner_id", opts.ownerId)
    .eq("course_id", opts.courseId)
    .order("uploaded_at", { ascending: false });

  if (error || !data) return [];
  return data.map(toListItem);
}

export async function listOrphanMaterials(opts: { ownerId: string }): Promise<MaterialListItem[]> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("materials")
    .select("id, title, type, page_count, uploaded_at, summary_payload, course_id")
    .eq("owner_id", opts.ownerId)
    .is("course_id", null)
    .order("uploaded_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];
  return data.map(toListItem);
}

export async function getCourseByName(opts: {
  ownerId: string;
  name: string;
}): Promise<{
  id: string;
  name: string;
  professor: string | null;
  color: string | null;
  schedule: string[] | null;
  location: string | null;
  termStart: string | null;
  termEnd: string | null;
  materials: MaterialListItem[];
} | null> {
  const admin = getAdminSupabase();
  const { data: course, error } = await admin
    .from("courses")
    .select("id, name, professor, color, schedule, location, term_start, term_end")
    .eq("owner_id", opts.ownerId)
    .eq("name", opts.name)
    .eq("archived", false)
    .maybeSingle();
  if (error || !course) return null;

  const materials = await listMaterialsByCourse({ ownerId: opts.ownerId, courseId: course.id });

  return {
    id: course.id,
    name: course.name,
    professor: course.professor,
    color: course.color,
    schedule: (course.schedule as string[] | null) ?? null,
    location: course.location,
    termStart: course.term_start,
    termEnd: course.term_end,
    materials,
  };
}

export async function listCoursesWithMaterialCount(opts: {
  ownerId: string;
}): Promise<CourseListItem[]> {
  const admin = getAdminSupabase();
  const { data: courses, error } = await admin
    .from("courses")
    .select("id, name, professor, color, category")
    .eq("owner_id", opts.ownerId)
    .eq("archived", false)
    .order("created_at", { ascending: true });

  if (error || !courses) return [];

  const ids = courses.map((c) => c.id);
  if (ids.length === 0) {
    return courses.map((c) => ({
      id: c.id,
      name: c.name,
      professor: c.professor,
      color: c.color,
      materialCount: 0,
      category: (c.category ?? "semester") as CourseCategory,
    }));
  }

  // 과목별 자료 개수 한번에
  const { data: counts } = await admin
    .from("materials")
    .select("course_id")
    .eq("owner_id", opts.ownerId)
    .in("course_id", ids);

  const tally = new Map<string, number>();
  for (const row of counts ?? []) {
    if (!row.course_id) continue;
    tally.set(row.course_id, (tally.get(row.course_id) ?? 0) + 1);
  }

  return courses.map((c) => ({
    id: c.id,
    name: c.name,
    professor: c.professor,
    color: c.color,
    materialCount: tally.get(c.id) ?? 0,
    category: (c.category ?? "semester") as CourseCategory,
  }));
}

/**
 * 공부 탭 그룹화 결과 — 정규 강의와 개인 공부를 분리해 다른 섹션으로 그릴 때.
 */
export interface CoursesGrouped {
  semester: CourseListItem[];
  personal: CourseListItem[];
}

export async function listCoursesGrouped(opts: {
  ownerId: string;
}): Promise<CoursesGrouped> {
  const all = await listCoursesWithMaterialCount(opts);
  return {
    semester: all.filter((c) => c.category === "semester"),
    personal: all.filter((c) => c.category === "personal"),
  };
}

// ─── 내부 헬퍼 ─────────────────────────

function toListItem(row: {
  id: string;
  title: string;
  type: MaterialRow["type"];
  page_count: number | null;
  uploaded_at: string;
  summary_payload: unknown;
  course_id: string | null;
}): MaterialListItem {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    pageCount: row.page_count,
    uploadedAt: row.uploaded_at,
    hasSummary: row.summary_payload !== null && typeof row.summary_payload === "object",
    courseId: row.course_id,
  };
}

function extractCourse(
  raw: Pick<CourseRow, "id" | "name" | "color"> | null,
): MaterialDetail["course"] {
  if (!raw) return null;
  return { id: raw.id, name: raw.name, color: raw.color };
}

function parseSummary(raw: unknown): SummarizeOutputT | null {
  if (!raw || typeof raw !== "object") return null;
  const result = SummarizeOutput.safeParse(raw);
  return result.success ? result.data : null;
}

// 스키마 진화 추적용 — 향후 generations 테이블 직접 조회로 폴백할 때
export const _internal = { parseSummary, ZodSummarize: z.object({}) };
