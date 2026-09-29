import { afterEach, describe, expect, it, vi } from "vitest";
import {
  kstMonthWindow,
  readAiRequestReserveUsd,
  readMonthlyBudgetUsd,
  secondsUntilReset,
  summarizeMonthlyAiUsage,
} from "./ai-budget";

afterEach(() => vi.unstubAllEnvs());

describe("AI 월간 사용량", () => {
  it("한국 시간 기준 월 시작과 다음 달 초기화 시각을 계산한다", () => {
    expect(kstMonthWindow(new Date("2026-09-30T14:59:59.000Z"))).toEqual({
      label: "2026년 9월",
      startsAt: "2026-08-31T15:00:00.000Z",
      resetsAt: "2026-09-30T15:00:00.000Z",
    });
    expect(kstMonthWindow(new Date("2026-09-30T15:00:00.000Z")).label).toBe("2026년 10월");
  });

  it("생성 기록을 합산하고 한도 도달 여부를 계산한다", () => {
    const usage = summarizeMonthlyAiUsage(
      [
        {
          tool: "quiz",
          call_count: 3,
          input_tokens: 300,
          output_tokens: 120,
          cache_read_tokens: 10,
          cache_creation_tokens: 0,
          cost_usd: 2.4,
        },
        {
          tool: "summarize",
          call_count: 2,
          input_tokens: 200,
          output_tokens: 80,
          cache_read_tokens: 0,
          cache_creation_tokens: 0,
          cost_usd: 0.6,
        },
      ],
      { now: new Date("2026-09-15T00:00:00Z"), budgetUsd: 3 },
    );

    expect(usage.calls).toBe(5);
    expect(usage.inputTokens).toBe(500);
    expect(usage.costUsd).toBeCloseTo(3);
    expect(usage.usagePercent).toBe(100);
    expect(usage.limitReached).toBe(true);
    expect(usage.breakdown.map((item) => item.label)).toEqual(["문제 생성", "자료 요약"]);
  });

  it("잘못된 환경값은 한도로 사용하지 않는다", () => {
    expect(readMonthlyBudgetUsd("")).toBeNull();
    expect(readMonthlyBudgetUsd("free")).toBeNull();
    expect(readMonthlyBudgetUsd("-1")).toBeNull();
    expect(readMonthlyBudgetUsd("3")).toBe(3);
  });

  it("요청 예약액은 안전한 기본값을 쓰고 유효한 설정만 허용한다", () => {
    expect(readAiRequestReserveUsd()).toBe(0.1);
    expect(readAiRequestReserveUsd("0.25")).toBe(0.25);
    expect(readAiRequestReserveUsd("0")).toBe(0.1);
    expect(readAiRequestReserveUsd("expensive")).toBe(0.1);
    expect(readAiRequestReserveUsd("11")).toBe(0.1);
  });

  it("초기화까지 남은 시간을 초 단위로 올림한다", () => {
    expect(
      secondsUntilReset("2026-10-01T00:00:00.000Z", new Date("2026-09-30T23:59:58.100Z")),
    ).toBe(2);
  });
});
