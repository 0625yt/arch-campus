import { NextResponse } from "next/server";
import { tryGetOwnerId } from "@/lib/auth";
import { getRecentActivities, type Activity } from "@/lib/data/activity";

export const runtime = "nodejs";

interface OkResponse {
  ok: true;
  activities: Activity[];
}

interface ErrResponse {
  ok: false;
  error: string;
}

export async function GET(req: Request): Promise<NextResponse<OkResponse | ErrResponse>> {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) {
    return NextResponse.json({ ok: false, error: "로그인이 필요해요" }, { status: 401 });
  }
  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "10", 10) || 10));
  const activities = await getRecentActivities({ ownerId, limit });
  return NextResponse.json({ ok: true, activities });
}
