import { generateText } from "ai";
import { z } from "zod";
import { MODELS } from "./claude";
import { parseModelJson } from "./schemas";

/**
 * 자료를 빠르게 분류 — 어떤 언어·과목·문제 형식이 어울리는지 힌트 추출.
 * Haiku 4.5로 100~300 tok 안에 끝나는 가벼운 호출. 비용 미미($0.0001 미만).
 *
 * 결과는 quiz·summarize 본 호출의 dynamicContext에 주입돼서
 * 모델이 자료 도메인에 맞는 문제·요약 포맷을 만들도록 가이드.
 */

export const ClassificationSchema = z.object({
  primaryLanguage: z.string().min(1).max(40),
  primarySubject: z.string().min(1).max(60),
  domain: z.enum([
    "어학",
    "수학·통계",
    "프로그래밍·CS",
    "공학",
    "자연과학",
    "사회과학",
    "인문학",
    "경영·경제",
    "예체능",
    "강의·시험 안내",
    "기타",
  ]),
  questionStyleHints: z.array(z.string().min(2).max(120)).min(1).max(5),
  answerLanguage: z.string().min(1).max(40),
  contentNotes: z.string().min(5).max(280),
});

export type Classification = z.infer<typeof ClassificationSchema>;

const SYSTEM_PROMPT = `당신은 한국 대학생 학습 보조 도구의 자료 분류기예요.
주어진 자료 본문 일부를 읽고 어떤 학습 보조가 적절한지 판별해서 JSON 한 개로만 답해요.

판별 기준:
- primaryLanguage: 자료의 주요 언어 ("한국어", "영어", "중국어", "한국어+영어 혼합" 등)
- primarySubject: 자료가 다루는 구체적 주제 (예: "영어 어휘 — 건강·생활습관", "운영체제 동기화", "선형대수 행렬", "한국 근대사 — 갑오개혁")
- domain: 위 enum 중 하나
- questionStyleHints: 이 자료로 만들면 좋은 4지선다 문제의 형식·스타일 (1~5개, 각 짧은 한 줄)
  예시:
    - 어학 자료라면: "어휘 정의 묻기 (영어 단어 → 영어 정의)", "예문에서 빈칸 채우기", "문법 형태 비교 (e.g. should vs have to)"
    - 수학·증명 자료라면: "정리 적용 단계", "반례 찾기", "조건 빠뜨리면 어디서 막히는지"
    - 프로그래밍 자료라면: "코드 출력 예측", "버그 위치 찾기", "복잡도 비교"
    - 강의 안내라면: "마감일·제출물 정확히 묻기"
- answerLanguage: 정답·해설을 어느 언어로 쓰는 게 학생에게 가장 도움 되는지
  예시: 영어 어휘 자료 → "영어 본문 그대로 + 한국어 짧은 보조 설명", 한국어 강의노트 → "한국어"
- contentNotes: 출제자(다음 단계 모델)가 알아야 할 자료 특성 한 단락. 빠뜨리면 안 되는 핵심 키워드·범위·주의점.

JSON만 출력. 마크다운 펜스 사용 가능. 다른 설명 없음.

⚠ 자료 본문이 거의 없거나 메타뿐이면 추측 가능한 만큼만 채우고, 빈 칸은 "본문 부족으로 추정"이라 적기.`;

export async function classifyMaterial(opts: {
  title: string;
  type: string;
  fullText: string;
  pageCount?: number;
}): Promise<Classification | null> {
  // 본문 첫 6,000자만 보면 충분 (보통 도입+첫 단락에서 도메인 파악 가능)
  const sample = opts.fullText.slice(0, 6000);
  const userMsg = [
    `제목: ${opts.title}`,
    `사용자가 고른 종류: ${opts.type}`,
    opts.pageCount ? `분량: ${opts.pageCount}쪽` : null,
    "",
    "자료 본문 일부:",
    "<material>",
    sample || "(본문 추출 실패)",
    "</material>",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await generateText({
      model: MODELS.haiku,
      maxOutputTokens: 800,
      temperature: 0.1,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
    });
    return parseModelJson(ClassificationSchema, result.text);
  } catch (e) {
    console.warn("classifyMaterial 실패 — 분류 없이 진행:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

export function classificationToContext(c: Classification): string {
  return [
    `자료 분류 (Haiku 1차 판별):`,
    `- 주요 언어: ${c.primaryLanguage}`,
    `- 주제: ${c.primarySubject}`,
    `- 도메인: ${c.domain}`,
    `- 정답·해설 언어: ${c.answerLanguage}`,
    `- 내용 메모: ${c.contentNotes}`,
    `- 추천 문제 스타일:`,
    ...c.questionStyleHints.map((h) => `  • ${h}`),
    "",
    "위 분류에 맞춰 문제·요약을 설계해요. 어학 자료면 어학 문제 형식, 수학이면 수학 형식. 자료의 언어·도메인을 무시한 일반론 X.",
  ].join("\n");
}
