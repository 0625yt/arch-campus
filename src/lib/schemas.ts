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

export const QuizQuestion = z.object({
  id: z.number().int().positive(),
  difficulty: z.enum(["쉬움", "보통", "어려움"]),
  topic: z.string().min(1).max(60),
  stem: z.string().min(15).max(400),
  choices: z
    .array(
      z.object({
        key: z.enum(["A", "B", "C", "D"]),
        text: z.string().min(1).max(300),
      }),
    )
    .length(4),
  answer: z.enum(["A", "B", "C", "D"]),
  explanation: z.string().min(20).max(500),
  evidence: z.string().min(0).max(2000),
  evidencePage: z.number().int().nullable().optional(),
  trapAnalysis: z.string().optional(),
  hint: z.string().min(5).max(200).optional(),
});

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
