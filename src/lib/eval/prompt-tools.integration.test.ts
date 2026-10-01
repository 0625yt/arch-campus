import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generate } from "@/lib/claude";
import { loadPrompt } from "@/lib/prompts";
import { ChecklistOutput, evidenceMatches, parseModelJson, SummarizeOutput } from "@/lib/schemas";
import { createSourceLocator } from "@/lib/source-grounding";
import { groundSummaryCitations } from "@/lib/summary-grounding";
import { PROMPT_QUALITY_FIXTURES } from "./fixtures/prompt-quality";

// Opt-in, synthetic inputs only. No database writes, emails or private student data.
describe.skipIf(process.env.RUN_PROMPT_EVAL !== "1")("other prompt regressions live", () => {
  it("요약의 인용과 쪽수가 원문에 존재한다", async () => {
    const source = PROMPT_QUALITY_FIXTURES[0].source;
    const result = await generate({
      tool: "summarize",
      rulePrompt: loadPrompt("summarize"),
      responseSchema: SummarizeOutput,
      dynamicContext: "제목: 표본추론 강의 노트. 본문 전체, 일반 요약.",
      userInput: source,
      maxTokens: 4096,
    });
    mkdirSync(".tmp", { recursive: true });
    writeFileSync(".tmp/summary-quality.json", result.text);
    const output = groundSummaryCitations(parseModelJson(SummarizeOutput, result.text), source);
    const quoted = output.blocks.filter((block) => block.sourceQuote);
    expect(quoted.length).toBeGreaterThanOrEqual(3);
    const locate = createSourceLocator(source);
    for (const block of quoted) {
      expect(source.includes(block.sourceQuote ?? "")).toBe(true);
      expect(locate(block.sourceQuote ?? "")?.page).toBe(block.sourcePage);
    }
    expect(JSON.stringify(output.blocks)).toContain("제2종");
  }, 120_000);

  it("과제 체크리스트의 모든 인용이 공지 원문에 존재한다", async () => {
    const source =
      "운영체제 과제는 이진 탐색과 선형 탐색을 비교하는 보고서입니다. 본문은 3쪽이며 참고문헌은 별도입니다. PDF로 변환해 2026년 10월 8일 오후 6시까지 LMS에 제출하세요. 알고리즘의 시간복잡도를 비교하는 표를 반드시 포함하세요. 참고문헌은 2개 이상 기재하세요. 지각 제출은 10점 감점입니다.";
    const result = await generate({
      tool: "wizard-assignment",
      rulePrompt: loadPrompt("report-checklist"),
      dynamicContext: "과제 이름: 탐색 비교 보고서. 추가 메모 없음.",
      userInput: source,
      maxTokens: 4096,
    });
    const output = parseModelJson(ChecklistOutput, result.text);
    expect(output.rejected).not.toBe(true);
    if (output.rejected) return;
    for (const requirement of output.requirements)
      expect(evidenceMatches(source, requirement.quote)).toBe(true);
    expect(output.requirements.some((requirement) => requirement.weight === "high")).toBe(true);
  }, 120_000);

  it("모호한 날짜와 분모 없는 점수에서 가짜 일정·비율을 만들지 않는다", async () => {
    const result = await generate({
      tool: "event-parse",
      rulePrompt: loadPrompt("event-parse"),
      dynamicContext: "오늘은 2026-10-01 목요일 (KST UTC+09:00).",
      userInput: "곧 동아리 회식. 2026년 10월 8일 오후 6시 운영체제 과제 마감, 배점 30점.",
      maxTokens: 1500,
    });
    const output = parseModelJson(
      z.object({
        events: z.array(
          z.object({
            title: z.string(),
            starts_at: z.string().datetime({ offset: true }),
            weight_percent: z.number().nullable(),
          }),
        ),
      }),
      result.text,
    );
    expect(output.events).toHaveLength(1);
    expect(output.events[0].title).toContain("과제");
    expect(new Date(output.events[0].starts_at).toISOString()).toBe("2026-10-08T09:00:00.000Z");
    expect(output.events[0].weight_percent).toBeNull();
  }, 120_000);
});

import { mkdirSync, writeFileSync } from "node:fs";
