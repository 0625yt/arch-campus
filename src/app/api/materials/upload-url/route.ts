import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { createMaterialUploadUrl } from "@/lib/storage";

export const runtime = "nodejs";

const Body = z.object({
  filename: z.string().min(1).max(300),
});

interface OkResponse {
  ok: true;
  signedUrl: string;
  storagePath: string;
  materialId: string;
  token: string;
}

interface ErrResponse {
  ok: false;
  error: string;
}

/**
 * Direct upload용 signed URL 발급.
 *
 * Vercel Functions의 요청 본문 4.5MB 제한을 우회하려고 클라이언트가 Storage로
 * 직접 PUT하는 패턴. 흐름:
 *
 *   1) (여기) 인증 + `<ownerId>/<materialId>.<ext>` storagePath 생성
 *      → service-role로 signed upload URL 발급
 *   2) 클라이언트가 signedUrl + token으로 Supabase Storage에 PUT (브라우저 → Storage 직통)
 *   3) 클라이언트가 /api/materials/finalize에 storagePath·meta 넘김 → 파싱·INSERT·잡 큐잉
 *
 * 보안: signed URL은 storagePath까지 고정. ownerId prefix가 박혀있어 다른 사용자
 * 영역에 침범 불가. (admin.ts §4-1 storage 규칙.)
 */
export async function POST(req: Request): Promise<NextResponse<OkResponse | ErrResponse>> {
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

  try {
    const target = await createMaterialUploadUrl({ ownerId, filename: body.filename });
    return NextResponse.json({
      ok: true,
      signedUrl: target.signedUrl,
      storagePath: target.storagePath,
      materialId: target.materialId,
      token: target.token,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "URL 발급 실패" },
      { status: 500 },
    );
  }
}
