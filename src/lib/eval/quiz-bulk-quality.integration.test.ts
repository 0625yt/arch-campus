import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, it } from "vitest";
import { generate } from "../claude";
import { loadPrompt } from "../prompts";
import { parseQuizModelJson, type QuizQuestionT } from "../schemas";
import { dedupeBySemantics } from "../services/semantic-dedup";
import {
  areNearDuplicateStems,
  fingerprint,
  questionFingerprint,
  validateEvidence,
  validateQuestionIntegrity,
} from "../validate-quiz";

/**
 * quiz 대량 품질 A/B — 25문제 생성 시 중복·품질 저하 체크.
 *
 * 5문제로는 안 드러나는 것들:
 *   - 중복 문제(near-duplicate stem) 얼마나 나오나
 *   - 문제 수가 많아질 때 evidence 정확도가 무너지나
 *   - JSON이 잘려서 파싱 실패하나 (대량 출력 안정성)
 *   - dedup 후 실제 몇 개나 살아남나 (유효 산출률)
 *
 * 실행:
 *   RUN_BULK_QUALITY=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run \
 *     src/lib/eval/quiz-bulk-quality.integration.test.ts --reporter=verbose --testTimeout=1200000
 */

const shouldRun = process.env.RUN_BULK_QUALITY === "1";

const MODELS: Array<{ label: string; id: string; effort?: "low" | "medium" | "high" }> = [
  { label: "Gemini 3.6 Flash", id: "gemini-3.6-flash" },
  { label: "Gemini 3.5 Flash-Lite", id: "gemini-3.5-flash-lite" },
  // Sonnet 5는 effort=low로 thinking 최소화 → 속도 확보(기본 high는 퀴즈에 너무 느림)
  { label: "Sonnet 5 (effort=low)", id: "claude-sonnet-5", effort: "low" },
];

const RATES: Record<string, { in: number; out: number }> = {
  "gemini-3.6-flash": { in: 1.5, out: 7.5 },
  "gemini-3.5-flash-lite": { in: 0.3, out: 2.5 },
  "claude-sonnet-5": { in: 2, out: 10 },
};

// 대량 문제를 뽑을 만큼 본문이 충분한 자료 2종 (파이썬·토익 부사)
const MATERIALS = [
  { id: "6ae502f5-16f8-48f0-ae29-e192053471b4", label: "파이썬 09장 함수(12.6k자)" },
  { id: "d51ffda8-1579-46ba-b7eb-daece4d34fee", label: "토익 부사 총정리(37k자)" },
];

const REQUESTED = 25;
const KINDS: Array<"multiple-choice" | "short-answer"> = ["multiple-choice", "short-answer"];

function realCost(modelId: string, usage: { inputTokens: number; outputTokens: number }): number {
  const r = RATES[modelId];
  return r ? (usage.inputTokens * r.in) / 1e6 + (usage.outputTokens * r.out) / 1e6 : 0;
}

/** 실제 quiz.ts와 동일: 16~30문제는 3청크로 분할(청크당 maxTokens 안에 안전 → JSON 안 잘림). */
function splitIntoChunks(total: number): number[] {
  if (total <= 5) return [total];
  const chunks = total <= 15 ? 2 : total <= 30 ? 3 : 4;
  const base = Math.floor(total / chunks);
  const rem = total - base * chunks;
  return Array.from({ length: chunks }, (_, i) => base + (i < rem ? 1 : 0));
}

function dynamicContext(size: number, chunkIdx: number, chunkTotal: number): string {
  return [
    "## 학생 요청 (정적 메타)",
    "- 난이도: 보통",
    `- 문제 수: ${size}`,
    "",
    "## 요청된 문제 종류",
    `학생이 선택한 종류: ${KINDS.join(", ")}`,
    "각 문제에 kind를 명시하고 선택한 종류만 사용한다.",
    "서로 다른 학습 목표를 다뤄 중복을 피한다. 자료가 부족하면 억지로 개수를 채우지 않는다.",
    chunkTotal > 1
      ? `\n이 요청은 ${chunkTotal}개 묶음 중 ${chunkIdx + 1}번째다. 자료의 ${["앞부분", "중간부분", "뒷부분", "전체"][chunkIdx] ?? "전체"}를 위주로 출제해 다른 묶음과 겹치지 않게 한다.`
      : "",
  ].join("\n");
}

/** raw 문제 배열에서 near-duplicate를 센다. */
function countDuplicates(questions: QuizQuestionT[]): { unique: number; duplicates: number } {
  const accepted: QuizQuestionT[] = [];
  const stemFp = new Set<string>();
  const qFp = new Set<string>();
  let duplicates = 0;
  for (const q of questions) {
    const dup =
      stemFp.has(fingerprint(q.stem)) ||
      qFp.has(questionFingerprint(q)) ||
      accepted.some((p) => areNearDuplicateStems(p.stem, q.stem));
    if (dup) {
      duplicates++;
      continue;
    }
    stemFp.add(fingerprint(q.stem));
    qFp.add(questionFingerprint(q));
    accepted.push(q);
  }
  return { unique: accepted.length, duplicates };
}

describe.runIf(shouldRun)("quiz 대량 품질 — 25문제 중복·품질 저하 체크", () => {
  it("25문제 생성 시 중복·evidence·유효산출률", async () => {
    const env = readFileSync(".env.local", "utf8");
    const get = (k: string) =>
      (env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
    const sb = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    const rulePrompt = loadPrompt("quiz");

    type Row = {
      model: string;
      material: string;
      ms: number;
      cost: number;
      raw: number;
      duplicates: number;
      dupRate: string;
      semDups: number;
      evidence: string;
      survived: number;
      note: string;
    };
    const rows: Row[] = [];

    for (const mat of MATERIALS) {
      const { data, error } = await sb
        .from("materials")
        .select("full_text")
        .eq("id", mat.id)
        .limit(1);
      if (error || !data?.length) {
        console.log(`⚠️ 자료 로드 실패 ${mat.label}: ${error?.message}`);
        continue;
      }
      const fullText = data[0].full_text as string;

      for (const model of MODELS) {
        process.stdout.write(`  ${model.label} × ${mat.label} (25문제) ... `);
        const t0 = process.hrtime.bigint();
        const row: Row = {
          model: model.label,
          material: mat.label,
          ms: 0,
          cost: 0,
          raw: 0,
          duplicates: 0,
          dupRate: "-",
          semDups: 0,
          evidence: "-",
          survived: 0,
          note: "",
        };
        try {
          // 실제 파이프라인처럼 청크 분할 병렬 호출 (JSON 잘림 방지 + 실측 재현)
          const chunks = splitIntoChunks(REQUESTED);
          const chunkResults = await Promise.all(
            chunks.map((size, idx) =>
              generate({
                tool: "quiz",
                rulePrompt,
                dynamicContext: dynamicContext(size, idx, chunks.length),
                userInput: fullText,
                maxTokens: 8192, // 청크당 ~9문제 → 8192 안에 안전
                temperature: 0.4,
                cacheUserInput: false,
                modelIdOverride: model.id,
                effort: model.effort,
              }).then((gen) => {
                let questions: QuizQuestionT[] = [];
                let parseErr = "";
                try {
                  const p = parseQuizModelJson(gen.text).output;
                  if (!p.rejected) questions = p.questions;
                } catch (e) {
                  parseErr = e instanceof Error ? e.message.slice(0, 40) : String(e);
                }
                return { usage: gen.usage, questions, parseErr };
              }),
            ),
          );
          row.ms = Number(process.hrtime.bigint() - t0) / 1e6;
          // 청크 비용 합산
          row.cost = chunkResults.reduce((s, c) => s + realCost(model.id, c.usage), 0);
          // 모든 청크 문제 합치기
          const allQuestions = chunkResults.flatMap((c) => c.questions);
          const parseErrs = chunkResults.filter((c) => c.parseErr).length;
          if (allQuestions.length === 0) {
            row.note = `모든 청크 실패 (파싱실패 ${parseErrs}/${chunks.length})`;
          } else {
            row.raw = allQuestions.length;
            // 표면 중복(3-gram)
            const dup = countDuplicates(allQuestions);
            row.duplicates = dup.duplicates;
            row.dupRate = row.raw ? `${Math.round((dup.duplicates / row.raw) * 100)}%` : "-";
            // 강화 evidence: allowOcrFuzzy=true(기호정규화 + 순서보존 유사도) — 전 자료 적용
            const ev = validateEvidence(allQuestions, fullText, {
              isMetadataOnly: false,
              allowOcrFuzzy: true,
            });
            const integ = validateQuestionIntegrity(ev.kept, { allowedKinds: KINDS });
            // 표면 dedup
            const surfaceDeduped: QuizQuestionT[] = [];
            {
              const seen = new Set<string>();
              for (const q of integ.kept) {
                const dupOf =
                  seen.has(fingerprint(q.stem)) ||
                  surfaceDeduped.some((p) => areNearDuplicateStems(p.stem, q.stem));
                if (!dupOf) {
                  seen.add(fingerprint(q.stem));
                  surfaceDeduped.push(q);
                }
              }
            }
            // ★ 의미 dedup (신규): 표면으로 못 잡은 "글자 다른데 뜻 같은" 문제 제거
            const semResult = await dedupeBySemantics(
              surfaceDeduped.map((q) => ({ text: q.stem, q })),
            );
            row.semDups = semResult.dropped.length;
            row.survived = semResult.kept.length;
            row.evidence = row.raw ? `${Math.round((ev.kept.length / row.raw) * 100)}%` : "-";
            if (parseErrs > 0) row.note = `청크 ${parseErrs}/${chunks.length} 파싱실패`;
          }
        } catch (e) {
          row.ms = Number(process.hrtime.bigint() - t0) / 1e6;
          row.note = `ERROR: ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`;
        }
        rows.push(row);
        console.log(
          row.note ||
            `✓ ${Math.round(row.ms / 1000)}s · $${row.cost.toFixed(4)} · raw ${row.raw} · 표면중복 ${row.duplicates} · 의미중복 ${row.semDups} · evidence ${row.evidence} · 최종 ${row.survived}`,
        );
      }
    }

    console.log("\n\n========== 25문제 대량 품질 (자료별) ==========");
    console.table(
      rows.map((r) => ({
        모델: r.model,
        자료: r.material,
        "속도(s)": Math.round(r.ms / 1000),
        "비용($)": +r.cost.toFixed(4),
        생성수: r.raw,
        표면중복: r.duplicates,
        의미중복: r.semDups,
        evidence통과: r.evidence,
        최종유효: r.survived,
        비고: r.note || "-",
      })),
    );

    console.log("\n========== 모델별 종합 ==========");
    const agg: Record<
      string,
      { n: number; cost: number; ms: number; raw: number; dup: number; sem: number; surv: number }
    > = {};
    for (const r of rows) {
      if (r.raw === 0) continue; // 완전 실패만 제외, 부분 파싱실패는 포함
      agg[r.model] ??= { n: 0, cost: 0, ms: 0, raw: 0, dup: 0, sem: 0, surv: 0 };
      const a = agg[r.model];
      a.n++;
      a.cost += r.cost;
      a.ms += r.ms;
      a.raw += r.raw;
      a.dup += r.duplicates;
      a.sem += r.semDups;
      a.surv += r.survived;
    }
    console.table(
      Object.entries(agg).map(([model, a]) => ({
        모델: model,
        "평균속도(s)": Math.round(a.ms / a.n / 1000),
        "평균비용($)": +(a.cost / a.n).toFixed(4),
        평균생성수: +(a.raw / a.n).toFixed(1),
        표면중복: +(a.dup / a.n).toFixed(1),
        의미중복: +(a.sem / a.n).toFixed(1),
        평균유효산출: +(a.surv / a.n).toFixed(1),
        유효율: Math.round((a.surv / a.raw) * 100) + "%",
      })),
    );
    console.log(
      "\n(표면중복=3-gram / 의미중복=임베딩 코사인 / evidence=fuzzy+기호정규화 통과율 / 최종유효=모든 방어 통과한 실사용 가능 문제)",
    );
  }, 1_200_000);
});
