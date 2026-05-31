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

/** PDF만의 진짜 merge — pdf-lib로 페이지 단위로 옮겨붙임. */
export async function mergePdfs(files: MergeInputFile[]): Promise<MergedResult> {
  if (files.length === 0) throw new Error("merge할 파일이 없어요");
  if (files.some((f) => f.mimeType !== "application/pdf")) {
    throw new Error("mergePdfs는 PDF만 받아요");
  }

  const out = await PDFDocument.create();
  const warnings: string[] = [];
  for (const f of files) {
    try {
      const src = await PDFDocument.load(f.bytes, { ignoreEncryption: true });
      const pages = await out.copyPages(src, src.getPageIndices());
      for (const p of pages) out.addPage(p);
    } catch (e) {
      warnings.push(`${f.filename}: PDF 병합 실패 (${e instanceof Error ? e.message : "unknown"})`);
    }
  }

  if (out.getPageCount() === 0) {
    throw new Error("모든 PDF가 병합에 실패했어요");
  }

  const mergedBytes = await out.save();

  // 병합된 PDF를 파서에 넘겨 텍스트도 추출 (full_text 채움)
  const parsed = await parseDocument({
    bytes: mergedBytes,
    filename: "merged.pdf",
    mimeType: "application/pdf",
  });

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
