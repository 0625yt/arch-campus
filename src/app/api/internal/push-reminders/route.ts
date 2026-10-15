import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPushConfig } from "@/lib/push";
import { dispatchPushReminders } from "@/lib/services/push-reminders";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };
const hash = (value: string) => createHash("sha256").update(value).digest();

function authorize(request: Request) {
  const secret = process.env.PUSH_WORKER_SECRET;
  if (!secret || secret.length < 32)
    return NextResponse.json(
      { ok: false, error: "알림 실행 설정이 필요해요." },
      { status: 503, headers },
    );
  if (!timingSafeEqual(hash(request.headers.get("authorization") ?? ""), hash(`Bearer ${secret}`)))
    return NextResponse.json({ ok: false, error: "실행 권한이 없어요." }, { status: 401, headers });
  if (!getPushConfig())
    return NextResponse.json(
      { ok: false, error: "알림 전송 설정이 필요해요." },
      { status: 503, headers },
    );
  return null;
}

export async function GET(request: Request) {
  return authorize(request) ?? NextResponse.json({ ok: true }, { headers });
}

export async function POST(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;
  const parsed = z
    .object({ ownerId: z.uuid().optional() })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, error: "실행 범위를 확인해 주세요." },
      { status: 400, headers },
    );
  try {
    return NextResponse.json(
      { ok: true, ...(await dispatchPushReminders(parsed.data.ownerId)) },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "일정 알림을 전송하지 못했어요." },
      { status: 503, headers },
    );
  }
}
