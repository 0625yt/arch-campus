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
  return (
    stem
      .toLowerCase()
      // 공백을 완전히 제거 — "다음 중 ~?" 와 "다음중~" 를 같게 본다.
      // 모델이 띄어쓰기·말줄임만 바꿔 같은 문제를 다시 내는 걸 잡기 위함.
      .replace(/[\s\u00a0]+/g, "")
      .replace(/[?？！!.,，。、:：;；()（）[\]【】"'"'`]/g, "")
      .trim()
      // 80자는 긴 stem에서 앞부분만 같으면 오탐/누락이 잦아 120자로.
      .slice(0, 120)
  );
}

/**
 * 문제 단위 fingerprint — stem + 보기 집합(없으면 정답 텍스트).
 *
 * stem만으로는 "같은 답을 다른 문장으로 묻는" 중복을 못 잡는다. 보기 4개를 정렬해
 * 합치면 "보기 구성이 똑같은" 문제(= 사실상 같은 문제)를 더 확실히 잡는다.
 * 한 quiz 안의 중복 제거(청크 내부 포함)에 사용.
 */
export function questionFingerprint(q: {
  stem: string;
  answer?: string | null;
  choices?: { key: string; text: string }[] | null;
}): string {
  const norm = (s: string) => s.toLowerCase().replace(/[\s\u00a0]+/g, "");
  const stemFp = fingerprint(q.stem);
  const choiceFp = q.choices?.length
    ? q.choices
        .map((c) => norm(c.text))
        .sort()
        .join("|")
        .slice(0, 120)
    : norm(q.answer ?? "");
  return stemFp + "\u2237" + choiceFp;
}

/**
 * stem\uc5d0 \uc11e\uc5ec \ub4e4\uc5b4\uac04 \ubcf4\uae30 \ub098\uc5f4\uc744 \uc81c\uac70\ud55c\ub2e4.
 *
 * \ubaa8\ub378\uc774 \uac00\ub054 stem \ud544\ub4dc\uc5d0 "\ub2e4\uc74c \uc911 \ub9de\ub294 \uac83\uc740? A. \u2026 B. \u2026 C. \u2026 D. \u2026" \ucc98\ub7fc
 * \ubcf4\uae30\uae4c\uc9c0 \ubc15\uc544 \ub123\ub294\ub2e4. \ubcf4\uae30\ub294 \uc774\ubbf8 choices \ubc30\uc5f4\uc5d0 \ub530\ub85c \uc788\uc73c\ubbc0\ub85c, \ud654\uba74\uc5d0\uc11c\ub294
 * \uac19\uc740 \ubcf4\uae30\uac00 \ub450 \ubc88 \ub098\uc628\ub2e4(\uc9c8\ubb38 \uc548 + \ubcf4\uae30 \uc601\uc5ed). stem\uc5d0\uc11c "A." \uc774\ud6c4\ub97c \uc798\ub77c\ub0b8\ub2e4.
 *
 * \ubcf4\uc218\uc801\uc73c\ub85c \ub3d9\uc791: \uac1d\uad00\uc2dd\uc774\uace0(choices 4\uac1c), stem \uc548\uc5d0 \ubcf4\uae30 \ub77c\ubca8\uc774 2\uac1c \uc774\uc0c1
 * (A., B. \u2026) \uc904\uc9c0\uc5b4 \ub098\uc62c \ub54c\ub9cc \uc790\ub978\ub2e4. \uc798\ub790\uc744 \ub54c \ub0a8\ub294 \uc9c8\ubb38\uc774 \ub108\ubb34 \uc9e7\uc73c\uba74
 * (< 8\uc790) \uc6d0\ubcf8\uc744 \uadf8\ub300\ub85c \ub454\ub2e4 \u2014 \uc9c8\ubb38 \uc790\uccb4\uac00 \uc0ac\ub77c\uc9c0\ub294 \uac83\ubcf4\ub2e4 \ubcf4\uae30 \uc911\ubcf5\uc774 \ub0ab\ub2e4.
 */
export function stripChoicesFromStem(
  stem: string,
  choices?: { key: string; text: string }[] | null,
): string {
  if (!choices || choices.length < 2) return stem;
  // "A." "A)" "A:" "A\u3001" "(A)" \ub4f1 \ubcf4\uae30 \ub77c\ubca8 \ud328\ud134. \ud55c\uad6d \uc790\ub8cc\ub77c \uc804\uac01\u00b7\ubc18\uac01 \ubaa8\ub450.
  const labelRe =
    /[\s(\uff08[\u3010]?[A-Da-d\u2460\u2461\u2462\u2463\u3260-\u3263\uac00-\ub77c\u3131-\u3139][.\uff0e)\uff09:\uff1a\u3001]/g;
  const matches = [...stem.matchAll(labelRe)];
  if (matches.length < 2) return stem;
  // \uccab \ubcf4\uae30 \ub77c\ubca8\uc758 \uc2dc\uc791 \uc704\uce58 \u2014 \uadf8 \uc55e\uae4c\uc9c0\ub9cc \uc9c8\ubb38\uc73c\ub85c \ubcf8\ub2e4.
  const firstIdx = matches[0].index ?? -1;
  if (firstIdx <= 0) return stem;
  const head = stem
    .slice(0, firstIdx)
    .trim()
    .replace(/[\s\u00a0]+$/u, "");
  // \uc790\ub978 \uc9c8\ubb38\uc774 \ub108\ubb34 \uc9e7\uc73c\uba74(\uc9c8\ubb38\uc774 \ud1b5\uc9f8\ub85c \ubcf4\uae30 \ub4a4\uc5d0 \uc788\ub294 \ube44\uc815\uc0c1 \ucf00\uc774\uc2a4) \uc6d0\ubcf8 \uc720\uc9c0.
  if (head.length < 8) return stem;
  return head;
}
