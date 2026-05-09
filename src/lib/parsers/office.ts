import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { parseOffice } from "officeparser";
import { type ParseInput, type ParsedDocument, ParserRejectedError, toUint8Array } from "./types";

export async function parseDocx(input: ParseInput): Promise<ParsedDocument> {
  const bytes = toUint8Array(input.bytes);
  if (bytes.byteLength === 0) throw new ParserRejectedError("빈 docx", "empty");
  const buffer: Buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) as Buffer;
  const result = await mammoth.extractRawText({ buffer });
  const warnings = result.messages
    .filter((m) => m.type === "warning")
    .map((m) => m.message)
    .slice(0, 5);
  return {
    text: result.value,
    mimeType: input.mimeType ?? "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    source: "docx",
    warnings,
  };
}

export async function parseXlsx(input: ParseInput): Promise<ParsedDocument> {
  const bytes = toUint8Array(input.bytes);
  if (bytes.byteLength === 0) throw new ParserRejectedError("빈 xlsx", "empty");

  const workbook = new ExcelJS.Workbook();
  const ab = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? (bytes.buffer as ArrayBuffer)
    : (bytes.slice().buffer as ArrayBuffer);
  await workbook.xlsx.load(ab as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const sheetTexts: string[] = [];
  workbook.eachSheet((sheet) => {
    const lines: string[] = [`# ${sheet.name}`];
    sheet.eachRow((row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value;
        if (v == null) return;
        if (typeof v === "object" && "richText" in v) {
          cells.push(v.richText.map((r) => r.text).join(""));
        } else if (typeof v === "object" && "text" in v && typeof v.text === "string") {
          cells.push(v.text);
        } else if (v instanceof Date) {
          cells.push(v.toISOString().slice(0, 10));
        } else {
          cells.push(String(v));
        }
      });
      if (cells.length > 0) lines.push(cells.join(" | "));
    });
    sheetTexts.push(lines.join("\n"));
  });

  return {
    text: sheetTexts.join("\n\n"),
    mimeType: input.mimeType ?? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    source: "xlsx",
    warnings: [],
  };
}

export async function parsePptx(input: ParseInput): Promise<ParsedDocument> {
  const bytes = toUint8Array(input.bytes);
  if (bytes.byteLength === 0) throw new ParserRejectedError("빈 pptx", "empty");
  const buffer: Buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) as Buffer;
  const ast = await parseOffice(buffer, { includeRawContent: false });
  const text = typeof ast.toText === "function" ? ast.toText() : "";
  return {
    text,
    mimeType: input.mimeType ?? "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    source: "pptx",
    warnings: [],
  };
}
