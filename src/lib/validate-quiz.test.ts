import { describe, expect, it } from "vitest";
import type { QuizQuestionT } from "@/lib/schemas";
import { questionFingerprint, validateEvidence } from "./validate-quiz";

/**
 * evidence 검증 회귀 테스트 — 환각 차단의 사활.
 *
 * 2026-06-04: substring 완전일치 → 문자 오버랩 비율로 근본 재설계.
 * 일본어 후리가나처럼 OCR이 텍스트를 어긋나게 뽑아도 정당한 인용은 살리고,
 * 자료에 없는 환각은 막아야 한다. 임계값(0.6)을 누가 잘못 건드리면 여기서 깨진다.
 */

function q(id: number, evidence: string): QuizQuestionT {
  return {
    id,
    type: "mcq",
    stem: `문제 ${id}`,
    choices: ["a", "b", "c", "d"],
    answerIndex: 0,
    explanation: "",
    evidence,
    topic: null,
  } as unknown as QuizQuestionT;
}

// 일본어 OCR 본문 — 한자와 후리가나(루비)가 줄바꿈으로 분리된 실제 형태.
// 실제 단원 자료처럼 같은 표현이 반복되는 길이(오버랩 비율이 현실적으로 나오게).
const JP_SOURCE = `9. 何時までですか。
銀行員
ぎんこういん
はい、ハナ銀行
ぎんこう
です。
金
キム
もしもし、銀行
ぎんこう
は何時
なんじ
までですか。
銀行員
ぎんこういん
9時
じ
から3時
じ
までです。
金
キム
あ、3時
じ
までですね。
会社
かいしゃ
は8時
じ
からです。
会社
かいしゃ
は9時
じ
からです。
銀行
ぎんこう
は9時
じ
からです。
会社
かいしゃ
は9時
じ
から5時
じ
までです。
銀行
ぎんこう
は9時
じ
から5時
じ
までです。
学校
がっこう
は9時
じ
から6時
じ
までです。
学校
がっこう
は10時
じ
から7時
じ
までです。
病院
びょういん
は8時
じ
から5時
じ
までです。
図書館
としょかん
は9時
じ
から5時
じ
までです。
はい、そうです。
ありがとうございます。`;

const EN_SOURCE =
  "There are too many stores in this area. The new shopping mall opened last month near the station.";

describe("validateEvidence — 환각 차단 + OCR 노이즈 관대성", () => {
  it("일본어: 후리가나로 어긋난 정당한 인용은 살린다 (substring 깨져도 오버랩으로 keep)", () => {
    const questions = [
      q(1, "会社は9時から5時までです"),
      q(2, "9時から3時までです"),
      q(3, "学校は9時から6時までです"),
      q(4, "銀行は9時から5時までです"),
    ];
    const { kept, dropped } = validateEvidence(questions, JP_SOURCE, {
      isMetadataOnly: false,
    });
    expect(kept).toHaveLength(4);
    expect(dropped).toHaveLength(0);
  });

  it("일본어: 자료에 없는 환각(時計·財布·眼鏡)은 막는다", () => {
    const questions = [
      q(1, "時計をひらがなで書きなさい"),
      q(2, "財布はどこですか"),
      q(3, "眼鏡を買いました"),
    ];
    const { kept, dropped } = validateEvidence(questions, JP_SOURCE, {
      isMetadataOnly: false,
    });
    expect(kept).toHaveLength(0);
    expect(dropped).toHaveLength(3);
  });

  it("영어: 자료에 있는 인용은 keep, 없는 환각은 drop (언어 무관)", () => {
    const questions = [
      q(1, "The new shopping mall opened last month"),
      q(2, "Photosynthesis requires chlorophyll to function"),
    ];
    const { kept, dropped } = validateEvidence(questions, EN_SOURCE, {
      isMetadataOnly: false,
    });
    expect(kept.map((k) => k.id)).toEqual([1]);
    expect(dropped.map((d) => d.questionId)).toEqual([2]);
  });

  it("너무 짧은 evidence(<10자)는 drop", () => {
    const { kept, dropped } = validateEvidence([q(1, "짧음")], EN_SOURCE, {
      isMetadataOnly: false,
    });
    expect(kept).toHaveLength(0);
    expect(dropped[0]?.reason).toContain("너무 짧음");
  });

  it("isMetadataOnly면 evidence 없어도 keep (본문 검증 불가)", () => {
    const { kept } = validateEvidence([q(1, "")], "", { isMetadataOnly: true });
    expect(kept).toHaveLength(1);
  });
});

describe("questionFingerprint — 같은 예문 중복 잡기 (피드백: 중복 너무 많음)", () => {
  const choices = [
    { key: "A", text: "から" },
    { key: "B", text: "ほん" },
    { key: "C", text: "は" },
    { key: "D", text: "に" },
  ];

  it("같은 일본어 예문을 도입부만 바꿔 반복하면 같은 fingerprint", () => {
    // 실제 중복 사례: 「かさを2___ください」를 도입부·인용부호·공백·번역만 바꿔 4번 반복.
    const a = questionFingerprint({
      stem: "다음 문장의 빈칸에 들어갈 가장 알맞은 조수사를 고르세요.\n「かさを2___ください。」",
      choices,
    });
    const b = questionFingerprint({
      stem: "다음 문장의 빈칸에 들어갈 가장 적절한 조수사를 고르세요:\n\nかさを2___ください。",
      choices,
    });
    const c = questionFingerprint({
      stem: "다음 문장의 빈칸에 들어갈 가장 적절한 조수사를 고르세요:\nかさを2 ___ ください。(우산을 2개 주세요.)",
      choices,
    });
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it("후리가나(한자 뒤 괄호 읽기) 유무가 달라도 같은 예문이면 같다", () => {
    const withFuri = questionFingerprint({
      stem: "빈칸을 고르세요: 「教室(きょうしつ)に学生(がくせい)が ___ います。」",
      choices,
    });
    const without = questionFingerprint({
      stem: "다음을 고르세요:\n教室に学生が___います。",
      choices,
    });
    expect(withFuri).toBe(without);
  });

  it("예문이 다르면 다른 fingerprint (false positive 방지)", () => {
    const x = questionFingerprint({ stem: "「トイレは ___ ですか。」", choices });
    const y = questionFingerprint({ stem: "「あの黒い服は ___ ですか。」", choices });
    expect(x).not.toBe(y);
  });

  it("일본어 없는(한국어·CS) 문제는 stem 전체로 폴백 — 오버머지 안 함", () => {
    const x = questionFingerprint({
      stem: "임계 구역의 조건이 아닌 것은?",
      choices: [{ key: "A", text: "상호 배제" }],
    });
    const y = questionFingerprint({
      stem: "교착 상태의 조건이 아닌 것은?",
      choices: [{ key: "A", text: "상호 배제" }],
    });
    expect(x).not.toBe(y);
  });
});
