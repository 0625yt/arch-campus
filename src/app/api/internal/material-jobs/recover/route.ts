import { createHash, timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { claimStaleMaterialJobForWorker } from "@/lib/data/jobs";
import { runRecoveredMaterialJob } from "@/lib/services/recover-material-job";

export const runtime = "nodejs";
export const maxDuration = 300;
const Body = z.object({ ownerId: z.uuid().optional() }).strict();
const hash = (value: string) => createHash("sha256").update(value).digest();
const headers = { "Cache-Control": "private, no-store" };

function authorize(request: Request): NextResponse | null {
  const secret = process.env.JOB_WORKER_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json(
      { ok: false, error: "작업 실행 설정이 필요해요." },
      { status: 503, headers },
    );
  }
  const supplied = request.headers.get("authorization") ?? "";
  if (!timingSafeEqual(hash(supplied), hash(`Bearer ${secret}`))) {
    return NextResponse.json({ ok: false, error: "실행 권한이 없어요." }, { status: 401, headers });
  }
  return null;
}

export async function GET(request: Request): Promise<NextResponse> {
  return authorize(request) ?? NextResponse.json({ ok: true }, { headers });
}

export async function POST(request: Request): Promise<NextResponse> {
  const denied = authorize(request);
  if (denied) return denied;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "실행 범위를 확인해 주세요." },
      { status: 400, headers },
    );
  }
  try {
    const job = await claimStaleMaterialJobForWorker(parsed.data.ownerId);
    if (job?.status === "pending") after(() => runRecoveredMaterialJob(job));
    return NextResponse.json(
      {
        ok: true,
        resumed: job?.status === "pending" ? 1 : 0,
        closed: job?.status === "error" ? 1 : 0,
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "작업 복구를 시작하지 못했어요." },
      { status: 503, headers },
    );
  }
}
