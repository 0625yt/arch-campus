import { describe, expect, it } from "vitest";
import { createSourceLocator } from "./source-grounding";

describe("source locations", () => {
  const quote = "표본 크기가 커지면 표준오차는 감소한다.";
  it("실제 페이지 표식에서 인용의 쪽수를 결정한다", () => {
    expect(createSourceLocator(`=== Page 8 ===\n${quote}`)(quote)?.page).toBe(8);
  });
  it("알 수 없는 쪽수와 반복 구간에는 가짜 쪽수를 붙이지 않는다", () => {
    expect(createSourceLocator(quote)(quote)?.page).toBeNull();
    expect(
      createSourceLocator(`=== Page 1 ===\n${quote}\n=== Page 2 ===\n${quote}`)(quote)?.page,
    ).toBeNull();
  });
  it("레이아웃 공백이 달라도 실제 원문의 문맥을 반환한다", () => {
    const actual = "표본 크기가\n커지면 표준오차는 감소한다.";
    expect(createSourceLocator(`=== Page 3 ===\n${actual}`)(quote)).toMatchObject({
      page: 3,
      context: expect.stringContaining(actual),
    });
  });
  it("이전 자료의 쪽수를 다음 자료에 물려주지 않는다", () => {
    expect(
      createSourceLocator(
        `=== Page 8 ===\n다른 내용\n===== [자료 2] 노트 (lecture) =====\n${quote}`,
      )(quote)?.page,
    ).toBeNull();
  });
  it("인용이 없으면 인용 텍스트 자체를 원문으로 대체하지 않는다", () => {
    expect(createSourceLocator("완전히 다른 본문입니다.")(quote)).toBeNull();
  });
  it("주변 문장을 잘라 의미가 달라지는 것을 피한다", () => {
    const neighbor = "진행은 임계 구역이 비어 있을 때 진입 결정을 무한히 미루지 않는 조건이다.";
    const source = `${neighbor}\n${"나".repeat(480)}\n${quote}\n${"다".repeat(480)}\n${neighbor}`;
    const context = createSourceLocator(source)(quote)?.context;
    expect(context).toContain(neighbor);
    expect(context?.startsWith(neighbor)).toBe(true);
    expect(context?.endsWith(neighbor)).toBe(true);
  });
});
