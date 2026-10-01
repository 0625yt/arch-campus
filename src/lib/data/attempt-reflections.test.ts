import { describe, expect, it } from "vitest";
import { AttemptReflectionInput } from "./attempt-reflections";

describe("AttemptReflectionInput", () => {
  it("accepts a complete reflection", () => {
    expect(
      AttemptReflectionInput.safeParse({
        readiness: 3,
        satisfaction: 4,
        causes: ["concept-gap", "careless"],
        nextAction: "금요일에 2단원 오답을 다시 푼다.",
        notes: "공식을 외우기보다 적용 조건을 구분해야 한다.",
      }).success,
    ).toBe(true);
  });

  it("rejects unknown causes and out-of-range scores", () => {
    expect(
      AttemptReflectionInput.safeParse({
        readiness: 0,
        satisfaction: 6,
        causes: ["unknown"],
        nextAction: "",
        notes: "",
      }).success,
    ).toBe(false);
  });
});
