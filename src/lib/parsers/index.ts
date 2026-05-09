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
        // 변환 서비스 없을 때도 거절하지 말고 메타데이터만 가진 placeholder.
        // /api/summarize가 짧은 텍스트도 받아서 "이 자료는 한컴 파일이에요. PDF로 변환하면 더 정확해져요" 안내 요약 만듬.
        parsed = {
          text: `[한글 파일 — 본문 자동 추출이 아직 안 돼요. PDF로 변환해서 다시 올리면 정확한 요약을 만들어줄 수 있어요.]\n파일명: ${input.filename}`,
          mimeType: input.mimeType ?? "application/x-hwp",
          source: "rejected",
          warnings: ["HWP 변환 서비스가 연결되지 않아 메타데이터만 사용했어요"],
        };
        break;
      }
      parsed = await parseHwp(normalized);
      break;
    default:
      // 어떤 형식이든 거절하지 말고 텍스트 디코드 시도 → 실패하면 메타만.
      parsed = await fallbackText(normalized);
      break;
  }

  return { ...parsed, sanitizedText: sanitizeForPrompt(parsed.text) };
}

async function fallbackText(input: ParseInput): Promise<ParsedDocument> {
  // 알 수 없는 확장자·구버전 office 등 — UTF-8 best effort 디코딩 시도.
  const bytes = toUint8Array(input.bytes);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  // 이진 파일이면 �·NUL이 가득. 그건 메타데이터로만.
  const printableRatio = countPrintable(text) / Math.max(text.length, 1);
  const ext = extensionOf(input.filename);
  if (printableRatio > 0.7 && text.trim().length >= 4) {
    return {
      text,
      mimeType: input.mimeType ?? "application/octet-stream",
      source: "txt",
      warnings: [`알 수 없는 형식(${ext || "확장자 없음"})이라 텍스트로 강제 추출했어요. 결과가 부정확할 수 있어요.`],
    };
  }
  return {
    text: `[자동 추출이 안 되는 형식이에요. 가능하면 PDF·DOCX·이미지로 변환해서 올려주세요.]\n파일명: ${input.filename}\n형식: ${ext || "확장자 없음"}`,
    mimeType: input.mimeType ?? "application/octet-stream",
    source: "rejected",
    warnings: ["이진 파일에서 텍스트를 추출하지 못했어요. 메타데이터로만 진행했어요."],
  };
}

function countPrintable(text: string): number {
  let n = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0xfffd) continue; // U+FFFD replacement
    if (code === 0) continue;
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) continue;
    n++;
  }
  return n;
}

export { ParserRejectedError } from "./types";
export type { ParsedDocument, ParseInput } from "./types";
