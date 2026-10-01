import { PDFDocument } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import { generateWithFile } from "../claude";
import { type ParsedDocument, type ParseInput, ParserRejectedError, toUint8Array } from "./types";

/**
 * PDF 파서 — Gemini Flash Vision OCR 우선 + unpdf 텍스트 추출 안전망.
 *
 * 99.9% 빠짐없이 읽기 위한 4중 보강:
 *   1. 페이지 청크 분할 (PAGES_PER_CHUNK) — 한 호출에 너무 많은 페이지가 들어가
 *      maxOutputTokens(32K)에 닿아 뒷페이지가 잘리는 함정 회피.
 *   2. 잘림 감지 시 자동 재시도 — 청크를 절반으로 쪼개 다시. 4단계까지 재귀.
 *   3. 가장 작은 청크(1페이지)도 잘리면 그 페이지만 unpdf 텍스트로 폴백 (빈 칸 X).
 *   4. 전체 OCR 결과가 unpdf보다 짧으면 unpdf 채택 — 텍스트 PDF는 그게 더 정확.
 *
 * 왜 OCR 우선인가:
 *   - unpdf만 쓰면 스캔본·이미지 박힌 PDF·복잡한 레이아웃(2단·표·각주)에서 본문이 통째로 빠진다.
 *   - Gemini 2.5 Flash는 PDF를 native file input으로 받아 페이지 단위 OCR + 레이아웃 보존.
 *   - 단가 $0.30/$2.50/1M으로 Sonnet 대비 1/5 — 모든 PDF에 적용해도 자료 1건당 $0.005~0.02 수준.
 *
 * env 토글:
 *   - PDF_OCR_VENDOR=anthropic → OCR 비활성 (unpdf만 사용). 기본은 google.
 *   - GOOGLE_GENERATIVE_AI_API_KEY 없으면 자동으로 unpdf만.
 */

const OCR_PROMPT = `이 PDF의 **모든 페이지·모든 내용**을 빠짐없이 본문으로 옮겨 적어요.

## 필수 규칙

**1. 페이지 헤더**: 페이지마다 첫 줄에 \`=== Page N ===\` (N=1,2,3...). 빈 페이지도 헤더는 박고 \`(빈 페이지)\`.

**2. 글자는 한 글자도 빼지 말 것**: 머리말·꼬리말·페이지 번호·각주·캡션·표 안 글자·말풍선·라벨·도장 안의 글자 전부.

**3. 표**: 마크다운 표(\`| 셀 | 셀 |\`)로. 행/열 위치 보존.

**4. 수식**: 보이는 그대로 (LaTeX 변환 X). 예: "x² + y² = r²"

**5. 다단 레이아웃**: 왼쪽 단 위→아래 먼저, 그 다음 오른쪽 단.

**6. 손글씨/흐림**: \`[unreadable]\`로 표시, 추측 X.

## ★ 그림·사진·도표 처리 — 매우 중요

**그림을 보고 그 안의 내용을 본문으로 옮겨야 한다.** "[그림]" 한 줄만 적고 넘기지 마라. Vision 모델인 너는 그림을 직접 볼 수 있으니, 그림에서 얻을 수 있는 정보를 **자료 본문의 일부**로 다음 형식에 맞춰 적는다:

\`\`\`
[그림 설명]
- 무엇이 보이는가: (구체적으로 — 예: "통밀빵·당근·계란이 담긴 샐러드 그릇", "공원에서 명상하는 남자", "헬스장 트레드밀 위에서 뛰는 사람")
- 그림 안의 글자/라벨: (있으면 그대로. 예: "POWER WALKING / How to Walk Faster", "SLEEP IN!", "1906 삼육대학교")
- 의미: (이 그림이 어떤 개념·어휘·예시를 보여주는지. 예: "'cook healthy food'의 시각 예시", "'relax'를 의미하는 명상 장면")
\`\`\`

특히 강의 슬라이드·교재의 그림은 **본문 텍스트만큼 중요한 학습 자료**다. 그림 안 글자(라벨·차트 숫자·말풍선·도표 안 단어·인포그래픽)는 반드시 본문에 옮겨라.

## 금지

- 자료 요약·해석·"이 PDF는 ...에 관한 내용입니다" 같은 메타 문장 X.
- 자료에 없는 내용 추측·추가 X.
- 페이지 건너뛰기 X. 빈 페이지도 헤더 박기.`;

/** 한 청크당 OCR 호출에 들어가는 페이지 수. 빽빽한 한국어 페이지 기준 ~10K 토큰 출력. */
const PAGES_PER_CHUNK = 8;
/** Gemini Flash 출력 한도 풀로 — 잘림 최소화. */
const OCR_MAX_TOKENS = 32_768;
/** 청크가 잘리면 절반으로 재시도. 최대 N단계까지 (8→4→2→1). 1페이지도 잘리면 unpdf 폴백. */
const MAX_SPLIT_DEPTH = 4;

export async function parsePdf(input: ParseInput): Promise<ParsedDocument> {
  const sourceBytes = toUint8Array(input.bytes);
  if (sourceBytes.byteLength === 0) {
    throw new ParserRejectedError("빈 파일이에요", "empty");
  }

  // unpdf/pdfjs는 worker로 ArrayBuffer를 transfer하면서 전달받은 Uint8Array를
  // detach할 수 있다. 같은 바이트를 뒤이어 OCR에 넘기면 0바이트 PDF가 되는 실제
  // 장애가 있었으므로, 두 소비자에게 소유권이 완전히 분리된 복사본을 준다.
  // Uint8Array.from은 Buffer가 들어온 테스트/스크립트 환경에서도 진짜 Uint8Array를 만든다.
  const unpdfBytes = Uint8Array.from(sourceBytes);
  const ocrBytes = Uint8Array.from(sourceBytes);

  // 1) unpdf로 항상 먼저 — pageCount 메타와 OCR 폴백/비교용
  const unpdfResult = await extractWithUnpdf(unpdfBytes);

  // 2) OCR 시도 여부 판단
  if (!shouldUseOcr()) {
    return finalize(unpdfResult, input, []);
  }

  // 3) Gemini Flash OCR — 페이지 청크 분할로 잘림 회피
  const ocr = await ocrPdfChunked(ocrBytes, unpdfResult);
  if (!ocr.ok) {
    return finalize(unpdfResult, input, [`[ocr-fallback] ${ocr.reason}`]);
  }

  // 4) OCR 결과가 unpdf보다 길면 채택 (스캔본·이미지 PDF는 unpdf가 거의 빈 텍스트)
  //    OCR 결과가 더 짧으면 unpdf가 더 풍부한 케이스 (텍스트 PDF라 OCR이 굳이 필요 없음).
  const chooseOcr = ocr.text.trim().length >= unpdfResult.text.trim().length;
  const text = chooseOcr ? ocr.text : unpdfResult.text;

  const warnings: string[] = [];
  if (text.trim().length < 40) {
    warnings.push("텍스트가 매우 짧아요. 자료에 글자가 거의 없는지 확인해주세요.");
  }
  if (ocr.partialPages.length > 0) {
    warnings.push(
      `${ocr.partialPages.length}개 페이지(${ocr.partialPages.slice(0, 8).join(", ")}${ocr.partialPages.length > 8 ? "..." : ""})는 OCR이 잘려 unpdf 텍스트로 대체했어요.`,
    );
  }

  return {
    text,
    pageCount: unpdfResult.pageCount,
    mimeType: input.mimeType ?? "application/pdf",
    source: "pdf",
    warnings,
  };
}

interface UnpdfResult {
  text: string;
  pageCount: number;
  /** 페이지별 텍스트 — 청크 OCR 잘림 시 fallback에 사용. */
  pageTexts: string[];
}

async function extractWithUnpdf(bytes: Uint8Array): Promise<UnpdfResult> {
  try {
    const pdf = await getDocumentProxy(bytes);
    // mergePages: false로 페이지별 배열로 받음 — fallback 시 그 페이지만 쓸 수 있음.
    const { text, totalPages } = await extractText(pdf, { mergePages: false });
    const pageTexts = Array.isArray(text) ? text : [String(text)];
    return {
      text: pageTexts.join("\n\n"),
      pageCount: totalPages,
      pageTexts,
    };
  } catch (e) {
    console.warn("[pdf.unpdf] extract 실패:", e instanceof Error ? e.message : e);
    return { text: "", pageCount: 0, pageTexts: [] };
  }
}

function shouldUseOcr(): boolean {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return false;
  const raw = process.env.PDF_OCR_VENDOR?.trim().toLowerCase();
  if (raw === "anthropic" || raw === "claude" || raw === "off" || raw === "none") return false;
  return true;
}

interface ChunkedOcrSuccess {
  ok: true;
  text: string;
  /** 끝까지 잘려서 unpdf로 대체된 페이지 번호들 (1-based). */
  partialPages: number[];
}
type ChunkedOcrResult = ChunkedOcrSuccess | { ok: false; reason: string };

/**
 * 페이지 단위 OCR — N페이지씩 잘라 Gemini 호출, 결과를 페이지 순서대로 concat.
 * 청크가 잘리면 절반으로 재시도, 1페이지도 잘리면 unpdf 텍스트로 폴백.
 */
async function ocrPdfChunked(bytes: Uint8Array, unpdf: UnpdfResult): Promise<ChunkedOcrResult> {
  const pageCount = unpdf.pageCount;

  // 페이지 수를 모르면 (unpdf 실패) 단일 호출로 시도 — 폴백 없음
  if (pageCount === 0) {
    const r = await ocrSinglePass(bytes);
    if (!r.ok) return r;
    return { ok: true, text: r.text, partialPages: r.truncated ? [-1] : [] };
  }

  // 작은 PDF는 통째로 — chunk 오버헤드 없음
  if (pageCount <= PAGES_PER_CHUNK) {
    return await ocrWithFallback(bytes, 1, pageCount, unpdf);
  }

  // pdf-lib로 source 로드 — 한 번만, 각 청크가 페이지 복사해 새 PDF 생성
  let source: PDFDocument;
  try {
    source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch (e) {
    console.warn("[pdf.chunk] pdf-lib load 실패 → 단일 호출 폴백:", e);
    const r = await ocrSinglePass(bytes);
    if (!r.ok) return r;
    return { ok: true, text: r.text, partialPages: r.truncated ? [-1] : [] };
  }

  const partialPages: number[] = [];
  const parts: string[] = [];

  for (let start = 1; start <= pageCount; start += PAGES_PER_CHUNK) {
    const end = Math.min(start + PAGES_PER_CHUNK - 1, pageCount);
    const chunkBytes = await extractPageRange(source, start, end);
    if (!chunkBytes) {
      // 페이지 추출 실패 — unpdf 텍스트로 폴백
      for (let p = start; p <= end; p++) {
        const txt = unpdf.pageTexts[p - 1]?.trim() ?? "";
        if (txt) parts.push(`[페이지 ${p} — OCR 대신 unpdf]\n${txt}`);
        partialPages.push(p);
      }
      continue;
    }
    const chunkResult = await ocrWithFallback(chunkBytes, start, end, unpdf, 0);
    if (chunkResult.ok) {
      parts.push(chunkResult.text);
      partialPages.push(...chunkResult.partialPages);
    } else {
      // 청크 자체 호출이 throw — 이 페이지 범위는 unpdf 텍스트로 대체
      console.warn(`[pdf.chunk] 청크 ${start}-${end} 실패: ${chunkResult.reason}`);
      for (let p = start; p <= end; p++) {
        const txt = unpdf.pageTexts[p - 1]?.trim() ?? "";
        if (txt) parts.push(`[페이지 ${p} — OCR 실패, unpdf]\n${txt}`);
        partialPages.push(p);
      }
    }
  }

  const text = parts.join("\n\n").trim();
  if (text.length === 0) {
    return { ok: false, reason: "모든 청크 OCR 실패" };
  }
  return { ok: true, text, partialPages };
}

/**
 * 페이지 범위 [start, end]를 새 PDF 바이트로 추출. (1-based 페이지 번호)
 */
async function extractPageRange(
  source: PDFDocument,
  start: number,
  end: number,
): Promise<Uint8Array | null> {
  try {
    const dst = await PDFDocument.create();
    const indices: number[] = [];
    for (let i = start; i <= end; i++) indices.push(i - 1); // pdf-lib는 0-based
    const pages = await dst.copyPages(source, indices);
    for (const p of pages) dst.addPage(p);
    return await dst.save();
  } catch (e) {
    console.warn(`[pdf.chunk] 페이지 ${start}-${end} 추출 실패:`, e);
    return null;
  }
}

/**
 * 한 청크 OCR — 잘림 감지 시 절반으로 재귀 분할. 1페이지에서 잘리면 unpdf 폴백.
 */
async function ocrWithFallback(
  chunkBytes: Uint8Array,
  pageStart: number,
  pageEnd: number,
  unpdf: UnpdfResult,
  depth = 0,
): Promise<ChunkedOcrSuccess | { ok: false; reason: string }> {
  const result = await ocrSinglePass(chunkBytes);
  if (!result.ok) return result;

  // 잘리지 않았으면 그대로 반환
  if (!result.truncated) {
    return { ok: true, text: result.text, partialPages: [] };
  }

  const pageSpan = pageEnd - pageStart + 1;

  // 1페이지에서도 잘렸으면 더 분할 불가 — 부분 OCR 텍스트 + unpdf 텍스트 합쳐 반환
  if (pageSpan <= 1 || depth >= MAX_SPLIT_DEPTH) {
    const unpdfText = unpdf.pageTexts[pageStart - 1]?.trim() ?? "";
    const combined = unpdfText
      ? `${result.text}\n\n[페이지 ${pageStart} — OCR 잘려 unpdf 텍스트로 보강]\n${unpdfText}`
      : result.text;
    return {
      ok: true,
      text: combined,
      partialPages: [pageStart],
    };
  }

  // 절반으로 분할 — pdf-lib으로 새 source 로드 (chunkBytes에서)
  let source: PDFDocument;
  try {
    source = await PDFDocument.load(chunkBytes, { ignoreEncryption: true });
  } catch {
    return { ok: true, text: result.text, partialPages: [pageStart] };
  }

  const mid = pageStart + Math.floor(pageSpan / 2) - 1;
  const firstHalf = await extractPageRange(
    source,
    1, // 청크 내부 인덱스
    mid - pageStart + 1,
  );
  const secondHalf = await extractPageRange(source, mid - pageStart + 2, pageSpan);
  if (!firstHalf || !secondHalf) {
    return { ok: true, text: result.text, partialPages: [pageStart] };
  }

  const [a, b] = await Promise.all([
    ocrWithFallback(firstHalf, pageStart, mid, unpdf, depth + 1),
    ocrWithFallback(secondHalf, mid + 1, pageEnd, unpdf, depth + 1),
  ]);

  const partial: number[] = [];
  const parts: string[] = [];
  if (a.ok) {
    parts.push(a.text);
    partial.push(...a.partialPages);
  }
  if (b.ok) {
    parts.push(b.text);
    partial.push(...b.partialPages);
  }
  if (parts.length === 0) {
    return { ok: false, reason: "분할 청크 모두 실패" };
  }
  return { ok: true, text: parts.join("\n\n"), partialPages: partial };
}

interface SinglePassResult {
  ok: true;
  text: string;
  truncated: boolean;
}
type SinglePassOutcome = SinglePassResult | { ok: false; reason: string };

async function ocrSinglePass(chunkBytes: Uint8Array): Promise<SinglePassOutcome> {
  try {
    const result = await generateWithFile({
      tool: "pdf-ocr",
      rulePrompt: OCR_PROMPT,
      dynamicContext: "",
      fileBytes: chunkBytes,
      mediaType: "application/pdf",
      maxTokens: OCR_MAX_TOKENS,
      temperature: 0,
    });
    const text = result.text.trim();
    if (text.length === 0) {
      return { ok: false, reason: "Gemini가 빈 응답을 반환" };
    }
    return {
      ok: true,
      text,
      truncated: result.finishReason === "length",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[pdf.ocr] Gemini OCR 실패:", msg);
    return { ok: false, reason: msg };
  }
}

function finalize(unpdf: UnpdfResult, input: ParseInput, extraWarnings: string[]): ParsedDocument {
  const warnings = [...extraWarnings];
  if (unpdf.text.trim().length < 40) {
    warnings.push(
      "텍스트가 매우 짧아요. 스캔 PDF면 OCR 환경변수(GOOGLE_GENERATIVE_AI_API_KEY)를 확인해주세요.",
    );
  }
  return {
    text: unpdf.text,
    pageCount: unpdf.pageCount,
    mimeType: input.mimeType ?? "application/pdf",
    source: "pdf",
    warnings,
  };
}
