import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, it } from "vitest";
import { generate } from "../claude";
import { loadPrompt } from "../prompts";
import { parseQuizModelJson } from "../schemas";
import { validateEvidence, validateQuestionIntegrity } from "../validate-quiz";
import { evaluateQuiz } from "./quiz-metrics";

/**
 * quiz 모델 A/B — Gemini 3.6 Flash vs Gemini 3.5 Flash-Lite vs Claude Sonnet 5
 *
 * 사용자 실제 DB 자료로 퀴즈를 생성해 비용·성능(evidence·integrity·채택수)·속도를 비교.
 *
 * 실행:
 *   RUN_MODEL_AB=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run \
 *     src/lib/eval/quiz-model-ab.integration.test.ts --reporter=basic --testTimeout=900000
 *
 * ⚠️ 실제 API 비용 발생 (3 모델 × 3 자료 = 9회 생성). NODE_ENV!=production 필요(override 동작).
 */

const shouldRun = process.env.RUN_MODEL_AB === "1";

// 실제 시장 단가(2026-07-24 조사). 우리 PRICING 테이블(프로덕션 라우팅용)과 별개로
// A/B 비용 비교의 정확도를 위해 직접 명시. input/output per 1M USD.
const RATES: Record<string, { in: number; out: number }> = {
  "gemini-3.6-flash": { in: 1.5, out: 7.5 },
  "gemini-3.5-flash-lite": { in: 0.3, out: 2.5 },
  // Sonnet 5 도입가 $2/$10 (~2026-08-31). 이후 $3/$15.
  "claude-sonnet-5": { in: 2, out: 10 },
};

const MODELS = [
  { label: "Gemini 3.6 Flash", id: "gemini-3.6-flash" },
  { label: "Gemini 3.5 Flash-Lite", id: "gemini-3.5-flash-lite" },
  { label: "Claude Sonnet 5", id: "claude-sonnet-5" },
];

// 사용자 실제 자료 3종 (성격 다양화: 개념+코드 / 대량 영어문법 / 짧은 문법)
const MATERIAL_IDS = [
  { id: "6ae502f5-16f8-48f0-ae29-e192053471b4", label: "파이썬 09장 함수" },
  { id: "d51ffda8-1579-46ba-b7eb-daece4d34fee", label: "토익 부사 총정리" },
  { id: "1ca5d878-273d-49f8-916f-37293f50e94b", label: "TO부정사·동명사" },
];

const REQUESTED = 5;
const KINDS: Array<"multiple-choice" | "short-answer"> = ["multiple-choice", "short-answer"];

function realCost(modelId: string, usage: { inputTokens: number; outputTokens: number }): number {
  const r = RATES[modelId];
  if (!r) return 0;
  return (usage.inputTokens * r.in) / 1e6 + (usage.outputTokens * r.out) / 1e6;
}

function dynamicContext(): string {
  return [
    "## 학생 요청 (정적 메타)",
    "- 난이도: 보통",
    `- 문제 수: ${REQUESTED}`,
    "",
    "## 요청된 문제 종류",
    `학생이 선택한 종류: ${KINDS.join(", ")}`,
    "각 문제에 kind를 명시하고 선택한 종류만 사용한다.",
    "자료가 짧으면 개수를 억지로 채우지 말고 서로 다른 학습 목표만 출제한다.",
  ].join("\n");
}

describe.runIf(shouldRun)("quiz 모델 A/B — 3.6 Flash vs 3.5 Flash-Lite vs Sonnet 5", () => {
  it(
    "실제 자료로 비용·성능·속도 비교",
    async () => {
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
        evidence: number;
        integrity: number;
        accepted: number;
        raw: number;
        note: string;
      };
      const rows: Row[] = [];

      for (const mat of MATERIAL_IDS) {
        const { data, error } = await sb
          .from("materials")
          .select("id,title,full_text")
          .eq("id", mat.id)
          .limit(1);
        if (error || !data?.length) {
          console.log(`⚠️ 자료 로드 실패 ${mat.label}: ${error?.message}`);
          continue;
        }
        const fullText = data[0].full_text as string;

        for (const model of MODELS) {
          process.stdout.write(`  ${model.label} × ${mat.label} ... `);
          const t0 = process.hrtime.bigint();
          let note = "";
          let cost = 0;
          let ms = 0;
          let evidence = 0;
          let integrity = 0;
          let accepted = 0;
          let raw = 0;
          try {
            const gen = await generate({
              tool: "quiz",
              rulePrompt,
              dynamicContext: dynamicContext(),
              userInput: fullText,
              maxTokens: 8192,
              temperature: 0.4,
              cacheUserInput: false,
              modelIdOverride: model.id,
            });
            ms = Number(process.hrtime.bigint() - t0) / 1e6;
            cost = realCost(model.id, gen.usage);
            const parsed = parseQuizModelJson(gen.text).output;
            if (parsed.rejected) {
              note = `REJECTED: ${parsed.reason}`;
            } else {
              raw = parsed.questions.length;
              const ev = validateEvidence(parsed.questions, fullText, { isMetadataOnly: false });
              const integ = validateQuestionIntegrity(ev.kept, { allowedKinds: KINDS });
              const metrics = evaluateQuiz({
                materialText: fullText,
                quiz: { questions: integ.kept, watermark: parsed.watermark },
              });
              accepted = integ.kept.length;
              evidence = metrics.evidenceMatchRate;
              integrity = ev.kept.length === 0 ? 0 : integ.kept.length / ev.kept.length;
            }
          } catch (e) {
            ms = Number(process.hrtime.bigint() - t0) / 1e6;
            note = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
          }
          rows.push({ model: model.label, material: mat.label, ms, cost, evidence, integrity, accepted, raw, note });
          console.log(
            note ||
              `✓ ${Math.round(ms)}ms · $${cost.toFixed(5)} · evidence ${Math.round(evidence * 100)}% · ${accepted}/${raw}`,
          );
        }
      }

      // ===== 자료별 상세 =====
      console.log("\n\n========== 자료별 상세 ==========");
      console.table(
        rows.map((r) => ({
          모델: r.model,
          자료: r.material,
          "속도(ms)": Math.round(r.ms),
          "비용($)": +r.cost.toFixed(5),
          evidence: Math.round(r.evidence * 100) + "%",
          integrity: Math.round(r.integrity * 100) + "%",
          채택: `${r.accepted}/${r.raw}`,
          비고: r.note || "-",
        })),
      );

      // ===== 모델별 종합 =====
      console.log("\n========== 모델별 종합 (3자료 평균) ==========");
      const agg: Record<string, { n: number; cost: number; ms: number; ev: number; integ: number; acc: number }> = {};
      for (const r of rows) {
        if (r.note) continue;
        (agg[r.model] ??= { n: 0, cost: 0, ms: 0, ev: 0, integ: 0, acc: 0 });
        const a = agg[r.model];
        a.n++;
        a.cost += r.cost;
        a.ms += r.ms;
        a.ev += r.evidence;
        a.integ += r.integrity;
        a.acc += r.accepted;
      }
      console.table(
        Object.entries(agg).map(([model, a]) => ({
          모델: model,
          "평균비용($)": +(a.cost / a.n).toFixed(5),
          "3자료합($)": +a.cost.toFixed(5),
          "평균속도(ms)": Math.round(a.ms / a.n),
          "evidence정확도": Math.round((a.ev / a.n) * 100) + "%",
          integrity: Math.round((a.integ / a.n) * 100) + "%",
          "평균채택": +(a.acc / a.n).toFixed(1),
        })),
      );
      console.log(
        "\n(비용=실제 시장단가×측정 usage / 속도=생성 wall-clock / evidence=본문 substring 매칭율, 높을수록 인용 정확)",
      );
    },
    900_000,
  );
});
