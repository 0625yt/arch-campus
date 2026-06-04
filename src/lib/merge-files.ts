import "server-only";
import { PDFDocument } from "pdf-lib";
import { parseDocument } from "@/lib/parsers";

/**
 * 여러 파일을 하나로 합치는 헬퍼.
 *
 * 정책:
 *   - PDF만 모임 → pdf-lib로 진짜 PDF merge (페이지 순서대로). 결과 PDF는 원본 모두 유지.
 *   - 같은 텍스트 형식(DOCX·PPTX·TXT·MD·HWPX) → 각 파일 파싱 후 텍스트 concat.
 *     원본 PDF가 아니므로 page_count는 합산이 아니라 null. 파일별 헤더로 추적.
 *   - 형식 섞이면 호출자가 차단 (이 헬퍼는 동질성 가정).
 *
 * 보안·신뢰:
 *   - PDF merge 실패 시 throw — 호출자가 "각각 등록" fallback 제안.
 *   - 텍스트 concat는 파일당 헤더("===== 파일 N =====") 박아 evidence 추적 가능.
 *   - 200K자 cap은 finalize에서 한 번 더 잘림 (이 헬퍼는 무한 합침).
 */

export interface MergeInputFile {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}

export type MergeMode = "pdf" | "text-concat";

export interface MergedResult {
  mode: MergeMode;
  /** 합쳐진 결과의 합산 텍스트 — full_text 컬럼에 저장. */
  text: string;
  /** 정규화된 sanitizedText — 요약·문제 생성에 들어감. */
  sanitizedText: string;
  /** PDF merge면 합쳐진 총 페이지 수. text-concat면 null. */
  pageCount: number | null;
  /** PDF merge면 합쳐진 PDF의 raw bytes. 호출자가 별도 Storage path에 다시 PUT 가능. */
  mergedPdfBytes: Uint8Array | null;
  /** 각 파일의 경고 모음 (파서 단계). */
  warnings: string[];
}

/** PDF만의 진짜 merge — pdf-lib로 페이지 단위로 옮겨붙임. 견고하게: 한 PDF 깨져도 진행. */
export async function mergePdfs(files: MergeInputFile[]): Promise<MergedResult> {
  if (files.length === 0) throw new Error("merge할 파일이 없어요");
  if (files.some((f) => f.mimeType !== "application/pdf")) {
    throw new Error("mergePdfs는 PDF만 받아요");
  }

  const out = await PDFDocument.create();
  const warnings: string[] = [];
  // 각 파일을 개별 try — 한 PDF가 깨져도 나머지로 진행. pdf-lib는 일부 PDF (특히
  // 비표준 폰트 테이블 / 암호화 / 손상)에서 throw하는데, 사용자 자료는 강의에서 받은
  // 다양한 형식이라 한 파일 깨짐으로 전체 막히면 안 됨.
  for (const f of files) {
    try {
      const src = await PDFDocument.load(f.bytes, {
        ignoreEncryption: true,
        // 비표준 PDF 관용도 ↑ (pdf-lib v1.17+)
        throwOnInvalidObject: false,
        updateMetadata: false,
      });
      const pages = await out.copyPages(src, src.getPageIndices());
      for (const p of pages) out.addPage(p);
    } catch (e) {
      warnings.push(`${f.filename}: PDF 병합 실패 — ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  // 모든 PDF가 깨졌으면 텍스트 fallback — 각 파일을 parseDocument로 텍스트만 뽑아 concat.
  // 이러면 사용자 입장에서 "0/N 자료 안 됨" 대신 "텍스트만 합쳐서 정리해드림" 결과를 받음.
  if (out.getPageCount() === 0) {
    warnings.push("모든 PDF에서 페이지 추출 실패 — 텍스트만 합쳐 정리해요");
    return await mergeAsText(files);
  }

  let mergedBytes: Uint8Array;
  try {
    mergedBytes = await out.save();
  } catch (e) {
    warnings.push(
      `merged PDF save 실패 — 텍스트 fallback: ${e instanceof Error ? e.message : "unknown"}`,
    );
    const textFallback = await mergeAsText(files);
    return { ...textFallback, warnings: [...warnings, ...textFallback.warnings] };
  }

  // 병합된 PDF를 파서에 넘겨 텍스트도 추출 (full_text 채움) — 실패해도 빈 텍스트로 진행.
  // unpdf는 받은 Uint8Array의 underlying ArrayBuffer를 worker로 transfer해 detach 시킨다.
  // 그대로 넘기면 호출 후 mergedBytes가 0바이트가 되어 Storage에 빈 객체가 올라간다.
  // (timetable.ts·syllabus.ts와 동일 패턴 — 항상 독립 복사본을 넘긴다.)
  let parsed: Awaited<ReturnType<typeof parseDocument>>;
  try {
    parsed = await parseDocument({
      bytes: mergedBytes.slice(),
      filename: "merged.pdf",
      mimeType: "application/pdf",
    });
  } catch (e) {
    warnings.push(
      `merged PDF 텍스트 추출 실패 — 빈 본문으로 진행: ${e instanceof Error ? e.message : "unknown"}`,
    );
    // 텍스트는 비어도 PDF 자체는 살아있으므로 원본 다운로드는 가능. 요약/문제는 메타로만.
    parsed = {
      text: `[병합 PDF 텍스트 추출 실패]`,
      sanitizedText: `[병합 PDF 텍스트 추출 실패]`,
      mimeType: "application/pdf",
      source: "pdf",
      pageCount: out.getPageCount(),
      warnings: [],
    };
  }

  return {
    mode: "pdf",
    text: parsed.text,
    sanitizedText: parsed.sanitizedText,
    pageCount: parsed.pageCount ?? out.getPageCount(),
    mergedPdfBytes: mergedBytes,
    warnings: [...warnings, ...parsed.warnings],
  };
}

/**
 * 비-PDF 텍스트 형식 합치기 — 파일별 파싱 후 헤더와 함께 concat.
 * 이미지 같은 OCR 케이스도 처리 가능 (parseDocument가 vendor 분기).
 */
export async function mergeAsText(files: MergeInputFile[]): Promise<MergedResult> {
  if (files.length === 0) throw new Error("merge할 파일이 없어요");

  const parts: string[] = [];
  const sanitizedParts: string[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    try {
      const parsed = await parseDocument({
        bytes: f.bytes,
        filename: f.filename,
        mimeType: f.mimeType,
      });
      const header = `\n\n===== [파일 ${i + 1}/${files.length}] ${f.filename} =====\n\n`;
      parts.push(header + parsed.text);
      sanitizedParts.push(header + parsed.sanitizedText);
      warnings.push(...parsed.warnings.map((w) => `${f.filename}: ${w}`));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "파싱 실패";
      warnings.push(`${f.filename}: ${msg}`);
      parts.push(`\n\n===== [파일 ${i + 1}/${files.length}] ${f.filename} (파싱 실패) =====\n\n`);
    }
  }

  return {
    mode: "text-concat",
    text: parts.join(""),
    sanitizedText: sanitizedParts.join(""),
    pageCount: null,
    mergedPdfBytes: null,
    warnings,
  };
}

/** 형식 동질성 판단 — 모두 PDF인지, 아니면 텍스트 concat 가능한지. */
export function detectMergeMode(mimeTypes: string[]): MergeMode | "incompatible" {
  if (mimeTypes.length === 0) return "incompatible";
  if (mimeTypes.every((m) => m === "application/pdf")) return "pdf";
  if (mimeTypes.some((m) => m === "application/pdf")) {
    // PDF와 비-PDF 섞임 — text concat으로는 가능하지만 원본 PDF 손실되므로 차단
    return "incompatible";
  }
  return "text-concat";
}
