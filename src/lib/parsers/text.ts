import { type ParseInput, type ParsedDocument, ParserRejectedError, toUint8Array } from "./types";

export async function parseText(input: ParseInput): Promise<ParsedDocument> {
  const bytes = toUint8Array(input.bytes);
  if (bytes.byteLength === 0) throw new ParserRejectedError("빈 텍스트", "empty");
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return {
    text,
    mimeType: input.mimeType ?? "text/plain",
    source: "txt",
    warnings: [],
  };
}
