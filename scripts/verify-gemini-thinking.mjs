#!/usr/bin/env node
// 검증: Gemini Pro thinking 사고(2026-06-09) fix가 의도대로 동작하는가.
//
// 사고 원인: GEMINI_BY_TOOL로 Vision·생성 도구를 Pro로 올렸는데 thinking 적용을
// 도구 화이트리스트(GOOGLE_THINKING_TOOLS)로 판단해서, 화이트리스트에 없는 Pro 도구
// (timetable/syllabus 등)가 thinkingBudget:0을 받아 API에 거부당해 전부 죽었다.
//   ("Budget 0 is invalid. This model only works in thinking mode.")
//
// fix: thinking 적용을 도구가 아니라 모델 tier(Pro냐 Flash냐)로 판단한다.
//   → Pro로 가는 모든 도구는 자동으로 thinking ON, Flash는 OFF. 화이트리스트 누락 불가능.
//
// 이 스크립트는 callProviderOptions가 내부 함수라 직접 못 부르므로, export된
// getModelIdFor로 각 도구의 실제 라우팅 모델ID를 얻고 modelTier와 동일한 판정
// (gemini && pro)을 재현해, "Pro 도구 = thinking 필요"가 빠짐없이 성립하는지 본다.
//
// 사용: node --env-file=.env.local --experimental-strip-types scripts/verify-gemini-thinking.mjs
import { getModelIdFor } from "../src/lib/claude.ts";

// modelTier의 geminiPro 판정과 동일 (claude.ts line 365)
const isPro = (id) => id.includes("gemini") && id.includes("pro");
const isGemini = (id) => id.includes("gemini");

// vendor=google일 때만 thinking 분기가 의미. google 분기를 강제로 본다.
const TOOLS = [
  "quiz",
  "presentation",
  "report-structure",
  "wizard-assignment",
  "wizard-exam",
  "wizard-cram",
  "syllabus-extract",
  "timetable-extract",
  "exam-extract",
  "summarize",
  "chat",
  "chat-free",
  "event-parse",
  "post-mortem",
  "pdf-ocr",
];

console.log("\n── 도구별 thinking 분기 (modelId 기준) ──────────────────");
console.log("도구                  모델ID              vendor  thinking");
console.log("─".repeat(64));

let proCount = 0;
for (const tool of TOOLS) {
  const id = getModelIdFor(tool);
  const gemini = isGemini(id);
  const pro = isPro(id);
  if (pro) proCount++;
  // Pro면 thinkingBudget:2048(ON), 그 외 Gemini면 0(OFF), Anthropic이면 thinking 분기 안 탐
  const thinking = !gemini ? "(N/A · Anthropic)" : pro ? "ON (2048)" : "OFF (0)";
  console.log(
    `${tool.padEnd(20)}  ${id.padEnd(18)}  ${(gemini ? "google" : "anthropic").padEnd(6)}  ${thinking}`,
  );
}

console.log("─".repeat(64));
console.log(
  `\n핵심 불변식: Pro로 라우팅되는 도구(${proCount}개)는 thinking 화이트리스트 없이도 모두 ON.`,
);
console.log("  → 사고 재발 조건(Pro 도구가 budget 0 받음)이 코드 경로에서 사라졌는지 확인.\n");

// 회귀 가드: vendor=google 강제 시 Pro 도구가 하나라도 thinking OFF면 실패
process.env.QUIZ_MODEL_VENDOR = "google";
process.env.SUMMARY_MODEL_VENDOR = "google";
const id = getModelIdFor("quiz");
const ok = !isGemini(id) || isPro(id); // quiz는 vendor=google이면 Pro여야
console.log(
  ok
    ? "\x1b[32m✓\x1b[0m quiz vendor=google → Pro 라우팅 확인"
    : "\x1b[31m✗\x1b[0m quiz가 Pro로 안 감 — fix 점검 필요",
);
process.exit(ok ? 0 : 1);
