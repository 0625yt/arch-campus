import "server-only";

import type { QuizQuestionT } from "@/lib/schemas";

/**
 * Quiz 출력 검증 — 환각 차단의 사활.
 *
 * Sonnet이 evidence를 "그럴듯하게 들리는데 본문에는 없는" 문자열로 채우는 경우가 종종 있음.
 * 환각 evidence는 학생이 "어 자료에 이런 표현 없는데?" 하고 신뢰를 잃는 1순위.
 *
 * 검증 정책 (2026-06-04 근본 재설계 — substring 완전일치 → 문자 오버랩 비율):
 *   - 기존엔 "evidence가 본문에 substring으로 존재"를 요구했는데, OCR이 텍스트를 조금만
 *     다르게 뽑으면(후리가나 분리·줄바꿈·표 쪼갬·2단 레이아웃·각주) 정당한 인용도 대량 drop돼
 *     문제 수가 1~3개로 무너졌다. (영어 자료는 OCR 노이즈가 적어 우연히 멀쩡했을 뿐.)
 *   - 근본 해결: evidence의 글자 N-gram이 본문에 얼마나 존재하는지 "겹침 비율"로 판정.
 *     OCR 노이즈로 살짝 어긋난 정당 인용은 살리고(비율 높음), 자료에 없는 환각은 막는다(비율 급락).
 *   - 너무 짧은 evidence(< 10자)는 환각 위험 + 매칭 의미 X → drop
 *   - isMetadataOnly(본문 거의 없음)는 substring 검증 불가 → keep (진입 단계에서 본문 충분한
 *     자료만 오도록 가드, runQuizGeneration이 materialId 빈 값을 거부함)
 *
 * 반환:
 *   - kept: 검증 통과한 문제만
 *   - dropped: 검증 실패한 문제 + 사유 (디버깅·로깅용)
 */

/**
 * evidence 글자 N-gram 중 본문에 존재하는 비율이 이 값 이상이면 정당한 인용으로 본다.
 *
 * N=2(2-gram): 후리가나가 한자·조사 사이에 끼어 경계가 깨져도 2글자 조각은 살아남을
 *   확률이 높아, 본문 길이와 무관하게 정당/환각을 안정적으로 가른다.
 *   실측: 정당 인용 75~100% vs 환각 0~47% → 임계 0.6이면 둘을 확실히 분리(여유 13%p+).
 *   (3-gram은 짧은 본문에서 정당 인용도 55%로 떨어져 환각과 안 갈렸음.)
 */
const EVIDENCE_OVERLAP_THRESHOLD = 0.6;
const NGRAM = 2;

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
  // 압축 본문은 문제마다 재사용 — 루프 밖에서 1회 계산.
  const compactSource = compact(materialFullText);

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
    // 1차: 공백 정규화 substring — 영문·한국어 등 OCR이 깔끔한 자료는 여기서 바로 통과(빠름).
    if (normalizedSource.includes(normalizedEvidence)) {
      kept.push(q);
      continue;
    }
    // 2차: 문자 오버랩 비율 — OCR이 후리가나·줄바꿈·표·각주로 텍스트를 어긋나게 뽑아도
    // evidence 글자열이 본문에 충분히 존재하면 정당한 인용으로 본다. 자료에 없는 환각은
    // 글자 자체가 본문에 거의 없어 비율이 급락 → drop.
    const overlap = charOverlapRatio(normalizedEvidence, compactSource);
    if (overlap >= EVIDENCE_OVERLAP_THRESHOLD) {
      kept.push(q);
      continue;
    }
    dropped.push({
      questionId: q.id,
      reason: `evidence가 자료 본문에 없음 (환각 의심, 겹침 ${Math.round(overlap * 100)}%)`,
      evidence: evidence.slice(0, 120),
    });
  }

  return { kept, dropped };
}

function normalize(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** 공백·문장부호·기호를 모두 제거해 글자 시퀀스만 — N-gram 오버랩 측정용. */
function compact(text: string): string {
  return text.normalize("NFC").replace(/[\s\p{P}\p{S}]+/gu, "");
}

/**
 * evidence가 본문에 얼마나 "녹아있는지" — evidence를 N글자 윈도로 쪼개, 각 조각이
 * 본문 압축 문자열에 존재하는 비율을 반환(0~1).
 *
 * OCR이 후리가나(銀行↔ぎんこう)·줄바꿈·표를 사이에 끼워 substring을 깨뜨려도,
 * evidence의 연속 글자 조각 대부분은 본문 어딘가에 그대로 존재한다 → 비율 높음.
 * 자료에 없는 환각(時計·財布)은 조각 자체가 본문에 없어 비율이 0에 가깝다.
 */
function charOverlapRatio(evidence: string, compactSourceText: string): number {
  const ev = compact(evidence);
  if (ev.length < NGRAM) return compactSourceText.includes(ev) ? 1 : 0;
  let hit = 0;
  let total = 0;
  for (let i = 0; i + NGRAM <= ev.length; i++) {
    total++;
    if (compactSourceText.includes(ev.slice(i, i + NGRAM))) hit++;
  }
  return total === 0 ? 0 : hit / total;
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
