import "server-only";
import { parseDocument } from "@/lib/parsers";
import { downloadMaterialFile } from "@/lib/storage";
import { sourcePages } from "@/lib/summary-chunks";
import { getAdminSupabase } from "@/lib/supabase/admin";

/** Re-extract legacy PDFs whose cached text predates page markers/full-document sanitization. */
export async function restoreSummarySource(input: {
  ownerId: string;
  materialId: string;
  title: string;
  text: string;
  pageCount: number | null;
  originalFile?: { storagePath: string; mimeType: string } | null;
}) {
  const original = input.originalFile;
  if (
    original?.mimeType !== "application/pdf" ||
    (sourcePages(input.text).length > 0 &&
      (!input.pageCount || sourcePages(input.text).length === input.pageCount))
  )
    return null;
  // The path is from an owner-scoped material row; additionally enforce the storage boundary.
  if (!original.storagePath.startsWith(`${input.ownerId}/`) || original.storagePath.includes(".."))
    throw new Error("원본 자료의 소유권을 확인하지 못했어요.");
  const parsed = await parseDocument({
    bytes: await downloadMaterialFile(original.storagePath),
    filename: `${input.title}.pdf`,
    mimeType: "application/pdf",
  });
  if (!parsed.sanitizedText.trim()) throw new Error("원본 PDF의 본문을 다시 읽지 못했어요.");
  const { error } = await getAdminSupabase()
    .from("materials")
    .update({ full_text: parsed.sanitizedText, page_count: parsed.pageCount ?? input.pageCount })
    .eq("id", input.materialId)
    .eq("owner_id", input.ownerId);
  if (error) throw new Error("다시 읽은 원문을 저장하지 못했어요.");
  return parsed;
}
