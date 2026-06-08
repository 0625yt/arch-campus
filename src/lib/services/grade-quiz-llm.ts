import "server-only";
import { generateText } from "ai";
import { getModelIdFor, modelInstance } from "@/lib/claude";
import type { GradedQuiz, GradedResult } from "@/lib/services/grade-quiz";

/**
 * 단답형 LLM 보조 채점 — 정확 매칭은 통과 못 했지만 의미는 같은 경우 잡아준다.
 *
 * 예시:
 *   질문: "데이터를 일관된 형식으로 만드는 과정은?"
 *   정답: "정규화"
 *   학생 답: "normalization"  → 영문/한글 표기 차이로 정확 매칭 fail
 *   학생 답: "정규화 과정"      → 부분 매칭은 되지만 OS 약자 같은 케이스는 못 잡음
 *   학생 답: "데이터를 표준 형식으로 바꾸는 것" → 표현 다르지만 의미 동일
 *
 * 정책:
 *   - short-answer + correct=false 만 대상 (essay는 키워드 채점 신뢰, 객관식은 키 비교라 명백)
 *   - 미응답(submitted=null)은 skip — 답 안 낸 건 promote 대상 X
 *   - Haiku 한 번에 batch (여러 문제 동시에 검토) — 비용 통제
 *   - 모델 throw·timeout 시 기존 결과 그대로 (실패 안전)
 *   - false → true로 promote만 함. 정답을 오답으로 바꾸지 X.
 */

interface PromotedResult extends GradedResult {
  /** LLM이 의미 등가로 판단했으면 true. UI에서 "표현은 다르지만 정답으로 인정" 안내 가능. */
  llmPromoted?: boolean;
}

export interface LlmAssistedGraded {
  score: number;
  total: number;
  results: PromotedResult[];
  /** LLM 호출이 일어났는지 (디버깅·비용 추적용) */
  llmCalled: boolean;
  /** promote된 문제 수 */
  promotedCount: number;
}

interface JudgeItem {
  questionId: number;
  stem: string;
  answer: string;
  submitted: string;
}

interface JudgeVerdict {
  questionId: number;
  equivalent: boolean;
  reason?: string;
}

export async function gradeWithLlmAssist(
  graded: GradedQuiz,
  questions: Array<{ id: number; kind?: string; stem: string }>,
): Promise<LlmAssistedGraded> {
  // 단답형 + 오답 + 응답 있음만 후보
  const candidates: JudgeItem[] = [];
  for (const r of graded.results) {
    if (r.kind !== "short-answer") continue;
    if (r.correct) continue;
    // 복수 필수답("두 개 쓰세요")은 부분 채점이 결정적 — LLM이 부분 정답을
    // "의미 등가"로 잘못 promote하지 않게 제외한다.
    if (r.partial) continue;
    if (r.submitted === null || r.submitted.trim().length === 0) continue;
    const q = questions.find((qq) => qq.id === r.questionId);
    if (!q) continue;
    candidates.push({
      questionId: r.questionId,
      stem: q.stem,
      answer: r.answer,
      submitted: r.submitted,
    });
  }

  if (candidates.length === 0) {
    return {
      score: graded.score,
      total: graded.total,
      results: graded.results,
      llmCalled: false,
      promotedCount: 0,
    };
  }

  let verdicts: JudgeVerdict[];
  try {
    verdicts = await judgeWithHaiku(candidates);
  } catch (e) {
    // 모델 실패는 silent — 기존 채점 결과 그대로. 사용자에게 영향 없음.
    console.warn("LLM 보조 채점 실패:", e instanceof Error ? e.message : String(e));
    return {
      score: graded.score,
      total: graded.total,
      results: graded.results,
      llmCalled: true,
      promotedCount: 0,
    };
  }

  let promotedCount = 0;
  const promoted: PromotedResult[] = graded.results.map((r) => {
    const verdict = verdicts.find((v) => v.questionId === r.questionId);
    if (!verdict || !verdict.equivalent || r.correct) return r;
    promotedCount++;
    return {
      ...r,
      correct: true,
      llmPromoted: true,
      // 정답으로 인정됐으니 "왜 틀렸는지"는 떼어낸다 (모순 방지).
      whyWrong: undefined,
      gradingNote: verdict.reason
        ? `표현은 다르지만 의미가 같아 정답으로 인정: ${verdict.reason}`
        : "표현은 다르지만 의미가 같아 정답으로 인정",
    };
  });

  return {
    score: graded.score + promotedCount,
    total: graded.total,
    results: promoted,
    llmCalled: true,
    promotedCount,
  };
}

async function judgeWithHaiku(items: JudgeItem[]): Promise<JudgeVerdict[]> {
  const itemsBlock = items
    .map(
      (it, idx) =>
        `--- 문제 ${idx + 1} (questionId=${it.questionId}) ---
질문: ${it.stem}
정답: ${it.answer}
학생 답: ${it.submitted}`,
    )
    .join("\n\n");

  const system = `당신은 한국 대학생 단답형 문제 채점 보조다. 학생의 답이 정답과 표현이 달라도 **의미가 같으면** 정답으로 인정한다.

판단 기준:
1. **표기 차이만 다른 경우** → 정답: "정규화" vs "normalization", "OS" vs "운영체제", "RDB" vs "관계형 데이터베이스"
2. **동의어/유의어** → 정답: "임계 구역" vs "critical section" vs "임계 영역"
3. **상세도 차이가 있어도 핵심이 맞으면** → 정답: 정답이 "정규화"인데 학생이 "데이터를 표준 형식으로 만드는 정규화 작업"이라고 적은 경우
4. **완전히 다른 개념** → 오답: 정답이 "정규화"인데 학생이 "트랜잭션"이라고 적은 경우
5. **방향만 비슷한 추측** → 오답: 정답이 "정규화"인데 학생이 "데이터를 정리하는 것"처럼 모호한 경우 (개념 특정 X)
6. **부분만 맞고 핵심 빠짐** → 오답: 정답이 "1차 정규형"인데 학생이 "정규형"만 적은 경우

★ 어학(특히 일본어) — 표기만 다르고 **읽는 음/뜻이 같으면 정답**:
7. **한자 ↔ 가나** → 정답: "学校" vs "がっこう" vs "ガッコウ" (같은 단어, 표기만 다름). "会社" vs "かいしゃ". "消しゴム" vs "けしゴム" vs "けしごむ".
8. **히라가나 ↔ 가타카나** → 정답: "ごむ" vs "ゴム" (음 같음). 단 문제가 "가타카나로만 쓰세요"처럼 **표기 종류 자체를 평가**하면 → 그 표기 아니면 오답.
9. **送り仮名·장음 사소한 차이** → 핵심 단어가 맞으면 정답. 단 완전히 다른 단어면 오답.
   주의: 문제 stem이 "히라가나로 쓰세요"라고 했어도, 학생이 한자나 가타카나로 정확히 같은 단어를 썼으면 **음·뜻이 맞으므로 정답**(표기 강제가 채점 포인트가 아닌 한).

응답 형식 (JSON 배열만, 다른 텍스트 X):
[
  { "questionId": 1, "equivalent": true, "reason": "표기 차이 — normalization은 정규화의 영문" },
  { "questionId": 2, "equivalent": false, "reason": "개념이 다름" }
]

reason은 80자 이내. equivalent가 true일 때만 의미 있음.`;

  // ★ 채점 보조 모델은 라우팅을 거친다 — LLM_VENDOR=google면 Gemini Flash, 평소엔 Haiku.
  // 예전엔 MODELS.haiku를 직접 박아 전역 Gemini 전환을 우회했다 → Anthropic 크레딧
  // 소진 시 채점 보조가 silent fail로 죽어 일본어 표기 차이 등을 구제 못 했다.
  const result = await generateText({
    model: modelInstance(getModelIdFor("chat-free")),
    system,
    prompt: `다음 ${items.length}개 단답형 문제를 채점해주세요.\n\n${itemsBlock}\n\nJSON 배열만 응답하세요.`,
    temperature: 0.1,
    maxOutputTokens: 1024,
  });

  const text = result.text.trim();
  const jsonStart = text.indexOf("[");
  const jsonEnd = text.lastIndexOf("]");
  if (jsonStart === -1 || jsonEnd <= jsonStart) {
    throw new Error("LLM 응답에 JSON 배열 없음");
  }
  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  if (!Array.isArray(parsed)) throw new Error("응답이 배열 아님");

  return parsed
    .filter(
      (v): v is JudgeVerdict =>
        typeof v === "object" &&
        v !== null &&
        typeof v.questionId === "number" &&
        typeof v.equivalent === "boolean",
    )
    .map((v) => ({
      questionId: v.questionId,
      equivalent: v.equivalent,
      reason: typeof v.reason === "string" ? v.reason.slice(0, 120) : undefined,
    }));
}
