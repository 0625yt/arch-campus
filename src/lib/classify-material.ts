import { generateText } from "ai";
import { z } from "zod";
import { MODELS, modelInstance } from "./claude";
import { parseModelJson } from "./schemas";

/**
 * 자료를 빠르게 분류 — 어떤 언어·과목·문제 형식이 어울리는지 힌트 추출.
 * Haiku 4.5로 100~300 tok 안에 끝나는 가벼운 호출. 비용 미미($0.0001 미만).
 *
 * 결과는 quiz·summarize 본 호출의 dynamicContext에 주입돼서
 * 모델이 자료 도메인에 맞는 문제·요약 포맷을 만들도록 가이드.
 */

/**
 * 도메인 enum — 본 schema에서는 string으로 받고, normalizeClassification에서 정규화.
 * Haiku가 "공학(전기·전자)" 같이 enum 밖 라벨을 자주 만들어 strict enum이 실패율 ↑.
 */
export const DOMAIN_VALUES = [
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
] as const;
export type DomainValue = (typeof DOMAIN_VALUES)[number];

/**
 * 한도들이 너무 빡빡해서 Haiku가 자주 초과 → silent로 분류 무효화 → 품질 저하.
 * answerLanguage 200자, contentNotes 1000자로 풀고, 길게 들어오면 normalize에서 자름.
 * domain은 string으로 받고 normalize에서 enum 매핑.
 */
const RawClassificationSchema = z.object({
  primaryLanguage: z.string().min(1).max(80),
  primarySubject: z.string().min(1).max(120),
  domain: z.string().min(1).max(60),
  questionStyleHints: z.array(z.string().min(2).max(300)).min(0).max(8),
  answerLanguage: z.string().min(1).max(200),
  contentNotes: z.string().min(0).max(1000),
});

export const ClassificationSchema = z.object({
  primaryLanguage: z.string().min(1).max(80),
  primarySubject: z.string().min(1).max(120),
  domain: z.enum(DOMAIN_VALUES),
  questionStyleHints: z.array(z.string().min(2).max(300)).min(1).max(8),
  answerLanguage: z.string().min(1).max(200),
  contentNotes: z.string().min(0).max(1000),
});

export type Classification = z.infer<typeof ClassificationSchema>;

/**
 * Haiku 출력 → Classification으로 정규화.
 *
 * - domain이 enum 밖이면 키워드 매칭으로 가장 가까운 enum 값, 매칭 실패면 "기타"
 * - 너무 긴 텍스트 필드는 잘라서 통과 (silent로 분류 무효화되는 것보단 잘린 분류가 나음)
 * - questionStyleHints 비면 기본 한 줄 채움
 */
function normalizeClassification(raw: z.infer<typeof RawClassificationSchema>): Classification {
  return {
    primaryLanguage: raw.primaryLanguage.slice(0, 80).trim() || "한국어",
    primarySubject: raw.primarySubject.slice(0, 120).trim() || "일반",
    domain: normalizeDomain(raw.domain),
    questionStyleHints:
      raw.questionStyleHints.length > 0
        ? raw.questionStyleHints.map((h) => h.slice(0, 300).trim()).filter(Boolean)
        : ["자료 핵심 개념 정의·구분 묻기"],
    answerLanguage: raw.answerLanguage.slice(0, 200).trim() || "한국어",
    contentNotes: raw.contentNotes.slice(0, 1000).trim(),
  };
}

function normalizeDomain(raw: string): DomainValue {
  const trimmed = raw.trim();
  // 정확 매칭
  if ((DOMAIN_VALUES as readonly string[]).includes(trimmed)) return trimmed as DomainValue;
  // 부분 매칭 (Haiku가 "공학(전자)" / "프로그래밍" 같이 변형 출력 자주)
  const lower = trimmed.toLowerCase();
  for (const value of DOMAIN_VALUES) {
    if (trimmed.includes(value) || value.includes(trimmed.split("·")[0])) return value;
  }
  if (lower.includes("language") || lower.includes("english") || lower.includes("어학")) return "어학";
  if (lower.includes("math") || lower.includes("수학") || lower.includes("통계")) return "수학·통계";
  if (
    lower.includes("cs") ||
    lower.includes("computer") ||
    lower.includes("programming") ||
    lower.includes("코드") ||
    lower.includes("프로그래밍")
  )
    return "프로그래밍·CS";
  if (lower.includes("engineer") || lower.includes("공학")) return "공학";
  if (lower.includes("science") || lower.includes("물리") || lower.includes("화학") || lower.includes("생물"))
    return "자연과학";
  if (lower.includes("history") || lower.includes("사회") || lower.includes("정치") || lower.includes("법학"))
    return "사회과학";
  if (lower.includes("philosophy") || lower.includes("문학") || lower.includes("인문")) return "인문학";
  if (lower.includes("business") || lower.includes("경영") || lower.includes("경제")) return "경영·경제";
  if (lower.includes("art") || lower.includes("음악") || lower.includes("예체")) return "예체능";
  if (lower.includes("syllabus") || lower.includes("강의계획") || lower.includes("안내")) return "강의·시험 안내";
  return "기타";
}

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

★ 난이도가 "쉬움"이고 자료가 외국어(영어 등)면 questionStyleHints에 반드시:
   "한국어 stem + 자료 원어 단어·정의 보기 (한국 대학생이 의미 파악하고 단어 고르는 수준)"
   를 넣고, answerLanguage도 "한국어 stem·해설 + 영어 단어·정의 보기" 식으로.

★ 난이도가 "보통"이고 외국어 자료면 questionStyleHints는 원어 stem + 원어 보기. answerLanguage는 "원어 위주, 한국어 보조 가능".

★ 난이도가 "어려움"이면 100% 원어.

JSON만 출력. 마크다운 펜스 사용 가능. 다른 설명 없음.

⚠ 자료 본문이 거의 없거나 메타뿐이면 추측 가능한 만큼만 채우고, 빈 칸은 "본문 부족으로 추정"이라 적기.`;

export async function classifyMaterial(opts: {
  title: string;
  type: string;
  fullText: string;
  pageCount?: number;
  /** 사용자가 고른 난이도. 있으면 분류기가 그에 맞는 questionStyleHints·answerLanguage를 잡아줌. */
  difficulty?: "쉬움" | "보통" | "어려움";
}): Promise<Classification | null> {
  // 본문 첫 6,000자만 보면 충분 (보통 도입+첫 단락에서 도메인 파악 가능)
  const sample = opts.fullText.slice(0, 6000);
  const userMsg = [
    `제목: ${opts.title}`,
    `사용자가 고른 종류: ${opts.type}`,
    opts.difficulty ? `사용자가 고른 난이도: ${opts.difficulty}` : null,
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
      model: modelInstance(MODELS.haiku),
      maxOutputTokens: 800,
      temperature: 0.1,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
    });
    // Raw schema(너그러움)로 먼저 파싱 → normalize로 enum·길이 보정 → 최종 strict 검증.
    // 종전엔 strict schema로 바로 파싱해 contentNotes 280자 초과·domain enum 외 값에서
    // silent fail → 모든 자료의 30~50%에서 분류 무효화 (로그에서 확인됨).
    const raw = parseModelJson(RawClassificationSchema, result.text);
    return normalizeClassification(raw);
  } catch (e) {
    console.warn(
      "classifyMaterial 실패 — 분류 없이 진행:",
      e instanceof Error ? e.message : String(e),
    );
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
