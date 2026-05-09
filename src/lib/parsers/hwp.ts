import { parsePdf } from "./pdf";
import { type ParseInput, type ParsedDocument, ParserRejectedError, toUint8Array } from "./types";

const TIMEOUT_MS = 45_000;

export function isHwpEnabled(): boolean {
  return Boolean(process.env.HWP_CONVERTER_URL);
}

export async function parseHwp(input: ParseInput): Promise<ParsedDocument> {
  const baseUrl = process.env.HWP_CONVERTER_URL;
  if (!baseUrl) {
    // 라우터에서 isHwpEnabled() 체크하니 여기 도달하면 안 됨. 안전장치.
    return {
      text: `[한글 파일 — 변환 서비스 미연결]\n파일명: ${input.filename}`,
      mimeType: input.mimeType ?? "application/x-hwp",
      source: "rejected",
      warnings: ["HWP 변환 서비스가 연결되지 않았어요"],
    };
  }

  const bytes = toUint8Array(input.bytes);
  if (bytes.byteLength === 0) {
    return {
      text: `[빈 HWP 파일]\n파일명: ${input.filename}`,
      mimeType: input.mimeType ?? "application/x-hwp",
      source: "rejected",
      warnings: ["빈 파일이에요"],
    };
  }

  const ab = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? (bytes.buffer as ArrayBuffer)
    : (bytes.slice().buffer as ArrayBuffer);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let pdfBytes: Uint8Array;
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/convert?to=pdf`, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-filename": encodeURIComponent(input.filename),
        ...(process.env.HWP_CONVERTER_TOKEN
          ? { authorization: `Bearer ${process.env.HWP_CONVERTER_TOKEN}` }
          : {}),
      },
      body: ab,
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new ParserRejectedError(
        `HWP 변환 실패 (${response.status}): ${body.slice(0, 200) || "원인 미상"}`,
        "corrupted",
      );
    }
    pdfBytes = new Uint8Array(await response.arrayBuffer());
  } catch (err) {
    if (err instanceof ParserRejectedError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new ParserRejectedError("HWP 변환 시간이 너무 오래 걸렸어요. 다시 시도해주세요.", "corrupted");
    }
    throw new ParserRejectedError(
      `HWP 변환 서비스 연결 실패: ${err instanceof Error ? err.message : String(err)}`,
      "corrupted",
    );
  } finally {
    clearTimeout(timer);
  }

  const pdfResult = await parsePdf({
    bytes: pdfBytes,
    filename: input.filename.replace(/\.hwpx?$/i, ".pdf"),
    mimeType: "application/pdf",
  });

  return {
    text: pdfResult.text,
    pageCount: pdfResult.pageCount,
    mimeType: input.mimeType ?? "application/x-hwp",
    source: "pdf",
    warnings: ["HWP를 PDF로 변환해서 읽었어요.", ...pdfResult.warnings],
  };
}
