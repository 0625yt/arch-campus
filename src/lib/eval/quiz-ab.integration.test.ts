import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { estimateCost, generate, getModelVendor, MODELS } from "../claude";
import { loadPrompt } from "../prompts";
import { parseModelJson, QuizOutput } from "../schemas";
import { compareForPromotion, evaluateQuiz } from "./quiz-metrics";

/**
 * 퀴즈 모델 블라인드 A/B — 실제 LLM 호출이 일어나는 통합 테스트.
 *
 * 기본은 skip. 실행하려면:
 *   AI_GATEWAY_API_KEY=... RUN_LLM_EVAL=1 npx vitest run src/lib/eval/quiz-ab.integration.test.ts
 *
 * 이유:
 *   - CI에서 매번 LLM 호출하면 비용·지연이 폭발
 *   - 키 없는 환경(외부 컨트리뷰터)에서 실패해도 의미 X
 *   - 평가 메트릭 자체는 quiz-metrics.test.ts가 단위로 커버
 *
 * 무엇을 보는가:
 *   - baseline (Anthropic Sonnet 4.6) vs candidate (Google Gemini 2.5 Flash)
 *   - 같은 자료·같은 프롬프트로 각각 1회씩 호출
 *   - evidence 매칭률·보기 무결성·한국어 stem 비율·스키마 위반 자동 측정
 *   - compareForPromotion이 "통과/거부" 결론을 자동 산출
 *   - 비용도 같이 출력해 "절감 vs 품질" 트레이드오프 즉시 확인
 *
 * 한계:
 *   - 변별력(목표 정답률 50~75%)은 실제 응시 데이터 없이 못 잼 — 사람 판단 필요
 *   - 1회 호출이라 모델 분산이 결과에 섞임 — 진짜 결정 전엔 N=5~10 권장
 */

const shouldRun = process.env.RUN_LLM_EVAL === "1";

describe.skipIf(!shouldRun)("quiz A/B — Sonnet vs Gemini Flash (LLM 호출)", () => {
  const material = readFileSync(
    join(process.cwd(), "src/lib/eval/fixtures/sample-activation.md"),
    "utf8",
  );
  const rulePrompt = loadPrompt("quiz");
  // dynamicContext는 quiz 서비스가 보내는 메타와 같은 모양 — 자료 종류·난이도·요청 수 만.
  // 학생 옵션은 단순화 (객관식만, 보통 난이도, 5문제).
  const dynamicContext = [
    "## 학생 요청 (정적 메타)",
    "- 자료 종류: 강의 노트",
    "- 난이도: 보통",
    "- 문제 수: 5",
    "- 문제 유형: 객관식만",
  ].join("\n");

  // 각 호출은 같은 자료를 본문으로 받음. 60K char 컷은 fixture가 짧아 영향 X.
  async function runOnce(modelLabel: "sonnet" | "flash") {
    // resolveModel은 env 기반이라 여기선 일시 토글. 호출 전후 cleanup.
    const original = process.env.QUIZ_MODEL_VENDOR;
    if (modelLabel === "flash") process.env.QUIZ_MODEL_VENDOR = "google";
    else delete process.env.QUIZ_MODEL_VENDOR;

    try {
      const r = await generate({
        tool: "quiz",
        rulePrompt,
        dynamicContext,
        userInput: material,
        maxTokens: 4096,
        temperature: 0.4,
      });
      const parsed = parseModelJson(QuizOutput, r.text);
      const metric = evaluateQuiz({ materialText: material, quiz: parsed });
      const cost = estimateCost(r.usage, r.modelId);
      return { model: r.modelId, vendor: getModelVendor(r.modelId), metric, cost, raw: r };
    } finally {
      // 원상복구 — 다른 테스트가 영향 안 받게
      if (original === undefined) delete process.env.QUIZ_MODEL_VENDOR;
      else process.env.QUIZ_MODEL_VENDOR = original;
    }
  }

  it("baseline(Sonnet)과 candidate(Flash)를 둘 다 호출해 비교 출력", async () => {
    const baseline = await runOnce("sonnet");
    const candidate = await runOnce("flash");

    const verdict = compareForPromotion(baseline.metric, candidate.metric);

    // 사람이 한눈에 보게 한 묶음으로 출력. fail 안 하더라도 stdout에 남음.
    console.log("\n────────── 퀴즈 A/B 결과 ──────────");
    console.log(`baseline:  ${baseline.model} (${baseline.vendor})`);
    console.log(
      `           문제 ${baseline.metric.total} · evidence ${(baseline.metric.evidenceMatchRate * 100).toFixed(0)}% · 보기무결 ${(baseline.metric.choicesIntegrityRate * 100).toFixed(0)}% · 한국어 stem ${(baseline.metric.meanKoreanRatioInStem * 100).toFixed(0)}% · 스키마위반 ${baseline.metric.schemaIssues} · 비용 $${baseline.cost.toFixed(4)}`,
    );
    console.log(`candidate: ${candidate.model} (${candidate.vendor})`);
    console.log(
      `           문제 ${candidate.metric.total} · evidence ${(candidate.metric.evidenceMatchRate * 100).toFixed(0)}% · 보기무결 ${(candidate.metric.choicesIntegrityRate * 100).toFixed(0)}% · 한국어 stem ${(candidate.metric.meanKoreanRatioInStem * 100).toFixed(0)}% · 스키마위반 ${candidate.metric.schemaIssues} · 비용 $${candidate.cost.toFixed(4)}`,
    );
    console.log(`판정: ${verdict.promote ? "✅ candidate 전환 가능" : "❌ baseline 유지"}`);
    if (verdict.reasons.length > 0) {
      console.log("거부 사유:");
      for (const r of verdict.reasons) console.log(`  - ${r}`);
    }
    const ratio = baseline.cost > 0 ? candidate.cost / baseline.cost : 0;
    console.log(`비용 비: candidate / baseline = ${(ratio * 100).toFixed(1)}%`);
    console.log("──────────────────────────────────\n");

    // 어서션은 "둘 다 성공적으로 호출됐고 응답 형식이 합당함"까지만.
    // 판정 자체는 사람이 보고 결정 (자동으로 fail 시키면 모델 분산에 의한 가짜 실패가 잦음).
    expect(baseline.metric.total).toBeGreaterThan(0);
    expect(candidate.metric.total).toBeGreaterThan(0);
    // evidence·보기·스키마는 회귀 가드로만 — 50% 이하는 명백한 모델 망가짐.
    expect(baseline.metric.evidenceMatchRate).toBeGreaterThanOrEqual(0.5);
    expect(candidate.metric.evidenceMatchRate).toBeGreaterThanOrEqual(0.5);
  }, 120_000); // LLM 호출 2회 + Gemini는 가끔 느림 — 2분 타임아웃
});
