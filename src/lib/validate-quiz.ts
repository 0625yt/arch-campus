import "server-only";

import type { QuizQuestionT } from "@/lib/schemas";

/**
 * Quiz 출력 검증 — 환각 차단의 사활.
 *
 * Sonnet이 evidence를 "그럴듯하게 들리는데 본문에는 없는" 문자열로 채우는 경우가 종종 있음.
 * 환각 evidence는 학생이 "어 자료에 이런 표현 없는데?" 하고 신뢰를 잃는 1순위.
 *
 * 검증 정책:
 *   - evidence가 자료 본문에 정규화된 substring으로 존재해야 keep
 *   - isMetadataOnly인 경우만 evidence 비어있어도 허용 (메타만이라 본문 없음)
 *   - 너무 짧은 evidence(< 10자)는 환각 위험 + 자료 매칭 의미 X → drop
 *
 * 정규화:
 *   - 모든 공백을 단일 스페이스로
 *   - 양끝 공백 trim
 *   - 대소문자는 유지 (코드·영문 약자가 의미를 가짐)
 *   - 줄바꿈·탭 → 스페이스
 *
 * 반환:
 *   - kept: 검증 통과한 문제만
 *   - dropped: 검증 실패한 문제 + 사유 (디버깅·로깅용)
 */

export interface ValidateResult {
  kept: QuizQuestionT[];
  dropped: Array<{ questionId: number; reason: string; evidence: string }>;
}

export function validateEvidence(
  questions: QuizQuestionT[],
  materialFullText: string,
  opts: { isMetadataOnly: boolean },
): ValidateResult {
  const kept: QuizQuestionT[] = [];
  const dropped: ValidateResult["dropped"] = [];
  const normalizedSource = normalize(materialFullText);

  for (const q of questions) {
    const evidence = (q.evidence ?? "").trim();

    if (opts.isMetadataOnly) {
      // 메타만이면 evidence 없어도 통과 (본문이 없으니 검증 불가)
      kept.push(q);
      continue;
    }

    if (!evidence) {
      dropped.push({
        questionId: q.id,
        reason: "evidence가 비어있음",
        evidence: "",
      });
      continue;
    }

    if (evidence.length < 10) {
      dropped.push({
        questionId: q.id,
        reason: `evidence가 너무 짧음 (${evidence.length}자)`,
        evidence,
      });
      continue;
    }

    const normalizedEvidence = normalize(evidence);
    if (!normalizedSource.includes(normalizedEvidence)) {
      dropped.push({
        questionId: q.id,
        reason: "evidence가 자료 본문에 없음 (환각 의심)",
        evidence: evidence.slice(0, 120),
      });
      continue;
    }

    kept.push(q);
  }

  return { kept, dropped };
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * 문제 fingerprint — 같은 자료에서 중복 출제 방지용.
 *
 * stem(문제 본문)을 정규화해 fingerprint로. topic·answer·evidence는 모델이
 * 같은 문제를 다르게 표현해도 stem만은 의미가 같으면 비슷한 fingerprint로 떨어진다.
 *
 * 사용:
 *   1) 기존 quizzes에서 해당 자료의 모든 stem fingerprint 수집
 *   2) 프롬프트의 dynamicContext에 "이런 stem은 만들지 마" 박기
 *   3) 새 생성 결과에 같은 fingerprint 있으면 drop (서비스 레이어)
 */
export function fingerprint(stem: string): string {
  return stem
    .toLowerCase()
    .replace(/[\s ]+/g, " ")
    .replace(/[?？！!.,，。、:：;；()（）[\]【】"'"'`]/g, "")
    .trim()
    .slice(0, 80);
}
