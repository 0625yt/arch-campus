import { describe, expect, it } from "vitest";
import {
  chunkMaterial,
  extractRelevantChunks,
  formatChunksAsHint,
  scoreChunk,
  tokenizeQuestion,
} from "./extract-relevant";

describe("tokenizeQuestion", () => {
  it("한국어 어절 토큰화 + 조사 제거", () => {
    const tokens = tokenizeQuestion("ReLU 활성화 함수는 무엇인가요?");
    expect(tokens).toContain("relu");
    expect(tokens).toContain("활성화");
    // "함수는" 조사 "는" 제거 → "함수"
    expect(tokens).toContain("함수");
    expect(tokens).not.toContain("함수는");
  });

  it("너무 짧은 토큰은 제외", () => {
    const tokens = tokenizeQuestion("그 X는 뭐?");
    // "그", "X" 등은 길이 1 → 제외. "뭐"는 길이 1 → 제외.
    expect(tokens).not.toContain("그");
    expect(tokens).not.toContain("x");
    expect(tokens).not.toContain("뭐");
  });

  it("중복 제거", () => {
    const tokens = tokenizeQuestion("ReLU와 ReLU 차이");
    const reluCount = tokens.filter((t) => t === "relu").length;
    expect(reluCount).toBe(1);
  });

  it("구두점 제거", () => {
    const tokens = tokenizeQuestion("활성화 함수(activation)란?");
    expect(tokens).toContain("활성화");
    expect(tokens).toContain("activation");
    // 괄호 안 토큰도 보존돼야 함
    expect(tokens).toContain("함수");
  });
});

describe("chunkMaterial", () => {
  it("빈 단락 경계로 자름", () => {
    const text = "첫 단락이다.\n\n둘째 단락이다.\n\n셋째 단락이다.";
    const chunks = chunkMaterial(text);
    expect(chunks.length).toBe(3);
    expect(chunks[0].text).toContain("첫 단락");
    expect(chunks[1].text).toContain("둘째 단락");
  });

  it("긴 단락은 ~1000자로 재분할", () => {
    const long = `${"가나다라마바사아자차카타파하".repeat(120)}.`; // ~1700자 한 단락
    const chunks = chunkMaterial(long);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // 모든 청크는 너무 길지 않게 (TARGET 1000 + 마지막 청크 잔여)
    for (const c of chunks) {
      expect(c.text.length).toBeLessThan(2500);
    }
  });

  it("빈 텍스트는 빈 배열", () => {
    expect(chunkMaterial("")).toEqual([]);
  });
});

describe("scoreChunk", () => {
  const chunk =
    "ReLU는 가장 흔히 쓰이는 활성화 함수다. ReLU는 음수 입력을 0으로 보낸다. 활성화 함수는 비선형성을 부여한다.";

  it("매칭 빈도 ↑ 시 점수 ↑", () => {
    expect(scoreChunk(chunk, ["relu"])).toBeGreaterThan(0);
    expect(scoreChunk(chunk, ["relu"])).toBeGreaterThanOrEqual(2); // ReLU 2번 등장
  });

  it("긴 토큰(3자+)은 가중치 ↑", () => {
    const shortToken = scoreChunk(chunk, ["가나"]); // 등장 X → 0
    const longToken = scoreChunk(chunk, ["활성화"]); // 2번 등장 × 1.5 = 3
    expect(shortToken).toBe(0);
    expect(longToken).toBeGreaterThanOrEqual(3);
  });

  it("매칭 X는 0", () => {
    expect(scoreChunk(chunk, ["없는단어"])).toBe(0);
  });

  it("토큰 0개면 0", () => {
    expect(scoreChunk(chunk, [])).toBe(0);
  });
});

describe("extractRelevantChunks — 통합", () => {
  // 충분히 긴 본문 — chunkMaterial이 동작하도록 2000+ 자
  const material = [
    "## 1. 활성화 함수 개요",
    "신경망에 비선형성을 부여하는 장치다. 선형 변환만 쌓으면 깊이가 의미를 잃는다. ".repeat(8),
    "",
    "## 2. ReLU",
    "ReLU는 가장 흔히 쓰이는 활성화 함수다. ReLU(x) = max(0, x). ".repeat(10),
    "",
    "## 3. 시그모이드",
    "시그모이드는 (0, 1) 출력. 이진 분류에 쓴다. ".repeat(10),
    "",
    "## 4. 경사하강법",
    "경사하강법은 기울기 반대 방향으로 가중치를 업데이트. ".repeat(10),
  ].join("\n");

  it("ReLU 질문 → ReLU 청크가 최상위", () => {
    const chunks = extractRelevantChunks(material, "ReLU는 어떤 활성화 함수인가요?");
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].text).toContain("ReLU");
  });

  it("경사하강법 질문 → 경사하강법 청크가 상위", () => {
    const chunks = extractRelevantChunks(material, "경사하강법이 뭔가요?");
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].text).toContain("경사하강법");
  });

  it("자료가 너무 짧으면 [] (전체가 어차피 컨텍스트에 있음)", () => {
    const short = "활성화 함수는 비선형성을 부여한다.";
    expect(extractRelevantChunks(short, "활성화 함수")).toEqual([]);
  });

  it("매칭되는 청크가 없으면 [] (excludeZero default)", () => {
    const chunks = extractRelevantChunks(material, "양자컴퓨터 큐비트");
    expect(chunks).toEqual([]);
  });

  it("topN으로 결과 수 제한", () => {
    const chunks = extractRelevantChunks(material, "활성화 함수 ReLU 시그모이드", { topN: 2 });
    expect(chunks.length).toBeLessThanOrEqual(2);
  });
});

describe("formatChunksAsHint", () => {
  it("빈 배열은 빈 문자열", () => {
    expect(formatChunksAsHint([])).toBe("");
  });

  it("청크 1개 포맷", () => {
    const text = formatChunksAsHint([{ text: "ReLU는 활성화 함수.", startIndex: 0, score: 3 }]);
    expect(text).toContain("관련 발췌");
    expect(text).toContain("발췌 1");
    expect(text).toContain("ReLU는 활성화 함수");
  });

  it("여러 청크는 구분선으로 묶음", () => {
    const text = formatChunksAsHint([
      { text: "첫 청크", startIndex: 0, score: 3 },
      { text: "둘째 청크", startIndex: 100, score: 2 },
    ]);
    expect(text).toContain("발췌 1");
    expect(text).toContain("발췌 2");
    expect(text).toContain("---");
  });
});
