/**
 * 퀴즈 출력 자동 평가 메트릭 — Sonnet vs Gemini Flash 블라인드 A/B에서
 * "사람이 보기 전에 자동으로 통과/실패"를 갈라줄 수치들.
 *
 * 호출자가 결정할 일은 두 가지:
 *   1) 어떤 모델로 어떤 자료를 N번 호출했는지 (scripts/eval-quiz-ab.mts가 담당)
 *   2) 메트릭 결과를 어떤 기준으로 "전환 가능"이라 판단할지 (NEXT-STEPS.md §2-2)
 *
 * 이 모듈은 quiz 결과 JSON 한 묶음을 받아 측정만 한다. 외부 의존성 없음.
 *
 * 핵심 메트릭:
 *   - evidence substring 매칭률: quiz.md §1 "evidence는 자료 본문 substring" 원칙 검증.
 *     자료 본문에 evidence 문자열이 그대로 들어있어야 통과. Sonnet은 보통 100%,
 *     Flash가 흔들리면 hallucination 신호.
 *   - 보기 무결성: 객관식이면 정확히 4개 + key A~D 유일 + text 중복 없음 + answer가 A~D 중 하나.
 *   - stem 한국어 비율: 한국어 자료에서 stem이 영어로 빠지면 변별력 떨어짐.
 *   - JSON 스키마 위반 수: rejected가 아닌데 questions 비어있다거나 evidence 누락 등.
 */

export interface QuizMetricInput {
  /** 자료 본문 — evidence substring 검증에 사용 */
  materialText: string;
  /** 모델이 반환한 퀴즈. rejected 케이스도 그대로 넣어 통계에 잡히게. */
  quiz: {
    rejected?: boolean;
    questions: Array<{
      id?: number;
      kind?: string;
      stem: string;
      choices?: Array<{ key: string; text: string }> | null;
      answer: string;
      explanation: string;
      evidence: string;
      evidencePage?: number | null;
    }>;
    watermark?: string;
  };
}

export interface QuizMetricResult {
  /** 평가 대상 문제 수 (rejected면 0) */
  total: number;
  rejected: boolean;
  /** evidence가 materialText에 substring으로 매칭된 문제 비율 0~1 */
  evidenceMatchRate: number;
  /** 객관식 보기 무결성 통과 비율 (객관식 아닌 건 자동 통과) */
  choicesIntegrityRate: number;
  /** stem 안 한국어(ㄱ-ㅎ가-힣) 글자 비율의 평균 */
  meanKoreanRatioInStem: number;
  /** 스키마/구조 위반 수 — evidence 빈 문자열·answer 형식 오류 등 */
  schemaIssues: number;
  /** 상세 메시지 (디버깅·로그용) */
  notes: string[];
}

/** 한국어(한글 음절·자모) 비율. 공백·구두점은 분모에서 빼서 "의미 있는 글자" 기준으로. */
export function koreanRatio(text: string): number {
  const meaningful = text.replace(/[\s\p{P}\p{S}]/gu, "");
  if (meaningful.length === 0) return 0;
  const korean = meaningful.match(/[ㄱ-ㆎ가-힣]/g);
  return (korean?.length ?? 0) / meaningful.length;
}

/**
 * evidence가 자료 본문에 들어있는지 — 공백·문장부호 정규화 후 substring 검사.
 * LLM이 문장을 약간 잘라 인용하면 100% 글자 일치는 까다로워서
 * - 양쪽 따옴표·말줄임 제거
 * - 연속 공백 한 칸으로
 * 만 적용. 그 이상 fuzzy하게 가면 false-positive 위험.
 */
export function evidenceInMaterial(evidence: string, material: string): boolean {
  const norm = (s: string) =>
    s
      .replace(/[“”„‟"'‘’`]/g, "")
      .replace(/[…]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const e = norm(evidence);
  const m = norm(material);
  if (e.length === 0) return false;
  // 너무 짧으면 우연 매칭 — 8자 미만이면 실패로 (변별력 없음)
  if (e.length < 8) return false;
  return m.includes(e);
}

/** 객관식 보기 무결성 — 4개·key A~D·text 중복 X·answer ∈ {A,B,C,D} */
export function choicesAreValid(q: QuizMetricInput["quiz"]["questions"][number]): {
  ok: boolean;
  reason?: string;
} {
  if (q.kind && q.kind !== "multiple-choice") return { ok: true };
  if (!Array.isArray(q.choices) || q.choices.length !== 4) {
    return { ok: false, reason: `choices 개수 ${q.choices?.length ?? 0} (4 필요)` };
  }
  const keys = q.choices.map((c) => c.key);
  const keySet = new Set(keys);
  const expectedKeys = ["A", "B", "C", "D"];
  if (keySet.size !== 4 || !expectedKeys.every((k) => keySet.has(k))) {
    return { ok: false, reason: `choices key가 A~D 유일이 아님: ${keys.join(",")}` };
  }
  const texts = q.choices.map((c) => c.text.trim());
  const textSet = new Set(texts);
  if (textSet.size !== 4) {
    return { ok: false, reason: `choices 텍스트 중복 — ${texts.join(" / ")}` };
  }
  if (!/^[ABCD]$/.test(q.answer.trim())) {
    return { ok: false, reason: `answer가 A~D 한 글자가 아님: "${q.answer}"` };
  }
  return { ok: true };
}

export function evaluateQuiz(input: QuizMetricInput): QuizMetricResult {
  const notes: string[] = [];
  if (input.quiz.rejected) {
    return {
      total: 0,
      rejected: true,
      evidenceMatchRate: 0,
      choicesIntegrityRate: 0,
      meanKoreanRatioInStem: 0,
      schemaIssues: 0,
      notes: ["모델이 rejected로 응답 — 자료 부족 추정"],
    };
  }
  const qs = input.quiz.questions;
  if (qs.length === 0) {
    return {
      total: 0,
      rejected: false,
      evidenceMatchRate: 0,
      choicesIntegrityRate: 0,
      meanKoreanRatioInStem: 0,
      schemaIssues: 1,
      notes: ["rejected가 아닌데 questions 빈 배열 — 스키마 위반"],
    };
  }

  let matched = 0;
  let choicesOk = 0;
  let korTotal = 0;
  let schemaIssues = 0;
  for (const q of qs) {
    // evidence
    if (typeof q.evidence !== "string" || q.evidence.trim().length === 0) {
      schemaIssues++;
      notes.push(`Q${q.id ?? "?"}: evidence 비어있음`);
    } else if (evidenceInMaterial(q.evidence, input.materialText)) {
      matched++;
    } else {
      notes.push(`Q${q.id ?? "?"}: evidence "${q.evidence.slice(0, 60)}…"가 자료 본문에 없음`);
    }

    // choices
    const c = choicesAreValid(q);
    if (c.ok) choicesOk++;
    else {
      notes.push(`Q${q.id ?? "?"}: ${c.reason}`);
      schemaIssues++;
    }

    // stem 한국어 비율
    korTotal += koreanRatio(q.stem);

    // 기본 스키마 — explanation 너무 짧으면
    if (typeof q.explanation !== "string" || q.explanation.trim().length < 20) {
      schemaIssues++;
      notes.push(`Q${q.id ?? "?"}: explanation 너무 짧음/없음`);
    }
  }

  return {
    total: qs.length,
    rejected: false,
    evidenceMatchRate: matched / qs.length,
    choicesIntegrityRate: choicesOk / qs.length,
    meanKoreanRatioInStem: korTotal / qs.length,
    schemaIssues,
    notes,
  };
}

/**
 * A/B 두 결과를 비교해 사람이 안 봐도 통과/실패 결론을 내려준다.
 *
 * NEXT-STEPS.md §2-2 4가지 통과 조건 자동화 가능한 부분:
 *   1) evidenceMatchRate ≥ 0.95 (Sonnet 기준 100% 가까이 — 5%포인트만 양보)
 *   2) choicesIntegrityRate = 1.0 (보기 무결성은 양보 X)
 *   3) schemaIssues = 0
 *   4) meanKoreanRatioInStem ≥ baseline의 0.9배 (한국어 비율이 90% 이상 유지)
 *
 * 변별력(목표 정답률 50~75%)은 실제 학생 응시 데이터 없이 못 잼 — 사람 평가.
 */
export function compareForPromotion(
  baseline: QuizMetricResult,
  candidate: QuizMetricResult,
): {
  promote: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  if (candidate.rejected && !baseline.rejected) {
    reasons.push("candidate가 rejected — 자료 처리 안정성 부족");
  }
  if (candidate.evidenceMatchRate < 0.95) {
    reasons.push(
      `evidence 매칭 ${(candidate.evidenceMatchRate * 100).toFixed(0)}% < 95% — hallucination 신호`,
    );
  }
  if (candidate.choicesIntegrityRate < 1) {
    reasons.push(
      `보기 무결성 ${(candidate.choicesIntegrityRate * 100).toFixed(0)}% < 100% — 객관식 형식 깨짐`,
    );
  }
  if (candidate.schemaIssues > 0) {
    reasons.push(`스키마 위반 ${candidate.schemaIssues}건`);
  }
  if (
    baseline.meanKoreanRatioInStem > 0 &&
    candidate.meanKoreanRatioInStem < baseline.meanKoreanRatioInStem * 0.9
  ) {
    reasons.push(
      `한국어 stem 비율 ${(candidate.meanKoreanRatioInStem * 100).toFixed(0)}% < baseline의 90%`,
    );
  }

  return { promote: reasons.length === 0, reasons };
}
