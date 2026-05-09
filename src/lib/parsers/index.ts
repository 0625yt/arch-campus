import { sanitizeForPrompt } from "../sanitize";
import { isHwpEnabled, parseHwp } from "./hwp";
import { parseImage } from "./image";
import { parseDocx, parsePptx, parseXlsx } from "./office";
import { parsePdf } from "./pdf";
import { parseText } from "./text";
import {
  MAX_PARSE_BYTES,
  type ParseInput,
  type ParsedDocument,
  ParserRejectedError,
  toUint8Array,
} from "./types";

export type ParserKind = ParsedDocument["source"] | "hwp";

const EXT_MAP: Record<string, ParserKind> = {
  pdf: "pdf",
  docx: "docx",
  xlsx: "xlsx",
  xlsm: "xlsx",
  pptx: "pptx",
  txt: "txt",
  md: "txt",
  jpg: "image",
  jpeg: "image",
  png: "image",
  webp: "image",
  gif: "image",
  heic: "image",
  hwp: "hwp",
  hwpx: "hwp",
  doc: "rejected",
  ppt: "rejected",
  xls: "rejected",
};

const MIME_MAP: Record<string, ParserKind> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/markdown": "txt",
};

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

export function detectParser(input: { filename: string; mimeType?: string }): ParserKind {
  if (input.mimeType) {
    if (input.mimeType.startsWith("image/")) return "image";
    const byMime = MIME_MAP[input.mimeType];
    if (byMime) return byMime;
  }
  const ext = extensionOf(input.filename);
  return EXT_MAP[ext] ?? "rejected";
}

export interface ParseResult extends ParsedDocument {
  sanitizedText: string;
}

export async function parseDocument(input: ParseInput): Promise<ParseResult> {
  const bytes = toUint8Array(input.bytes);
  if (bytes.byteLength > MAX_PARSE_BYTES) {
    throw new ParserRejectedError(
      `파일이 너무 커요: ${(bytes.byteLength / 1_000_000).toFixed(1)}MB (최대 25MB)`,
      "too-large",
    );
  }

  const kind = detectParser(input);
  const normalized: ParseInput = { ...input, bytes };

  let parsed: ParsedDocument;
  switch (kind) {
    case "pdf":
      parsed = await parsePdf(normalized);
      break;
    case "docx":
      parsed = await parseDocx(normalized);
      break;
    case "xlsx":
      parsed = await parseXlsx(normalized);
      break;
    case "pptx":
      parsed = await parsePptx(normalized);
      break;
    case "image":
      parsed = await parseImage(normalized);
      break;
    case "txt":
      parsed = await parseText(normalized);
      break;
    case "hwp":
      if (!isHwpEnabled()) {
        throw new ParserRejectedError(
          "HWP는 아직 지원하지 않아요. PDF로 내보내서 다시 올려주세요.",
          "unsupported",
        );
      }
      parsed = await parseHwp(normalized);
      break;
    default:
      throw new ParserRejectedError(unsupportedHint(input.filename), "unsupported");
  }

  return { ...parsed, sanitizedText: sanitizeForPrompt(parsed.text) };
}

function unsupportedHint(filename: string): string {
  const ext = extensionOf(filename);
  if (ext === "hwp" || ext === "hwpx") {
    return "HWP는 아직 지원하지 않아요. PDF로 내보내서 다시 올려주세요.";
  }
  if (ext === "doc" || ext === "ppt" || ext === "xls") {
    return `${ext.toUpperCase()}는 구버전 포맷이라 지원 안 해요. ${ext}x 포맷으로 저장해서 다시 올려주세요.`;
  }
  return `지원하지 않는 형식이에요: .${ext || "(확장자 없음)"}`;
}

export { ParserRejectedError } from "./types";
export type { ParsedDocument, ParseInput } from "./types";
