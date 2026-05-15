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
