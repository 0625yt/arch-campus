import { extractText, getDocumentProxy } from "unpdf";
import { type ParseInput, type ParsedDocument, ParserRejectedError, toUint8Array } from "./types";

export async function parsePdf(input: ParseInput): Promise<ParsedDocument> {
  const bytes = toUint8Array(input.bytes);
  if (bytes.byteLength === 0) {
    throw new ParserRejectedError("빈 파일이에요", "empty");
  }

  const pdf = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const merged = Array.isArray(text) ? text.join("\n\n") : text;
  const warnings: string[] = [];
  if (merged.trim().length < 40) {
    warnings.push("텍스트가 매우 짧아요. 스캔 PDF면 OCR로 다시 시도하세요.");
  }
  return {
    text: merged,
    pageCount: totalPages,
    mimeType: input.mimeType ?? "application/pdf",
    source: "pdf",
    warnings,
  };
}
