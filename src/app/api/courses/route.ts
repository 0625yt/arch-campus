import { NextResponse } from "next/server";
import { tryGetOwnerId } from "@/lib/auth";
import { listCoursesWithMaterialCount, type CourseListItem } from "@/lib/data/materials";

export const runtime = "nodejs";

interface OkResponse {
  ok: true;
  courses: CourseListItem[];
}

interface ErrResponse {
  ok: false;
  error: string;
}

export async function GET(): Promise<NextResponse<OkResponse | ErrResponse>> {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) {
    return NextResponse.json({ ok: false, error: "로그인이 필요해요" }, { status: 401 });
  }
  const courses = await listCoursesWithMaterialCount({ ownerId });
  return NextResponse.json({ ok: true, courses });
}
