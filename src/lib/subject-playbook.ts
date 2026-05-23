/**
 * 과목별 요약·문제생성·기출추출 디테일 사전 — 영역(SubjectArea) 10종 × 도구 3종.
 *
 * 왜:
 *   - 같은 "이해" 스타일이라도 수학은 정의·예제·반례, 영어는 어휘·문법 패턴이 핵심
 *   - 프롬프트 한 곳에 모든 분기를 박으면 캐시 비효율·유지보수 어려움
 *   - 각 도구 service가 detectSubject로 영역 찾고 → playbook으로 힌트 가져옴 → dynamicContext에 주입
 *
 * playbook 한 줄 한 줄은 "이 영역 자료의 학생이 시험·과제에서 진짜 원하는 것"을 적는다.
 * 추상 ("좋은 요약") 금지. 구체 ("어휘 10개면 10개 전부 + 예문 + 품사") OK.
 *
 * 새 영역 추가:
 *   1) SubjectArea에 코드 추가 (subject-detector.ts)
 *   2) 토큰 사전 추가 (subject-detector.ts TOKEN_MAP)
 *   3) PLAYBOOK 객체에 3개 hint 추가 (이 파일)
 *
 * 새 도구 추가:
 *   - PlaybookHints 인터페이스에 필드 추가, 각 영역에 작성
 */

import type { SubjectArea } from "./subject-detector";

export interface PlaybookHints {
  /** runSummarize의 dynamicContext에 박는 "## 과목 디테일" 섹션 본문 */
  summarize: string;
  /** runQuiz의 dynamicContext에 박는 동일 섹션. quiz는 "어떤 문제 형태가 시험에서 진짜 나오나" 중심 */
  quiz: string;
  /** runExamExtract의 dynamicContext에 박는 섹션. 기출 자료에서 어떤 패턴이 자주 나오는지 */
  examExtract: string;
}

const PLAYBOOK: Record<SubjectArea, PlaybookHints> = {
  english: {
    summarize: [
      "어휘는 본문에 나오는 단어를 한 개도 빠뜨리지 말고 다 정리 (10개 어휘면 10개).",
      "각 어휘마다 품사·뜻·예문 한 묶음 (예: \"suggestion (n.) — 제안. 'I have a suggestion.'\").",
      "문법 포인트는 callout으로 패턴 + 예문 + 자주 틀리는 변형 (예: \"should + V원형\" — should to V X).",
      "지문은 통째로 인용하지 말고 핵심 문장만. 한국어 짧은 보조 설명 OK.",
      "keywords는 어휘·표현 위주로 늘리고 50개 가까이 가도 OK.",
    ].join("\n"),
    quiz: [
      "객관식: 어휘 뜻·반의어·동의어 / 문법 패턴 빈칸 / 지문 추론.",
      "단답형: 빈칸 채우기 (단어·관용표현) / 동사 활용형.",
      "서술형은 거의 안 나옴 — 출제 X (학생이 명시 요청한 경우만).",
      "오답 선지는 비슷한 발음·철자·뜻으로. 너무 동떨어진 보기는 학습에 도움 안 됨.",
    ].join("\n"),
    examExtract: [
      "어휘 시험·문법 시험·독해 시험 셋 중 어느 것인지 첫 문제에서 판단.",
      "지문 공유 문제 (같은 지문에 여러 문항)는 sourceQuote에 지문 도입부 인용해서 묶음 표시.",
      "선지 (A/B/C/D 또는 ①②③④) 정확히 그대로. 한국어 번역 추가 금지 — 원문 보존.",
    ].join("\n"),
  },

  japanese: {
    summarize: [
      "한자·히라가나·가타카나 표기 그대로 유지. 후리가나가 있으면 같이.",
      "어휘 정리: 일본어 / 읽는법 (히라가나) / 한국어 뜻 / 예문 한 묶음.",
      "문법: 형태 (활용형) + 의미 + 같이 자주 쓰이는 조사·표현 + 비슷한 패턴과의 차이.",
      "회화·표현은 격식 단계(です·だ·である·존경어)도 같이 정리.",
      "JLPT 급수 표시가 자료에 있으면 보존.",
    ].join("\n"),
    quiz: [
      "객관식: 한자 읽기 / 어휘 뜻 / 문법 활용형 / 조사 선택.",
      "단답형: 빈칸에 알맞은 조사·활용형 채우기.",
      "회화 자료는 상황 표현 매칭 문제 OK.",
    ].join("\n"),
    examExtract: [
      "한자·후리가나·가나 모두 원문 그대로. 한국어 번역 추가 금지.",
      "JLPT 모의고사 형식이면 大問 단위 그대로 묶음 표시.",
    ].join("\n"),
  },

  chinese: {
    summarize: [
      "한자(간체·번체) + 병음(pinyin) + 성조 + 한국어 뜻 한 묶음.",
      "문법: 어순 (S-V-O / 把·被 구문 등) 패턴 + 예문 + 한국 학생이 자주 헷갈리는 부분.",
      "한어 신조어·일상 회화는 회화 상황 단위로 묶음.",
      "HSK 급수 표시 있으면 보존.",
    ].join("\n"),
    quiz: [
      "객관식: 병음 표기 / 한자 뜻 / 어순 정렬.",
      "단답형: 빈칸 한자 / 조사 선택 (了·过·着 등).",
    ].join("\n"),
    examExtract: [
      "병음·한자 둘 다 원문 그대로 보존. 성조 부호 누락 X.",
      "HSK 형식이면 听力·阅读·写作 등 영역 표시 보존.",
    ].join("\n"),
  },

  math: {
    summarize: [
      "정의는 명제 그대로 인용. 변수·기호 정확히 (∀, ∃, ∈, →, ⊆ 등).",
      "정리(theorem)는 '조건 → 결론' 구조 명시. 자주 깜빡하는 가정(예: 연속성, 미분가능성) 강조.",
      "증명은 골격만 — 어떤 방법(직접/귀납/모순/구성)인지 + 핵심 step 3~5개.",
      "예제·반례 callout으로 박스화. 시험 빈출 반례는 따로 분리.",
      "공식은 LaTeX 또는 본문 표기 그대로. 변형 금지.",
    ].join("\n"),
    quiz: [
      "객관식보다 단답형·서술형이 시험 진짜 형태. 출제 비중 단답·서술 위주.",
      "단답형: 값 계산 / 정의·정리 이름 / 조건 빠뜨리면 안 되는 가정.",
      "서술형: 증명 단계 서술 / 반례 제시 / 같은 결론 다른 증명.",
      "객관식 만들 땐 흔한 부호 실수·차수 실수를 오답 선지로.",
    ].join("\n"),
    examExtract: [
      "수식·기호·부호 정확히 보존 (∇, ∂, ∑, ∫, ≥, ≤, ≠ 등).",
      "다단계 문제 ((a)(b)(c))는 한 questions 행으로 합치되 stem에 모든 sub 표시.",
      "답이 풀이 과정 포함이면 explanation에 step 단위로.",
    ].join("\n"),
  },

  physics: {
    summarize: [
      "물리 법칙·공식은 단위 같이 (F = ma → 단위 N = kg·m/s²).",
      "벡터·스칼라 구분 명시. 방향 표시 누락 X.",
      "유도 과정은 step 단위 + 사용한 가정(예: 마찰 무시, 작은 각도 근사).",
      "예제는 풀이 과정 step + 그림(있으면 sourcePage 인용).",
      "단위 변환·차원 분석 callout — 시험에서 단위 틀리면 0점.",
    ].join("\n"),
    quiz: [
      "객관식: 공식 적용 결과 / 그래프 해석 / 단위 매칭.",
      "단답형: 수치 계산 (단위 같이) / 법칙 이름.",
      "서술형: 현상 설명 / 가정 명시한 유도.",
      "오답 선지에 단위 틀린 값·부호 틀린 값 자주.",
    ].join("\n"),
    examExtract: [
      "수식·단위·벡터 표기 보존. 그림·그래프 참조는 sourcePage로 표시.",
      "유효숫자 표기 (3.14 vs 3.14159) 원문 그대로.",
    ].join("\n"),
  },

  chemistry: {
    summarize: [
      "화학식·분자식·구조식 원문 그대로 (H₂O, CH₃COOH 등 첨자·계수 보존).",
      "반응식: 반응물 → 생성물 + 계수 + 조건(촉매·온도·압력) 같이.",
      "주기율표 위치·전자 배치 같은 사실은 표·bullets로.",
      "유기화학은 기능기·메커니즘 단계 (전자 이동 화살표 위치).",
      "실험·관찰 자료면 색 변화·침전 여부·기체 발생 같이.",
    ].join("\n"),
    quiz: [
      "객관식: 화합물 분류 / 반응 종류 / pH 계산.",
      "단답형: 반응식 균형 맞추기 / 분자 명명.",
      "서술형: 메커니즘 설명 / 실험 결과 해석.",
    ].join("\n"),
    examExtract: [
      "화학식·반응식 그대로. 첨자·계수 누락 시 학습 가치 0.",
      "유기 구조식이 그림으로만 있으면 needsManualCheck로 표시 + sourcePage 강조.",
    ].join("\n"),
  },

  biology: {
    summarize: [
      "용어 정의 (대학 생물은 용어 100개 이상) — 정의 + 짧은 예시.",
      "구조·기능 매칭 — 기관·세포소기관·분자별 기능 표 형태(bullets).",
      "과정(주기·경로): 시작→끝 step + 핵심 효소·중간체 (예: 해당작용·TCA·전자전달계).",
      "분류 위계(계-문-강-목-과-속-종)는 트리 구조(bullets 안 bullets).",
      "그림 의존도 높은 자료는 sourcePage 적극 활용.",
    ].join("\n"),
    quiz: [
      "객관식: 용어 정의 매칭 / 구조-기능 매칭 / 과정 순서.",
      "단답형: 효소 이름 / 분자 식별 / 기관 명칭.",
      "서술형: 메커니즘 설명 / 비교 (호기 vs 혐기).",
    ].join("\n"),
    examExtract: [
      "라틴어 학명·효소명 그대로 (Homo sapiens, ATP synthase 등).",
      "그림 의존 문제는 needsManualCheck 표시.",
    ].join("\n"),
  },

  cs: {
    summarize: [
      "코드·API 시그니처·자료구조 표기 원문 그대로 (변수명·타입·괄호).",
      "알고리즘은 의사코드 + 시간·공간 복잡도 (Big-O) + 입력 가정.",
      "자료구조는 연산별 복잡도 표 + 메모리 레이아웃.",
      "흔한 버그·엣지케이스 callout (off-by-one, null check, race condition).",
      "디자인 패턴·아키텍처는 다이어그램 의존이 크면 sourcePage 적극 인용.",
    ].join("\n"),
    quiz: [
      "객관식: 시간복잡도 비교 / 출력 예측 / 자료구조 선택.",
      "단답형: 출력값 / 메서드 이름 / 시간복잡도.",
      "서술형: 알고리즘 설계 / 디자인 결정 설명.",
      "코드 디버깅 문제 OK — 버그 1개 심어두고 찾기.",
    ].join("\n"),
    examExtract: [
      "코드·식별자·괄호·세미콜론 정확히 그대로. 임의 fix 금지.",
      "indent도 보존 (Python 같은 언어).",
      "출력 예시는 stdout 그대로 줄바꿈 포함.",
    ].join("\n"),
  },

  humanities: {
    summarize: [
      "학자·이론·시대 단위로 h2 분리.",
      "각 학자: 핵심 주장 + 키워드 + 반론·후속 비판.",
      "비교(X vs Y)는 callout 또는 bullets — 시험 빈출 \"X와 Y의 차이를 서술하라\".",
      "사료·1차 인용문은 원문 그대로 + 한국어 보조 설명.",
      "연도·인물·사건 fact는 정확히. 추정 X.",
    ].join("\n"),
    quiz: [
      "단답형·서술형 비중 큼. 객관식만 만들지 말 것.",
      "객관식: 학자-이론 매칭 / 시대 배경 / 핵심 개념 정의.",
      "단답형: 학자 이름 / 사건 연도 / 개념어.",
      "서술형: 비교·비판 / 시대 맥락 설명 / 자료 해석.",
    ].join("\n"),
    examExtract: [
      "사료 인용문은 원문 보존. 출처 표기 누락 X.",
      "주관식 답안의 채점 기준이 본문에 있으면 explanation에 채점 포인트 단위로.",
    ].join("\n"),
  },

  default: {
    summarize: [
      "자료에 있는 사실·정의·예시를 충실히 포함. 외부 일반 상식 추가 금지.",
      "핵심 개념·예외·자주 헷갈리는 짝 강조.",
      "blocks는 자료 분량에 비례. 짧으면 5블록도 OK.",
    ].join("\n"),
    quiz: [
      "본문에 있는 사실·정의·관계를 묻는 문제.",
      "오답 선지는 본문의 비슷한 개념·다른 사례에서 가져옴.",
    ].join("\n"),
    examExtract: [
      "본문에 있는 문제·정답·해설 그대로 추출.",
      "새로 만들지 말 것 (생성 금지).",
    ].join("\n"),
  },
};

export function getPlaybookHints(subject: SubjectArea): PlaybookHints {
  return PLAYBOOK[subject];
}

/**
 * dynamicContext에 박는 헬퍼 — service에서 한 번에 같은 포맷으로 부르게.
 *
 * 예:
 *   buildPlaybookSection("math", "summarize")
 *   → "## 과목 디테일 (수학)\n정의는 명제 그대로...\n증명은 골격만..."
 */
export function buildPlaybookSection(
  subject: SubjectArea,
  tool: keyof PlaybookHints,
): string {
  const hints = getPlaybookHints(subject);
  const body = hints[tool];
  if (!body || body.trim().length === 0) return "";
  return ["## 과목 디테일", body].join("\n");
}
