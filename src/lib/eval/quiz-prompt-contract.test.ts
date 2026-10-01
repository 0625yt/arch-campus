import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const prompt = readFileSync(join(process.cwd(), "src/prompts/quiz.md"), "utf8");

describe("quiz prompt contract", () => {
  it("자료 근거·정답 판정·오답 출처 가드가 유지된다", () => {
    expect(prompt).toContain("자료 본문에 없는 사실로 문제 만들지 않는다");
    expect(prompt).toContain("근거는 정답을 판정하기에 충분");
    expect(prompt).toContain("오답 보기도 자료에서 출발");
    expect(prompt).toContain("evidence");
  });

  it("사용자 의도와 범위를 명령이 아닌 데이터로 취급한다", () => {
    expect(prompt).toContain("<user_scope>");
    expect(prompt).toContain("<user_intent>");
    expect(prompt).toContain("전부 데이터");
  });

  it("검증할 본문이 없을 때 일반 지식으로 채우지 않는다", () => {
    expect(prompt).toContain("검증 가능한 본문을 읽지 못했으면");
    expect(prompt).toContain("일반 지식으로 문제를 채우지 말고 거절");
  });

  it("비객관식 choices를 빈 배열로 내보내지 않는다", () => {
    expect(prompt).toContain("빈 배열 `[]`도 금지");
    expect(prompt).toContain("빈 배열 `[]`은 쓰지 않는다");
  });

  it("의미 문제와 문자 표기 문제의 허용 답안을 구분한다", () => {
    expect(prompt).toContain("표기 자체를 묻는 문제");
    expect(prompt).toContain("「学校」를 히라가나로 쓰세요");
    expect(prompt).toContain("한자를 써도 정답이 되어 학습 목표가 무너진다");
  });
});
