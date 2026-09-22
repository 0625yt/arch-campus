#!/usr/bin/env node
// 우리 코드 vendor 분기가 실제로 동작하는지 — claude.ts의 generate()를 직접 호출.
// QUIZ_MODEL_VENDOR=google·SUMMARY_MODEL_VENDOR=google이 켜진 상태에서 each tool이 어느 모델로
// 라우팅되는지 끝-투-끝 확인.
//
// 사용: node --env-file=.env.local --experimental-strip-types scripts/verify-vendor-routing.mjs
// (Node 22.6+ 필요. .ts 파일을 alias 없이 import하려면 ESM relative 경로로)

// 우리 코드의 resolveModel은 internal이라 getModelIdFor만으로 검증.
import { getModelIdFor, MODELS } from "../src/lib/claude.ts";

console.log("\n── env vendor flag 상태 ───────────────");
console.log(`QUIZ_MODEL_VENDOR=${process.env.QUIZ_MODEL_VENDOR ?? "(unset)"}`);
console.log(`SUMMARY_MODEL_VENDOR=${process.env.SUMMARY_MODEL_VENDOR ?? "(unset)"}`);

console.log("\n── tool별 라우팅 ──────────────────────");
const cases = [
  ["quiz", "google"],
  ["summarize", "google"],
  ["presentation", "sonnet"],
  ["timetable-extract", "sonnet"],
  ["syllabus-extract", "sonnet"],
  ["chat", "haiku"],
  ["chat-free", "haiku"],
  ["event-parse", "haiku"],
];

let allOk = true;
for (const [tool, expectedKey] of cases) {
  const id = getModelIdFor(tool);
  const expected = MODELS[expectedKey === "google" ? "geminiFlash" : expectedKey];
  const ok = id === expected;
  if (!ok) allOk = false;
  console.log(
    `${ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${tool.padEnd(20)} → ${id} ${ok ? "" : `(예상: ${expected})`}`,
  );
}

console.log("");
process.exit(allOk ? 0 : 1);
