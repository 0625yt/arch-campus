import type { QuizQuestionT } from "@/lib/schemas";

/**
 * Quiz 출력 검증 — 환각 차단의 사활.
 *
 * Sonnet이 evidence를 "그럴듯하게 들리는데 본문에는 없는" 문자열로 채우는 경우가 종종 있음.
 * 환각 evidence는 학생이 "어 자료에 이런 표현 없는데?" 하고 신뢰를 잃는 1순위.
 *
 * 검증 정책 (substring 완전일치 + 위치가 가까운 순서 보존 유사 인용):
 *   - 기존엔 "evidence가 본문에 substring으로 존재"를 요구했는데, OCR이 텍스트를 조금만
 *     다르게 뽑으면(후리가나 분리·줄바꿈·표 쪼갬·2단 레이아웃·각주) 정당한 인용도 대량 drop돼
 *     문제 수가 1~3개로 무너졌다. (영어 자료는 OCR 노이즈가 적어 우연히 멀쩡했을 뿐.)
 *   - evidence 글자가 본문의 한 짧은 구간 안에서 같은 순서로 나타나는지 판정한다.
 *     OCR 후리가나·줄바꿈 삽입은 살리되, 두 글자 조각이 문서 곳곳에 흩어진 짜깁기는 막는다.
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
const EVIDENCE_OVERLAP_THRESHOLD = 0.82;
const NGRAM = 2;

export interface ValidateResult {
  kept: QuizQuestionT[];
  dropped: Array<{ questionId: number; reason: string; evidence: string }>;
}

export interface QuestionIntegrityOptions {
  allowedKinds?: readonly QuizQuestionT["kind"][];
}

/**
 * Evidence가 존재해도 객관식 키·정답·보기 또는 사용자가 고른 문제 종류가 깨지면
 * 학생에게 노출할 수 없다. 모델 출력의 구조적 결함을 문제 단위로 걸러낸다.
 */
export function validateQuestionIntegrity(
  questions: QuizQuestionT[],
  opts: QuestionIntegrityOptions = {},
): ValidateResult {
  const kept: QuizQuestionT[] = [];
  const dropped: ValidateResult["dropped"] = [];
  const allowed = opts.allowedKinds?.length ? new Set(opts.allowedKinds) : null;

  for (const question of questions) {
    const kind = question.kind ?? "multiple-choice";
    const fail = (reason: string) => {
      dropped.push({
        questionId: question.id,
        reason,
        evidence: question.stem.slice(0, 120),
      });
    };

    if (allowed && !allowed.has(kind)) {
      fail(`선택하지 않은 문제 종류가 생성됨 (${kind})`);
      continue;
    }

    if (containsPromptLeakage(question)) {
      fail("프롬프트 또는 내부 지시 노출 의심");
      continue;
    }

    if (kind === "multiple-choice") {
      if (!question.choices || question.choices.length !== 4) {
        fail("객관식 보기가 정확히 4개가 아님");
        continue;
      }

      const keys = question.choices.map((choice) => choice.key);
      const keySet = new Set<string>(keys);
      const expected = ["A", "B", "C", "D"];
      if (keySet.size !== 4 || !expected.every((key) => keySet.has(key))) {
        fail("객관식 보기 키가 A~D로 고유하지 않음");
        continue;
      }

      const normalizedChoices = question.choices.map((choice) => normalizeChoice(choice.text));
      if (normalizedChoices.some((choice) => choice.length === 0)) {
        fail("비어 있는 객관식 보기가 있음");
        continue;
      }
      if (new Set(normalizedChoices).size !== normalizedChoices.length) {
        fail("객관식 보기 내용이 중복됨");
        continue;
      }
      if (question.choices.some((choice) => isMetaChoice(choice.text))) {
        fail("'모두 정답/A와 B 모두/정답 없음' 같은 메타 보기가 포함됨");
        continue;
      }

      const answer = question.answer.trim().toUpperCase();
      if (!/^[ABCD]$/.test(answer) || !keySet.has(answer)) {
        fail("객관식 정답이 A~D 보기 중 하나가 아님");
        continue;
      }
      question.answer = answer;
    }

    if (kind === "short-answer") {
      const scriptMismatch = japaneseScriptTargetMismatch(question.stem, question.answer);
      if (scriptMismatch) {
        fail(scriptMismatch);
        continue;
      }
    }

    kept.push(question);
  }

  return { kept, dropped };
}

/** 표기 자체를 묻는 문제에서 다른 문자 표기를 동의어로 섞으면 채점 목표가 무너진다. */
function japaneseScriptTargetMismatch(stem: string, answer: string): string | null {
  const normalizedStem = stem.normalize("NFKC").toLowerCase();
  const asksHiragana = /(?:히라가나|ひらがな)\s*(?:로|으로|で)/u.test(normalizedStem);
  const asksKatakana = /(?:가타카나|カタカナ)\s*(?:로|으로|で)/u.test(normalizedStem);
  const asksKanji = /(?:한자|漢字)\s*(?:로|으로|で)/u.test(normalizedStem);
  if (!asksHiragana && !asksKatakana && !asksKanji) return null;

  const alternatives = answer
    .replace(/^정답[:：]\s*/iu, "")
    .split(/\s*[|/,;]\s*|\s*또는\s*/u)
    .map((value) => value.trim())
    .filter(Boolean);
  if (alternatives.length === 0) return "표기 문제의 정답이 비어 있음";

  const hasHiragana = (value: string) => /[ぁ-ゟ]/u.test(value);
  const hasKatakana = (value: string) => /[ァ-ヿ]/u.test(value);
  const hasHan = (value: string) => /\p{Script=Han}/u.test(value);

  if (
    asksHiragana &&
    alternatives.some((value) => !hasHiragana(value) || hasKatakana(value) || hasHan(value))
  ) {
    return "히라가나 표기 문제 정답에 다른 문자 표기가 포함됨";
  }
  if (
    asksKatakana &&
    alternatives.some((value) => !hasKatakana(value) || hasHiragana(value) || hasHan(value))
  ) {
    return "가타카나 표기 문제 정답에 다른 문자 표기가 포함됨";
  }
  if (asksKanji && alternatives.some((value) => !hasHan(value))) {
    return "한자 표기 문제 정답에 한자가 아닌 대안이 포함됨";
  }
  return null;
}

export function validateEvidence(
  questions: QuizQuestionT[],
  materialFullText: string,
  opts: { isMetadataOnly: boolean; allowOcrFuzzy?: boolean },
): ValidateResult {
  const kept: QuizQuestionT[] = [];
  const dropped: ValidateResult["dropped"] = [];
  const normalizedSource = normalize(materialFullText);
  // 압축 본문은 문제마다 재사용 — 루프 밖에서 1회 계산.
  const compactSource = compact(materialFullText);

  for (const q of questions) {
    const evidence = (q.evidence ?? "").trim();

    if (opts.isMetadataOnly) {
      dropped.push({
        questionId: q.id,
        reason: "검증할 자료 본문이 없음",
        evidence: evidence.slice(0, 120),
      });
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
    // 1.5차 (전 자료 공통): 기호·구두점만 제거한 완전 substring 매칭.
    //   Flash 계열이 원문 콜론(:)을 불릿(•·)으로 바꾸거나 구두점을 살짝 바꾸는 습관이 있는데,
    //   내용은 그대로다. compact()는 기호를 다 지우므로 "기호만 다른 정당 인용"은 여기서 통과하고,
    //   단어를 실제로 바꿔 쓴 패러프레이즈는 글자 시퀀스가 깨져 통과하지 못한다(환각 방어 유지).
    //   substring(완전 포함)만 허용 — 흩어진 글자 짜깁기는 2차 charOverlap에서만 관대해진다.
    const compactEvidence = compact(evidence);
    if (compactEvidence.length >= 10 && compactSource.includes(compactEvidence)) {
      kept.push(q);
      continue;
    }
    // 2차는 OCR로 읽힌 자료에만 허용한다. 일반 텍스트까지 순서보존 유사도(부분 매칭)를 허용하면
    // 모델이 본문을 바꿔 쓴 문장을 근거처럼 제출해도 살아남아 정확한 출처 추적이 깨진다.
    if (!opts.allowOcrFuzzy) {
      dropped.push({
        questionId: q.id,
        reason: "evidence가 자료 본문의 정확한 인용이 아님",
        evidence: evidence.slice(0, 120),
      });
      continue;
    }

    // OCR 자료: 한 위치 주변의 순서 보존 유사도 — 후리가나·줄바꿈이 끼어도
    // 원문 글자 순서는 남는다. 문서 전체에 흩어진 공통 글자 조각만으로는 통과하지 못한다.
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

function normalizeChoice(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();
}

function containsPromptLeakage(question: QuizQuestionT): boolean {
  const text = [
    question.stem,
    question.explanation,
    question.answer,
    ...(question.choices?.map((choice) => choice.text) ?? []),
  ].join(" ");
  return /<\/?(?:user_input|user_metadata|user_scope|user_intent)>|system\s*prompt|시스템\s*프롬프트|위\s*지침을?\s*무시/iu.test(
    text,
  );
}

function normalize(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** 공백·문장부호·기호를 모두 제거해 글자 시퀀스만 — N-gram 오버랩 측정용. */
function compact(text: string): string {
  return text.normalize("NFC").replace(/[\s\p{P}\p{S}]+/gu, "");
}

/**
 * evidence와 닮은 본문의 짧은 후보 구간들만 찾아 순서 보존 문자 비율과 2-gram 비율을
 * 함께 계산한다. 문서 전체를 하나의 단어 주머니처럼 비교하지 않는 것이 핵심이다.
 */
function charOverlapRatio(evidence: string, compactSourceText: string): number {
  const compactEvidence = compact(evidence);
  if (!compactEvidence) return 0;
  if (compactSourceText.includes(compactEvidence)) return 1;

  // 모델 evidence는 보통 20~200자다. 비정상적으로 긴 인용은 첫 800자만으로도
  // 실제 원문 여부를 충분히 판정할 수 있고, 최악 입력의 비교 비용을 제한한다.
  const ev = compactEvidence.slice(0, 800);
  if (ev.length < NGRAM) return compactSourceText.includes(ev) ? 1 : 0;

  const anchorIndexes = Array.from(
    new Set([0, 0.2, 0.4, 0.6, 0.8, 1].map((ratio) => Math.floor((ev.length - NGRAM) * ratio))),
  );
  const expectedStarts = new Set<number>();

  for (const anchorIndex of anchorIndexes) {
    const anchor = ev.slice(anchorIndex, anchorIndex + NGRAM);
    let from = 0;
    let found = 0;
    while (found < 16 && expectedStarts.size < 80) {
      const position = compactSourceText.indexOf(anchor, from);
      if (position < 0) break;
      expectedStarts.add(position - anchorIndex);
      from = position + 1;
      found += 1;
    }
  }

  if (expectedStarts.size === 0) return 0;

  const evidenceGrams = shingles(ev, NGRAM);
  let best = 0;
  for (const expectedStart of expectedStarts) {
    const padding = Math.floor(ev.length * 0.35) + 20;
    const start = Math.max(0, expectedStart - padding);
    const end = Math.min(compactSourceText.length, expectedStart + ev.length * 3 + 60);
    const window = compactSourceText.slice(start, end);

    let cursor = 0;
    let orderedHits = 0;
    for (const char of ev) {
      const position = window.indexOf(char, cursor);
      if (position < 0) continue;
      orderedHits += 1;
      cursor = position + 1;
    }
    const orderedRatio = orderedHits / ev.length;

    let gramHits = 0;
    for (const gram of evidenceGrams) if (window.includes(gram)) gramHits += 1;
    const gramRatio = gramHits / Math.max(1, evidenceGrams.size);
    best = Math.max(best, orderedRatio * 0.7 + gramRatio * 0.3);
  }

  return best;
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
 * 어순·상투 문구만 조금 바꾼 문제까지 잡는 보수적 유사도 판정.
 * 완전히 다른 개념의 짧은 질문을 합치지 않도록 충분히 긴 stem에만 적용한다.
 */
export function areNearDuplicateStems(a: string, b: string): boolean {
  const left = canonicalStem(a);
  const right = canonicalStem(b);
  if (!left || !right) return false;
  if (left === right) return true;

  // "옳은 것"과 "옳지 않은 것", "memory"와 "no memory"처럼 표면 문자열은
  // 거의 같아도 요구하는 답은 정반대다. 이런 쌍을 중복으로 제거하면 유효한 문제가
  // 사라지므로, 명시적 부정 극성이 한쪽에만 있으면 유사도 계산 전에 분리한다.
  if (hasNegativePolarity(left) !== hasNegativePolarity(right)) return false;

  const leftCompact = compact(left);
  const rightCompact = compact(right);
  if (Math.min(leftCompact.length, rightCompact.length) < 12) return false;

  const leftShingles = shingles(leftCompact, 3);
  const rightShingles = shingles(rightCompact, 3);
  const intersection = intersectionSize(leftShingles, rightShingles);
  const union = leftShingles.size + rightShingles.size - intersection;
  const jaccard = union === 0 ? 0 : intersection / union;
  const containment = intersection / Math.max(1, Math.min(leftShingles.size, rightShingles.size));
  const lengthRatio =
    Math.max(leftCompact.length, rightCompact.length) /
    Math.min(leftCompact.length, rightCompact.length);

  return jaccard >= 0.82 || (containment >= 0.9 && lengthRatio <= 1.35);
}

function hasNegativePolarity(value: string): boolean {
  return /\b(?:not|no|never|incorrect|wrong|false|except|least)\b|(?:않|아닌|아니|없|틀린|잘못|부적절)/iu.test(
    value,
  );
}

/** 모델이 정답을 A에 몰아도 보기 의미를 보존한 채 위치를 균등하게 재배치한다. */
export function balanceMultipleChoiceAnswers(questions: QuizQuestionT[]): QuizQuestionT[] {
  const keys = ["A", "B", "C", "D"] as const;
  const counts: Record<(typeof keys)[number], number> = { A: 0, B: 0, C: 0, D: 0 };

  return questions.map((question) => {
    if ((question.kind ?? "multiple-choice") !== "multiple-choice" || !question.choices) {
      return question;
    }

    const answer = question.answer.trim().toUpperCase();
    const decorated = question.choices
      .map((choice) => ({
        choice,
        correct: choice.key === answer,
        rank: stableHash(`${question.stem}\u2237${choice.text}`),
      }))
      .sort((a, b) => a.rank - b.rank || a.choice.key.localeCompare(b.choice.key));
    if (!decorated.some((item) => item.correct)) return question;

    const minimum = Math.min(...keys.map((key) => counts[key]));
    const candidates = keys.filter((key) => counts[key] === minimum);
    const target = candidates[stableHash(question.stem) % candidates.length];
    const targetIndex = keys.indexOf(target);
    const correctIndex = decorated.findIndex((item) => item.correct);
    [decorated[targetIndex], decorated[correctIndex]] = [
      decorated[correctIndex],
      decorated[targetIndex],
    ];
    counts[target] += 1;

    return {
      ...question,
      answer: target,
      choices: decorated.map((item, index) => ({
        key: keys[index],
        text: item.choice.text,
      })),
    };
  });
}

function isMetaChoice(value: string): boolean {
  const normalized = value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  return [
    /^(?:all|none) of (?:the )?above\b/i,
    /^both [a-d] (?:and|&) [a-d]\b/i,
    /^(?:위|앞|상기)(?:의|에)? (?:모든|전부|보기|내용).*(?:정답|옳|맞)/u,
    /^(?:모두|전부) (?:정답|옳|맞)/u,
    /^(?:정답|해당) (?:없음|없다)/u,
    /[a-d]\s*(?:와|과|및|그리고|&|\/)\s*[a-d]\s*(?:모두|둘 다|전부)/iu,
  ].some((pattern) => pattern.test(normalized));
}

function canonicalStem(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(
      /(?:자료(?:에|에서)?\s*(?:따르면|설명한|제시된)|다음\s*(?:중|문장(?:의)?|보기(?:에서)?)?|가장\s*(?:적절한|알맞은)|무엇(?:인가요?|입니까)|고르세요|선택하세요)/gu,
      " ",
    )
    .replace(/[\s\p{P}\p{S}]+/gu, " ")
    .trim();
}

function shingles(value: string, size: number): Set<string> {
  const result = new Set<string>();
  for (let index = 0; index + size <= value.length; index++) {
    result.add(value.slice(index, index + size));
  }
  return result;
}

function intersectionSize<T>(left: Set<T>, right: Set<T>): number {
  let size = 0;
  for (const value of left) if (right.has(value)) size += 1;
  return size;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * stem의 "핵심 예문"만 뽑는다 — 중복 판정의 진짜 기준.
 *
 * 어학(특히 일본어) 문제는 같은 빈칸 예문을 도입부만 바꿔 반복하는 중복이 많다.
 * 같은 예문이 인용부호 유무·공백·후리가나·한국어 번역 꼬리만 다르게 반복된다:
 *   "다음 문장의 빈칸에…「かさを2___ください。」"
 *   "…：かさを2___ください。"
 *   "자료 8과의 설명을 바탕으로, 「かさを2 ___ ください。」(우산을 2개…)와 같이…"
 * → 도입부·번역·공백·후리가나를 다 걷어내면 예문 핵심(かさを2○ください)은 같다.
 *
 * 전략: stem에서 일본어 가나·한자 + 빈칸(○)만 남겨 fingerprint한다.
 *   - 빈칸(_ ＿ …)을 ○로 통일, 후리가나(한자 뒤 괄호 읽기)·한국어·영문·숫자·공백 제거.
 *   - 일본어가 거의 없으면(비어학) stem 전체 정규화로 폴백 — 오버머지 방지.
 */
function coreExampleOf(stem: string): string {
  const blanked = stem.replace(/[_＿…]+|\.{2,}/g, "○"); // 빈칸·말줄임 통일
  // 후리가나 제거: 한자 바로 뒤 (かな) 읽기 괄호.
  const noFurigana = blanked.replace(/([一-鿿])[(（][ぁ-ゟ゠-ヿ]+[)）]/g, "$1");
  // 일본어(가나·한자) + 빈칸(○) + 장음(ー)만 — 한국어·영문·숫자·공백·구두점 제거.
  const jp = noFurigana.replace(/[^぀-ヿ一-鿿○ー]/g, "");
  // 일본어 예문이 충분하면(빈칸 뺀 가나·한자 3자+) 그걸로, 아니면 stem 전체 정규화로 폴백.
  if (jp.replace(/○/g, "").length >= 3) return jp.slice(0, 80);
  return stem
    .toLowerCase()
    .replace(/[_＿…]+|\.{2,}/g, "○") // 빈칸·말줄임을 한 기호로 통일
    .replace(/[\s ]+/g, "")
    .replace(/[?？！!.,，。、:：;；()（）[\]【】"'"'`]/g, "")
    .slice(0, 80);
}

/**
 * 문제 단위 fingerprint — 핵심 예문 + 보기 집합(없으면 정답 텍스트).
 *
 * stem 전체가 아니라 coreExampleOf(stem)을 쓰는 게 핵심: "같은 예문을 다른 도입부로
 * 감싼" 중복(어학에서 가장 흔함)을 잡으려면 도입부를 무시하고 예문만 봐야 한다.
 * 보기 4개를 정렬해 합치면 "보기 구성이 똑같은" 문제까지 확실히 묶인다.
 * 한 quiz 안의 중복 제거(청크 내부 포함)에 사용.
 */
export function questionFingerprint(q: {
  stem: string;
  answer?: string | null;
  choices?: { key: string; text: string }[] | null;
}): string {
  const norm = (s: string) => s.toLowerCase().replace(/[\s\u00a0]+/g, "");
  const coreFp = coreExampleOf(q.stem);
  const choiceFp = q.choices?.length
    ? q.choices
        .map((c) => norm(c.text))
        .sort()
        .join("|")
        .slice(0, 120)
    : norm(q.answer ?? "");
  return `${coreFp}\u2237${choiceFp}`;
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
