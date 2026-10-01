import { generateText } from "ai";
import { getModelIdFor, modelInstance } from "../claude";
import { type ParsedDocument, type ParseInput, ParserRejectedError, toUint8Array } from "./types";

const OCR_PROMPT = `이 이미지에 적힌 글을 그대로 옮겨 적어요. 한국어/영어/수식 모두 보이는 대로.
- 표는 마크다운 표로
- 손글씨가 흐려 못 읽는 부분은 [unreadable]로 표시
- 설명·요약 X. 글자만 옮겨요
- 이미지에 글이 거의 없으면 빈 출력`;

export async function parseImage(input: ParseInput): Promise<ParsedDocument> {
  const bytes = toUint8Array(input.bytes);
  if (bytes.byteLength === 0) throw new ParserRejectedError("빈 이미지", "empty");

  const mimeType = input.mimeType ?? guessImageMime(input.filename);
  if (!mimeType.startsWith("image/")) {
    throw new ParserRejectedError(`이미지 형식이 아니에요: ${mimeType}`, "unsupported");
  }

  const result = await generateText({
    // 공통 모델 라우팅을 거쳐 운영 환경의 LLM_VENDOR와 PDF_OCR_VENDOR를 존중한다.
    // Haiku를 직접 지정하면 나머지 기능이 Gemini를 쓰는 환경에서도 이미지 업로드만
    // 오래된 Anthropic 키를 호출해 실패할 수 있다.
    model: modelInstance(getModelIdFor("pdf-ocr")),
    maxOutputTokens: 4096,
    temperature: 0.1,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: OCR_PROMPT },
          { type: "image", image: bytes, mediaType: mimeType },
        ],
      },
    ],
  });

  return {
    text: result.text.trim(),
    mimeType,
    source: "image",
    warnings: result.text.trim().length === 0 ? ["글자가 검출되지 않았어요"] : [],
  };
}

function guessImageMime(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "heic":
      return "image/heic";
    default:
      return "application/octet-stream";
  }
}
