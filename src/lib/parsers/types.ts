export interface ParsedDocument {
  text: string;
  pageCount?: number;
  mimeType: string;
  source: "pdf" | "docx" | "xlsx" | "pptx" | "image" | "txt" | "rejected";
  warnings: string[];
}

export type ParseBytes = ArrayBuffer | Uint8Array;

export interface ParseInput {
  bytes: ParseBytes;
  filename: string;
  mimeType?: string;
}

export class ParserRejectedError extends Error {
  constructor(
    message: string,
    public readonly reason: "unsupported" | "too-large" | "corrupted" | "empty",
  ) {
    super(message);
    this.name = "ParserRejectedError";
  }
}

export const MAX_PARSE_BYTES = 60 * 1024 * 1024;

export function toUint8Array(input: ParseBytes): Uint8Array {
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}
