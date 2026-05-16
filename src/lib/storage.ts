import { randomUUID } from "node:crypto";
import { getAdminSupabase } from "./supabase/admin";

const BUCKET = "materials";

export interface UploadedFile {
  storagePath: string;
  bytes: Uint8Array;
  size: number;
  mimeType: string;
  filename: string;
}

/**
 * 파일을 받아 Storage에 저장 + 바이트도 같이 반환.
 * 경로 규칙: <ownerId>/<materialId>.<ext>  ← 0002_storage.sql RLS와 일치
 *
 * service-role을 쓰지만 path prefix가 ownerId로 잠겨있어 다른 사용자 데이터 접근 불가.
 */
export async function storeMaterialFile(opts: {
  ownerId: string;
  materialId?: string;
  file: File | Blob;
  filename: string;
  mimeType?: string;
}): Promise<UploadedFile> {
  const materialId = opts.materialId ?? randomUUID();
  const ext = extensionOf(opts.filename);
  const storagePath = `${opts.ownerId}/${materialId}${ext ? `.${ext}` : ""}`;

  const arrayBuffer = await opts.file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const mimeType =
    opts.mimeType ?? ("type" in opts.file ? (opts.file as File).type : "") ?? "application/octet-stream";

  const admin = getAdminSupabase();
  const { error } = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) {
    throw new Error(`Storage upload 실패: ${error.message}`);
  }

  return {
    storagePath,
    bytes,
    size: bytes.byteLength,
    mimeType,
    filename: opts.filename,
  };
}

export async function downloadMaterialFile(storagePath: string): Promise<Uint8Array> {
  const admin = getAdminSupabase();
  const { data, error } = await admin.storage.from(BUCKET).download(storagePath);
  if (error || !data) throw new Error(`Storage download 실패: ${error?.message ?? "no data"}`);
  return new Uint8Array(await data.arrayBuffer());
}

export interface SignedUploadTarget {
  /** 클라이언트가 PUT할 signed URL */
  signedUrl: string;
  /** Storage 안의 절대 경로 — finalize 라우트가 받아 download */
  storagePath: string;
  /** 미리 정해두는 material UUID — 클라이언트가 라우팅에 바로 쓸 수 있다 */
  materialId: string;
  /** 클라이언트가 Authorization header에 박을 토큰 */
  token: string;
}

/**
 * Storage에 클라이언트가 직접 PUT할 수 있는 signed upload URL을 발급한다.
 *
 * Vercel Functions는 요청 본문 4.5MB 제한이 있어 PPT·논문 같은 큰 자료는
 * `POST /api/materials`로는 못 들어온다. 그래서:
 *
 *   1) 클라이언트가 /api/materials/upload-url 호출 → 여기서 발급
 *   2) 클라이언트가 signedUrl에 직접 PUT (Vercel 함수 우회, Storage로 직접)
 *   3) 클라이언트가 /api/materials/finalize에 storagePath 넘기면 서버가 다운로드해서 파싱
 *
 * 경로 규칙: `<ownerId>/<materialId>.<ext>` — admin.ts §3 owner-prefix 격리와 동일.
 * RLS 우회 service-role을 쓰지만 path가 ownerId로 잠겨있어 다른 사용자에 침범 불가.
 */
export async function createMaterialUploadUrl(opts: {
  ownerId: string;
  filename: string;
}): Promise<SignedUploadTarget> {
  const materialId = randomUUID();
  const ext = extensionOf(opts.filename);
  const storagePath = `${opts.ownerId}/${materialId}${ext ? `.${ext}` : ""}`;

  const admin = getAdminSupabase();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    throw new Error(`signed upload URL 발급 실패: ${error?.message ?? "no data"}`);
  }

  return {
    signedUrl: data.signedUrl,
    storagePath,
    materialId,
    token: data.token,
  };
}

/**
 * Storage 원본 파일 삭제. DB 행 지우기 전후 어디서든 호출 가능 (idempotent).
 * 잘못된 path가 와도 에러 throw하지 않고 false 반환 — 호출부가 DB 트랜잭션 망치지 않게.
 */
export async function deleteMaterialFile(storagePath: string): Promise<boolean> {
  if (!storagePath) return false;
  const admin = getAdminSupabase();
  const { error } = await admin.storage.from(BUCKET).remove([storagePath]);
  if (error) {
    console.error("[storage] 파일 삭제 실패", { storagePath, error: error.message });
    return false;
  }
  return true;
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}
