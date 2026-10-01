import { describe, expect, it } from "vitest";
import { supportedEventWeight } from "./event-weight";

describe("event weight provenance", () => {
  it("분모 없는 점수와 무관한 백분율을 비중으로 저장하지 않는다", () => {
    expect(supportedEventWeight(30, "과제 배점 30점")).toBeNull();
    expect(supportedEventWeight(30, "발표 10%, 과제 배점 30점")).toBeNull();
  });
  it("명시된 백분율과 만점 대비 배점만 보존한다", () => {
    expect(supportedEventWeight(30, "성적 30%")).toBe(30);
    expect(supportedEventWeight(12.5, "12.5 퍼센트")).toBe(12.5);
    expect(supportedEventWeight(30, "총 100점 중 30점")).toBe(30);
    expect(supportedEventWeight(25, "20점 만점 중 5점")).toBe(25);
    expect(supportedEventWeight(25, "5점 / 20점")).toBe(25);
    expect(supportedEventWeight(null, "30%")).toBeNull();
    expect(supportedEventWeight(30, "0점 중 30점")).toBeNull();
  });
});
