import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { tryGetOwnerId } from "@/lib/auth";
import { getPushConfig } from "@/lib/push";
import { PushEndpoint, PushSubscriptionBody } from "@/lib/push-schema";
import { guardRateLimit } from "@/lib/ratelimit";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

export async function GET() {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) return reply({ ok: false, error: "로그인이 필요해요." }, 401);
  const config = getPushConfig();
  if (!config) return reply({ ok: true, configured: false, publicKey: null, endpointHashes: [] });
  try {
    const { data, error } = await getAdminSupabase()
      .from("push_subscriptions")
      .select("endpoint_hash")
      .eq("owner_id", ownerId);
    if (error) throw error;
    return reply({
      ok: true,
      configured: true,
      publicKey: config.publicKey,
      endpointHashes: data.map((row) => row.endpoint_hash),
    });
  } catch {
    return reply({ ok: false, error: "알림 설정을 불러오지 못했어요." }, 503);
  }
}

export async function POST(request: Request) {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) return reply({ ok: false, error: "로그인이 필요해요." }, 401);
  if (!getPushConfig()) return reply({ ok: false, error: "일정 알림을 준비 중이에요." }, 503);
  const parsed = PushSubscriptionBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ ok: false, error: "알림 구독 정보가 잘못됐어요." }, 400);
  const blocked = await guardRateLimit("api", ownerId);
  if (blocked) return blocked;
  try {
    const { endpoint, keys } = parsed.data;
    const { error } = await getAdminSupabase().rpc("register_push_subscription", {
      p_owner_id: ownerId,
      p_endpoint: endpoint,
      p_endpoint_hash: createHash("sha256").update(endpoint).digest("hex"),
      p_p256dh: keys.p256dh,
      p_auth: keys.auth,
    });
    if (error) {
      if (error.code === "23505")
        return reply({ ok: false, error: "이 브라우저의 알림을 다시 연결해 주세요." }, 409);
      if (error.code === "23514")
        return reply({ ok: false, error: "최대 10개 브라우저에 알림을 연결할 수 있어요." }, 409);
      throw error;
    }
    return reply({ ok: true });
  } catch {
    return reply({ ok: false, error: "알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요." }, 503);
  }
}

export async function DELETE(request: Request) {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) return reply({ ok: false, error: "로그인이 필요해요." }, 401);
  const parsed = z
    .object({ endpoint: PushEndpoint })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ ok: false, error: "알림 구독 정보가 잘못됐어요." }, 400);
  try {
    const { error } = await getAdminSupabase()
      .from("push_subscriptions")
      .delete()
      .eq("owner_id", ownerId)
      .eq("endpoint", parsed.data.endpoint);
    if (error) throw error;
    return reply({ ok: true });
  } catch {
    return reply({ ok: false, error: "알림을 끄지 못했어요. 다시 시도해 주세요." }, 503);
  }
}
