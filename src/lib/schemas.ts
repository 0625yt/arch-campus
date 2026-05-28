import { z } from "zod";

/**
 * 요약 블록 — 모든 type에서 sourcePage·sourceQuote 선택 가능.
 * 학생이 "이거 자료 몇 쪽에서 나왔지?" 확인할 수 있어야 신뢰됨 (skills-v2 §스킬 3).
 */
const SummaryBlockBase = {
  /** 자료 본문 페이지 번호 — 추출 가능하면 박기 */
  sourcePage: z.number().int().min(1).max(2000).nullable().optional(),
  /** 자료 본문 substring 인용 (검증은 서비스 레이어가 권장) */
  sourceQuote: z.string().max(400).nullable().optional(),
};

export const SummarizeOutput = z.object({
  leadSentence: z.string().min(10).max(200),
  blocks: z
    .array(
      z.discriminatedUnion("type", [
        z.object({
          type: z.literal("h2"),
          content: z.string().min(2).max(80),
          ...SummaryBlockBase,
        }),
        z.object({
          type: z.literal("para"),
          content: z.string().min(20).max(800),
          ...SummaryBlockBase,
        }),
        z.object({
          type: z.literal("bullets"),
          items: z.array(z.string().min(2).max(300)).min(1).max(20),
          ...SummaryBlockBase,
        }),
        z.object({
          type: z.literal("callout"),
          tone: z.enum(["info", "warn", "tip"]),
          content: z.string().min(10).max(600),
          ...SummaryBlockBase,
        }),
      ]),
    )
    // 최소 5 — 너무 짧은 요약이 안 나오게. 자료 짧으면 reviewSpots로 보충.
    .min(5)
    .max(40),
  keywords: z.array(z.string().min(1).max(60)).min(3).max(50),
  reviewSpots: z
    .array(
      z.object({
        title: z.string().min(2).max(80),
        why: z.string().min(10).max(400),
      }),
    )
    .min(1)
    .max(8),
  watermark: z.string().min(10),
});
export type SummarizeOutputT = z.infer<typeof SummarizeOutput>;

/**
 * 퀴즈 한 문제.
 *
 * kind는 옵션 — 미지정·미저장은 "multiple-choice"로 해석 (기존 데이터 호환).
 * 출제 시 generate-form에서 multi-select로 골라온 종류 중 하나가 박힘.
 *
 * 종류별 필드 사용:
 *   - multiple-choice: choices 4개 + answer ("A"~"D")
 *   - short-answer:    choices null + answer (정답 텍스트)
 *   - essay:           choices null + answer (모범답안 핵심 키워드/방향)
 *
 * 풀이 UI는 이번 sprint에선 객관식만 동작. short-answer/essay는 placeholder.
 */
export const QuizQuestion = z.object({
  id: z.number().int().positive(),
  kind: z.enum(["multiple-choice", "short-answer", "essay"]).default("multiple-choice"),
  difficulty: z.enum(["쉬움", "보통", "어려움"]),
  topic: z.string().min(1).max(60),
  stem: z.string().min(15).max(400),
  // 객관식이 아니면 null. zod default가 풀어주므로 호출자는 null 또는 undefined 둘 다 OK.
  choices: z
    .array(
      z.object({
        key: z.enum(["A", "B", "C", "D"]),
        text: z.string().min(1).max(300),
      }),
    )
    .length(4)
    .nullable()
    .optional(),
  // 객관식이면 "A"~"D" 한 글자. 단답/서술이면 자유 텍스트.
  answer: z.string().min(1).max(2000),
  explanation: z.string().min(20).max(500),
  evidence: z.string().min(0).max(2000),
  evidencePage: z.number().int().nullable().optional(),
  trapAnalysis: z.string().optional(),
  hint: z.string().min(5).max(200).optional(),
});
export type QuizQuestionT = z.infer<typeof QuizQuestion>;

export const QuizOutput = z.union([
  z.object({
    questions: z.array(QuizQuestion).min(1).max(10),
    rejected: z.literal(false).optional(),
    watermark: z.string().min(10),
  }),
  z.object({
    questions: z.array(QuizQuestion).length(0),
    rejected: z.literal(true),
    reason: z.string().min(10),
    watermark: z.string().min(10),
  }),
]);
export type QuizOutputT = z.infer<typeof QuizOutput>;

/**
 * 기출문제 추출 — PDF 본문에 이미 존재하는 문제·정답·해설을 그대로 가져온다.
 *
 * 핵심 가드 (CLAUDE.md §4 치팅 라인):
 *   - 새 문제 생성 X. 본문에 적힌 그대로만.
 *   - 정답이 본문에 없거나 불분명하면 answer=null + needsManualCheck=true.
 *   - 추측 X. 모범답안 만들기 X.
 *   - 풀이 모드에서 사용자가 답을 입력하기 전까지 answer/explanation 노출 금지 (UI 게이트).
 *
 * 스키마는 객관식·단답형·서술형 3종을 한 배열에 섞어 담음.
 *  - kind=multiple-choice: choices 4개 필수, answer는 키("A"~"D") 또는 null
 *  - kind=short-answer: choices 없음, answer는 정답 단어/구
 *  - kind=essay: choices 없음, answer는 모범답안의 핵심 키워드/방향
 */
export const ExamExtractedQuestion = z.object({
  id: z.number().int().positive(),
  kind: z.enum(["multiple-choice", "short-answer", "essay"]),
  stem: z.string().min(5).max(2000),
  choices: z
    .array(
      z.object({
        key: z.enum(["A", "B", "C", "D"]),
        text: z.string().min(1).max(500),
      }),
    )
    .length(4)
    .nullable()
    .optional(),
  /** 정답. multiple-choice면 "A"~"D" 한 글자. short-answer/essay면 정답 텍스트. null이면 본문에 정답 없음. */
  answer: z.string().min(1).max(2000).nullable(),
  /** 본문에 있는 해설. 없으면 null. AI가 새로 작성 금지. */
  explanation: z.string().min(5).max(2000).nullable(),
  /** PDF 페이지 번호 (vision 추출 시 박을 수 있으면). */
  sourcePageNum: z.number().int().min(1).max(2000).nullable(),
  /** 본문 substring 인용 — full_text 검증용. */
  sourceQuote: z.string().min(2).max(1000),
  /**
   * 정답이 불명확하거나 형식 변형이 필요한 경우 true.
   * 학생에게 "AI가 자신 없음, 본인이 확인" 시그널.
   */
  needsManualCheck: z.boolean().default(false),
});
export type ExamExtractedQuestionT = z.infer<typeof ExamExtractedQuestion>;

export const ExamExtractOutput = z.union([
  z.object({
    questions: z.array(ExamExtractedQuestion).min(1).max(50),
    rejected: z.literal(false).optional(),
    /** 추출 메타 — 자료에서 발견된 총 문제 수가 50개 초과면 truncated 표시 */
    truncated: z.boolean().default(false),
    watermark: z.string().min(10),
  }),
  z.object({
    questions: z.array(ExamExtractedQuestion).length(0),
    rejected: z.literal(true),
    reason: z.string().min(10),
    watermark: z.string().min(10),
  }),
]);
export type ExamExtractOutputT = z.infer<typeof ExamExtractOutput>;

export const SyllabusEvent = z.object({
  kind: z.enum(["exam", "assignment", "presentation", "class", "etc"]),
  title: z.string().min(1).max(120),
  notes: z.string().max(500).nullable().optional(),
  // ISO 8601 (예: "2026-06-15" 또는 "2026-06-15T13:00:00+09:00")
  startsAt: z.string().min(8).max(40),
  endsAt: z.string().min(8).max(40).nullable().optional(),
  allDay: z.boolean().default(true),
  weightPercent: z.number().min(0).max(100).nullable().optional(),
  // 강의계획서에서 명시도 — 0~1
  confidence: z.number().min(0).max(1).default(0.7),
});
export type SyllabusEventT = z.infer<typeof SyllabusEvent>;

export const SyllabusOutput = z.object({
  course: z.object({
    name: z.string().min(1).max(80),
    professor: z.string().max(40).nullable().optional(),
    location: z.string().max(80).nullable().optional(),
    schedule: z.array(z.string().min(2).max(60)).max(7).optional(),
    termStart: z.string().min(8).max(40).nullable().optional(),
    termEnd: z.string().min(8).max(40).nullable().optional(),
  }),
  events: z.array(SyllabusEvent).min(0).max(60),
  watermark: z.string().min(10),
});
export type SyllabusOutputT = z.infer<typeof SyllabusOutput>;

/**
 * 시간표 — 한 학기 듣는 모든 강의를 한 표에 모아둔 PDF·이미지.
 * syllabus와 다름 — 시험·과제 절대 날짜는 거의 없음, 대신 요일·교시·강의실·교수가 핵심.
 */
export const TimetableSlot = z.object({
  // "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"
  weekday: z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]),
  // 24시간 "HH:MM"
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});
export type TimetableSlotT = z.infer<typeof TimetableSlot>;

export const TimetableCourse = z.object({
  name: z.string().min(1).max(80),
  professor: z.string().max(40).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  slots: z.array(TimetableSlot).min(0).max(10),
  credits: z.number().min(0).max(10).nullable().optional(),
  // 시간표 추출 신뢰도 — 0~1. 격자 인식·시간 정규화·과목명 매칭이 얼마나
  // 확실했는지의 종합 점수. 모델이 안 채우면 0.7 (보통). UI HITL 단계에서
  // 0.7 미만이면 빨간 배지로 사용자 검수를 강제. (NEXT-STEPS.md §3)
  confidence: z.number().min(0).max(1).default(0.7),
});
export type TimetableCourseT = z.infer<typeof TimetableCourse>;

export const TimetableOutput = z.object({
  termYear: z.number().int().min(2020).max(2099).nullable().optional(),
  termLabel: z.string().max(40).nullable().optional(), // "2026 1학기" 등
  courses: z.array(TimetableCourse).min(0).max(20),
  watermark: z.string().min(10),
});
export type TimetableOutputT = z.infer<typeof TimetableOutput>;

export const PresentationOutput = z.object({
  outline: z
    .array(
      z.object({
        slideNo: z.number().int().positive(),
        title: z.string().min(2).max(40),
        purpose: z.string().min(5).max(80),
        structure: z.array(z.string().min(5).max(160)).min(3).max(5),
        speakerNote: z.string().min(20).max(120),
        estimatedSec: z.number().int().min(20).max(600),
      }),
    )
    .min(4)
    .max(12),
  qaBank: z
    .array(
      z.object({
        question: z.string().min(10).max(200),
        intent: z.string().min(5).max(80),
        answerHint: z.string().min(20).max(300),
      }),
    )
    .length(5),
  deliveryTips: z.array(z.string().min(10).max(160)).min(2).max(8),
  watermark: z.string().min(10),
});
export type PresentationOutputT = z.infer<typeof PresentationOutput>;

/**
 * 시험 벼락치기 — 남은 시간을 단원·시간 블록으로 쪼개주는 위저드.
 *
 * 사활: 잘못된 단원 추천 → 시험 망 → 환불 요구. 신뢰도 즉시 붕괴.
 * 따라서 topic 추천은 반드시 사용자가 업로드한 자료에 근거해야 한다.
 */
export const ExamCramTopic = z.object({
  /** 단원 이름 — 자료의 h2·섹션 그대로 인용 */
  name: z.string().min(2).max(80),
  /** 이 단원이 시험에 차지할 비중 추정 0~1 — 자료 분량·강조 표시 기준 */
  weight: z.number().min(0).max(1),
  /** 자료 ID 배열 — 어느 자료에서 나온 단원인지 추적 */
  basedOnMaterialIds: z.array(z.string().min(1)).min(1).max(10),
  /** 자료 본문에서 substring 인용 — 왜 이 단원을 골랐는지 근거 */
  evidence: z.string().min(10).max(500),
  /** 학생이 약점이라 표기했거나 출제 빈도 높은 곳이면 표시 */
  priority: z.enum(["high", "mid", "low"]),
  /** 이 단원에서 꼭 봐야 할 개념 3~6개 */
  mustReview: z.array(z.string().min(2).max(80)).min(3).max(6),
  /** 자주 헷갈리는 짝 (예: "Peterson vs Dekker") — 있으면 추가 */
  commonMistakes: z.array(z.string().min(5).max(160)).max(4).optional(),
});
export type ExamCramTopicT = z.infer<typeof ExamCramTopic>;

export const ExamCramTimeBlock = z.object({
  /** 블록 순서 (시작 시점부터 1) */
  order: z.number().int().positive(),
  /** 이 블록에 쓸 시간 분 */
  durationMin: z.number().int().min(5).max(180),
  /** 다룰 단원 이름 (topics[].name 중 하나) */
  topicName: z.string().min(2).max(80),
  /** 이 블록의 학습 모드 */
  mode: z.enum(["read", "summarize", "quiz", "review-mistakes", "rest"]),
  /** 이 블록 끝낸 후 학생이 스스로 답할 자기 점검 질문 1줄 */
  checkpoint: z.string().min(10).max(160),
});
export type ExamCramTimeBlockT = z.infer<typeof ExamCramTimeBlock>;

export const ExamCramOutput = z.union([
  z.object({
    /** 전체 학습 계획 한 줄 — "3시간 안에 1·3·5장 우선 + 풀이 2회독" 같이 */
    headline: z.string().min(10).max(200),
    /** 단원 우선순위 — 비중 높은 순 */
    topics: z.array(ExamCramTopic).min(1).max(8),
    /** 시간 블록 — 합계가 input.remainingMin과 ±10% 일치 */
    schedule: z.array(ExamCramTimeBlock).min(2).max(20),
    /** 시험 직전·시험 중 행동 팁 (수면·실수 줄이기 등) */
    finalTips: z.array(z.string().min(10).max(160)).min(2).max(6),
    rejected: z.literal(false).optional(),
    watermark: z.string().min(10),
  }),
  z.object({
    rejected: z.literal(true),
    reason: z.string().min(10).max(400),
    watermark: z.string().min(10),
  }),
]);
export type ExamCramOutputT = z.infer<typeof ExamCramOutput>;

/**
 * 과제 요구사항 체크리스트 — 교수 공지를 분석해 "감점 슈팅 체크리스트"를 만든다.
 *
 * 사활: 우리는 리포트 본문을 대신 써주지 않는다 (CLAUDE.md §4).
 * 그래서 출력은 "확인할 항목" + "본인이 답할 질문"만 — 본문 초안 X.
 *
 * 검증:
 *  - requirements[].quote는 노출된 공지 텍스트의 substring (사후 검증)
 *  - selfQuestions가 학생이 직접 답해야 할 형태 ("내 답:" 포함 권장)
 */
export const ChecklistRequirement = z.object({
  /** 공지에서 뽑은 요구사항 한 줄 — 학생 언어로 정리 */
  title: z.string().min(2).max(120),
  /** 어떤 카테고리인가 — UI 그루핑·우선순위 */
  category: z.enum(["분량", "형식", "내용", "참고문헌", "마감", "제출방식", "평가기준", "기타"]),
  /** 채점 영향 — high면 "감점 직결" 톤으로 */
  weight: z.enum(["high", "mid", "low"]),
  /** 공지에서의 substring 인용 (사후 검증으로 일치 확인) */
  quote: z.string().min(2).max(400),
  /** 왜 중요한가 한 줄 + 어떻게 확인할지 */
  why: z.string().min(10).max(300),
});
export type ChecklistRequirementT = z.infer<typeof ChecklistRequirement>;

export const ChecklistOutput = z.union([
  z.object({
    /** 과제 한 줄 요약 — "OO 분석 리포트, 4쪽, 5/20 마감" */
    headline: z.string().min(10).max(200),
    /** 가장 먼저 챙겨야 할 3개 — high weight 우선 */
    topRisks: z.array(z.string().min(5).max(160)).min(2).max(5),
    /** 요구사항 전체 — high·mid 섞임. UI에서 weight로 그룹 */
    requirements: z.array(ChecklistRequirement).min(3).max(20),
    /** 학생이 글 쓰기 전에 스스로 답해야 할 질문들 — 본문 초안 X, 질문만. */
    selfQuestions: z.array(z.string().min(10).max(200)).min(3).max(8),
    /** 명시 안 된 항목·교수에게 물어봐야 할 항목 (있으면) */
    openQuestions: z.array(z.string().min(10).max(200)).max(5).optional(),
    rejected: z.literal(false).optional(),
    watermark: z.string().min(10),
  }),
  z.object({
    rejected: z.literal(true),
    reason: z.string().min(10).max(400),
    watermark: z.string().min(10),
  }),
]);
export type ChecklistOutputT = z.infer<typeof ChecklistOutput>;

/**
 * 리포트 구조 설계 — 학생이 리포트 본문 쓰기 전에 목차·섹션별 가이드를 잡는다.
 *
 * 사활: CLAUDE.md §4 — 본문 작성 X. 우리는 "어떤 흐름으로 쓸지" 가이드만.
 *
 * 검증:
 *  - sections[].keyQuestions가 "본인이 답할 질문" 형태 (서술 문장 X)
 *  - sections[].purpose가 모두 다름 (중복 X)
 *  - 총 분량 합이 사용자 입력 targetPages와 ±25% 일치
 */
export const ReportSection = z.object({
  /** 섹션 번호 — 1부터 N까지 연속 */
  order: z.number().int().positive(),
  /** 섹션 제목 — "서론", "분석 1: ..." 같이 */
  title: z.string().min(2).max(80),
  /** 이 섹션의 목적 한 문장 — "독자가 무엇을 얻는지" */
  purpose: z.string().min(10).max(160),
  /** 학생이 글 쓰기 전 스스로 답할 핵심 질문 3~5개. 답은 학생이 쓴다. */
  keyQuestions: z.array(z.string().min(10).max(200)).min(3).max(5),
  /** 권장 분량 (단어 수 또는 쪽 비중) — 1.0이 한 페이지 기준 */
  estimatedPages: z.number().min(0.25).max(10),
  /** 자료 인용이 필요하면 어디서 — substring 매칭 검증 */
  citationHint: z.string().min(0).max(300).optional(),
});
export type ReportSectionT = z.infer<typeof ReportSection>;

export const ReportStructureOutput = z.union([
  z.object({
    /** 한 줄 요약 — "OO 주제 4쪽 분석 리포트, 4개 섹션" */
    headline: z.string().min(10).max(200),
    /** 리포트 전체 톤·접근 — "이 글은 ~ 흐름으로 진행" */
    thesis: z.string().min(20).max(400),
    /** 섹션 4~7개. 권장 페이지 합이 targetPages ±25% */
    sections: z.array(ReportSection).min(3).max(8),
    /** 본문 쓰기 전 학생이 스스로 체크할 항목 */
    preWriteChecks: z.array(z.string().min(10).max(200)).min(3).max(6),
    /** 자주 빠지는 함정 — "이건 빼먹기 쉬워요" */
    commonPitfalls: z.array(z.string().min(10).max(200)).min(2).max(5),
    rejected: z.literal(false).optional(),
    watermark: z.string().min(10),
  }),
  z.object({
    rejected: z.literal(true),
    reason: z.string().min(10).max(400),
    watermark: z.string().min(10),
  }),
]);
export type ReportStructureOutputT = z.infer<typeof ReportStructureOutput>;

export const BANNED_WORDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/효과적인/g, "좋은"],
  [/체계적인/g, "차근차근"],
  [/다양한/g, "여러"],
  [/중요합니다/g, "핵심이에요"],
  [/도움이 됩니다/g, "도와줘요"],
  [/활용하세요/g, "써보세요"],
  [/살펴보겠습니다/g, "한 번 볼게요"],
  [/알아보겠습니다/g, "짚어볼게요"],
  [/생각해드리겠습니다/g, ""],
  [/핵심적인/g, "가장 중요한"],
  [/본질적인/g, "근본"],
  [/전반적인/g, "전체적으로"],
  [/포괄적인/g, "두루두루"],
  [/이를 통해/g, "그래서"],
  [/결론적으로/g, "정리하면"],
  [/최적화된/g, "잘 맞춘"],
  [/진행해보겠습니다/g, "시작할게요"],
];

export interface BannedWordHit {
  word: string;
  count: number;
}

export function findBannedWords(text: string): BannedWordHit[] {
  const hits: BannedWordHit[] = [];
  for (const [pattern] of BANNED_WORDS) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      hits.push({ word: matches[0], count: matches.length });
    }
  }
  return hits;
}

export function replaceBannedWords(text: string): string {
  let out = text;
  for (const [pattern, replacement] of BANNED_WORDS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export const WATERMARK = "이 자료는 학습 보조용이며" as const;

export function hasWatermark(output: { watermark?: string }): boolean {
  return typeof output.watermark === "string" && output.watermark.includes(WATERMARK);
}

export function evidenceMatches(materialFullText: string, evidence: string): boolean {
  if (!evidence || evidence.length < 10) return false;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  return norm(materialFullText).includes(norm(evidence));
}

export function parseModelJson<T>(schema: z.ZodType<T>, raw: string): T {
  const body = extractJsonBody(raw);
  const parsed = JSON.parse(body);
  return schema.parse(parsed);
}

function extractJsonBody(raw: string): string {
  const trimmed = raw.trim();
  // case 1: 정상 ```json ... ``` 펜스
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  // case 2: 펜스 시작만 있고 닫힘 누락 (max_tokens 잘림 등) → ```json 이후부터
  const fencedOpen = trimmed.match(/```(?:json)?\s*([\s\S]*)$/i);
  if (fencedOpen) return fencedOpen[1].trim();
  // case 3: 펜스 없이 평문 — 첫 { 부터 마지막 } 까지
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}
