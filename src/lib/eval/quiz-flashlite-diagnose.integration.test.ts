import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, it } from "vitest";
import { generate } from "../claude";
import { loadPrompt } from "../prompts";
import { parseQuizModelJson, type QuizQuestionT } from "../schemas";
import { validateEvidence } from "../validate-quiz";

/**
 * Flash-Lite 살리기 진단 — 왜 evidence가 실패하는가?
 *
 * evidence drop 사유를 분류:
 *   A. "evidence가 비어있음" → 프롬프트로 강제 가능
 *   B. "너무 짧음(<10자)" → 프롬프트로 최소길이 요구 가능
 *   C. "본문의 정확한 인용이 아님"(환각) → 근본적, 살리기 어려움
 *
 * A·B가 많으면 프롬프트 보강으로 살릴 수 있음. C가 많으면 모델 태생 한계.
 *
 * 실행: RUN_FLASHLITE_DIAG=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run \
 *   src/lib/eval/quiz-flashlite-diagnose.integration.test.ts --reporter=verbose --testTimeout=600000
 */
const shouldRun = process.env.RUN_FLASHLITE_DIAG === "1";

const MATERIALS = [
  { id: "6ae502f5-16f8-48f0-ae29-e192053471b4", label: "파이썬 09장 함수" },
  { id: "d51ffda8-1579-46ba-b7eb-daece4d34fee", label: "토익 부사 총정리" },
];
const KINDS: Array<"multiple-choice" | "short-answer"> = ["multiple-choice", "short-answer"];

function splitIntoChunks(total: number): number[] {
  if (total <= 5) return [total];
  const chunks = total <= 15 ? 2 : total <= 30 ? 3 : 4;
  const base = Math.floor(total / chunks);
  const rem = total - base * chunks;
  return Array.from({ length: chunks }, (_, i) => base + (i < rem ? 1 : 0));
}

function ctx(size: number, idx: number, total: number): string {
  return [
    "## 학생 요청 (정적 메타)",
    "- 난이도: 보통",
    `- 문제 수: ${size}`,
    "## 요청된 문제 종류",
    `학생이 선택한 종류: ${KINDS.join(", ")}`,
    total > 1 ? `이 요청은 ${total}개 묶음 중 ${idx + 1}번째다. 자료의 다른 부분을 위주로.` : "",
  ].join("\n");
}

describe.runIf(shouldRun)("Flash-Lite evidence 실패 원인 진단", () => {
  it("drop 사유 분류 (25문제 × 2자료)", async () => {
    const env = readFileSync(".env.local", "utf8");
    const get = (k: string) =>
      (env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
    const sb = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    const rulePrompt = loadPrompt("quiz");

    const sujiBuckets = { 비어있음: 0, 너무짧음: 0, 인용아님_환각: 0, 기타: 0 };
    let total = 0;
    let kept = 0;
    const examples: string[] = [];

    for (const mat of MATERIALS) {
      const { data } = await sb.from("materials").select("full_text").eq("id", mat.id).limit(1);
      if (!data?.length) continue;
      const fullText = data[0].full_text as string;
      const chunks = splitIntoChunks(25);
      const results = await Promise.all(
        chunks.map((size, idx) =>
          generate({
            tool: "quiz",
            rulePrompt,
            dynamicContext: ctx(size, idx, chunks.length),
            userInput: fullText,
            maxTokens: 8192,
            temperature: 0.4,
            modelIdOverride: "gemini-3.5-flash-lite",
          })
            .then((g) => {
              try {
                const p = parseQuizModelJson(g.text).output;
                return p.rejected ? [] : p.questions;
              } catch {
                return [] as QuizQuestionT[];
              }
            })
            .catch(() => [] as QuizQuestionT[]),
        ),
      );
      const all = results.flat();
      // allowOcrFuzzy=true: 기호(•·:)·공백 차이 무시, 순서보존 char overlap ≥82%면 통과.
      // 실제 파이프라인이 OCR 자료에 켜는 것과 동일 — Flash-Lite의 기호 치환을 흡수하는지 확인.
      const ev = validateEvidence(all, fullText, { isMetadataOnly: false, allowOcrFuzzy: true });
      total += all.length;
      kept += ev.kept.length;
      for (const d of ev.dropped) {
        if (d.reason.includes("비어있음")) sujiBuckets.비어있음++;
        else if (d.reason.includes("너무 짧음")) sujiBuckets.너무짧음++;
        else if (d.reason.includes("정확한 인용이 아님")) {
          sujiBuckets.인용아님_환각++;
          if (examples.length < 6) examples.push(`  "${d.evidence.slice(0, 70)}"`);
        } else sujiBuckets.기타++;
      }
    }

    console.log("\n========== Flash-Lite evidence 실패 원인 ==========");
    console.log(
      `총 생성 ${total}개 · evidence 통과 ${kept}개 (${Math.round((kept / total) * 100)}%)`,
    );
    console.log(`\ndrop 사유별:`);
    console.log(`  A. evidence 비어있음     : ${sujiBuckets.비어있음}  ← 프롬프트로 강제 가능`);
    console.log(
      `  B. 너무 짧음(<10자)      : ${sujiBuckets.너무짧음}  ← 프롬프트로 최소길이 요구 가능`,
    );
    console.log(
      `  C. 본문 인용 아님(환각)  : ${sujiBuckets.인용아님_환각}  ← 근본적, 살리기 어려움`,
    );
    console.log(`  기타                     : ${sujiBuckets.기타}`);
    console.log(`\n환각 evidence 예시 (본문에 없는 인용):`);
    for (const e of examples) console.log(e);
    const fixable = sujiBuckets.비어있음 + sujiBuckets.너무짧음;
    const hard = sujiBuckets.인용아님_환각;
    console.log(
      `\n판정: 프롬프트로 살릴 수 있는 실패 ${fixable}개 / 근본적(환각) ${hard}개 → ${
        fixable > hard ? "프롬프트 보강으로 살릴 가능성 있음" : "환각이 지배적 — 살리기 어려움"
      }`,
    );
  }, 600_000);
});
