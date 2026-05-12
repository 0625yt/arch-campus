# 위저드 프롬프트 스킬셋 v2 — 만들 때 보는 청사진

> 이 문서는 **새 위저드를 짤 때** 또는 **기존 프롬프트를 보강할 때** 따르는 단계별 가이드.
> [master-rules.md](master-rules.md) 의 8대 패턴은 "지키는 규칙", 이 문서는 "쓰는 절차".

상위 규칙:
- [persona-schema.md](persona-schema.md) — 슬롯 정의
- [master-rules.md](master-rules.md) — AI 티 차단·8대 패턴·캐싱

---

## 0. 위저드 프롬프트 9단 표준 구조

새 프롬프트 파일은 이 순서·헤딩을 그대로 따른다 (검증·코드리뷰가 이 헤딩을 grep함).

```
# {위저드 이름} 프롬프트 ({slug})

> 모델 · 상위 규칙 · 사용처 · 사활 한 줄

## 역할
## 절대 규칙 — 사활
## 입력 슬롯
## 출력 — JSON 객체  (정확한 스키마 + 필드 표)
## 정량 가드레일      (글자수·개수·범위)
## 도메인 적응        (자료 종류·페르소나·난이도에 따른 분기)
## 자체 검증          (출력 직전 체크리스트, 결과는 출력 X)
## 거부 분기          (못 만들 때)
## ❌ / ✅ 예시       (각 위저드 최소 2쌍)
```

---

## 1. 스킬 카드 — 새 위저드 짤 때 거치는 결정 트리

### 스킬 1. **사활 라인 정의 (1순위)**

"이 위저드가 잘못 동작하면 우리 서비스 어떻게 망가지나?" 한 문장으로 적는다.

| 위저드 종류 | 사활 |
|---|---|
| 시험 문제 생성 | 답이 틀리면 즉시 신뢰도 붕괴 |
| 강의계획서 파싱 | 잘못된 일정 자동 등록은 D-day 알림까지 오작동 |
| 발표 가이드 | 슬라이드 본문 써주면 학칙 위반 위험 (CLAUDE.md §4) |
| 시험 벼락치기 | 잘못된 단원 추천 → 시험 망 → 환불 요구 |
| 시험 후 회고 | 약점 오진단 → 다음 학기까지 잘못된 학습 |
| 자기소개서·면접 | 본문 직접 써주면 채용 부정 위험 (§4) |

**사활 = 절대 규칙 §1 첫 줄**. 다른 절대 규칙들은 이 사활을 지키기 위한 부속 규칙이어야 한다.

---

### 스킬 2. **JSON 출력 강제 + 스키마 우선 설계**

LLM 출력은 100% JSON. 마크다운 fence, 설명 텍스트, 메타 코멘트 모두 금지.

순서:
1. **Zod schema 먼저 정의** (`src/lib/schemas.ts`) — 출력 모양 코드로 못 박기
2. **프롬프트의 §출력 섹션은 schema와 1:1** — 키 이름·타입 같아야 함
3. **schema validation을 서비스 레이어에서 호출**해서 모델이 어겼을 때 재시도 또는 fallback

```ts
// src/lib/schemas.ts — 위저드별 출력 Zod
export const ExamCramOutput = z.object({
  plan: z.array(...),
  topics: z.array(...),
  watermark: z.literal("이 자료는 학습 보조용이며..."),
});
```

프롬프트에 `"watermark": "..."` literal 박아두고, schema에서 z.literal로 강제 → 누락 즉시 fail.

---

### 스킬 3. **근거 인용 의무화 (모든 출력)**

`evidence` 또는 `sourcePage` 필드를 **모든 생성 문장**에 붙인다.

지금까지: quiz만 evidence 의무. 다른 도구는 없거나 약함.

| 도구 | 근거 필드 | 검증 |
|---|---|---|
| summarize | `block.sourcePage`, `block.sourceQuote` (선택) | quote가 fullText의 substring |
| quiz | `evidence`, `evidencePage` | substring (이미 됨) |
| syllabus | `events[].sourceText` | 본문 인용 (있는 표현 그대로) |
| 발표 가이드 | `slide.references[]` — 자료 페이지 배열 | 페이지 번호가 자료 pages 안 |
| 시험 벼락치기 | `topic.basedOnMaterial` — 자료 ID 배열 | 자료 ID가 실재 |

근거 없으면 **출력 비공개 또는 confidence 낮춤**. 학생이 "이 추천 왜?"라고 물을 때 답할 수 있어야 신뢰됨.

---

### 스킬 4. **Few-shot 3쌍 이상 (입력 가변성 큰 도구)**

❌/✅ 1쌍은 부족. 자료 도메인·페르소나·요청 difficulty 가 다양하니 **케이스별 예시**가 필요.

기준:
- 도메인 다양성 ≥ 3 (어학·CS·인문 같은 식)
- 페르소나 다양성 ≥ 2 (1학년 vs 4학년)
- 실패 케이스 ≥ 1 (자료 부족·언어 혼란 등)

예시는 프롬프트 끝에 `## 예시 모음` 섹션으로. 너무 길면 별도 파일로 분리하고 import.

---

### 스킬 5. **Thinking 블록 (복잡한 위저드만)**

발표 가이드·시험 벼락치기·시험 후 회고처럼 **추론 단계가 여러 개**인 도구는 `<thinking>` 블록 활용.

```
출력 직전에 다음 순서로 머릿속 정리 (출력엔 포함 X):

<thinking>
1. 시험 범위와 남은 시간 파악
2. 자료별 단원 매칭
3. 우선순위 (시험 비중 × 학생 약점)
4. 시간 블록 분할
</thinking>

<output>
{ ...JSON... }
</output>
```

Anthropic SDK의 `extended_thinking` 옵션 (Sonnet 4.6 이상) 활성화 시 `<thinking>` 안의 토큰은 자동 hidden. SDK 옵션 안 켜면 그냥 두 블록을 출력시키고 `<output>` 만 파싱.

**언제 안 쓰나**: summarize·quiz 단순 추출 도구는 thinking 없이 직접 JSON.

---

### 스킬 6. **컨텍스트 부족 분기 (자료 0건 / 입력 부족)**

위저드가 의지하는 입력이 비었을 때 동작 명시:

```
## 거부 분기

다음 중 하나면 위저드 실행 X, UI 단계에서 차단:
- material 0건 (시험 벼락치기는 자료가 있어야 단원 추천 가능)
- step3_duration 입력 누락

다음이면 위저드 실행하되 confidence 낮추고 경고:
- material 있으나 fullText < 500자
- 페르소나 슬롯 절반 이상 비어있음
```

거부 시 출력:
```json
{
  "rejected": true,
  "reason": "시험 범위에 해당하는 자료가 없어요. 자료를 먼저 올려주세요.",
  "watermark": "..."
}
```

---

### 스킬 7. **N개 변형의 차이축 강제**

3개 출력하라면 단순 어미 변형 X. 미리 정의한 차이축에서 최소 N-1개가 달라야 함.

| 위저드 | 차이축 |
|---|---|
| quiz N문제 | 묻는 형식 / 자료 위치 / 인지 단계 |
| 발표 N슬라이드 | 목적 (도입·핵심·정리) / 매체 (텍스트·그림·예시) |
| 시험 벼락치기 N단원 | 비중 / 학생 약점 / 자료 분량 |

프롬프트에 차이축 표 명시 + 자체 검증에서 "차이축 N-1개 충족" 체크.

---

### 스킬 8. **모델 라우팅 — 단순/복잡 분리**

| 작업 종류 | 모델 | 이유 |
|---|---|---|
| 단순 추출 (요약·분류·키워드) | Haiku 4.5 | 비용 |
| 구조화 추출 (계획서 파싱) | Sonnet 4.6 | 표·날짜 정확도 |
| 검증·체크 | Haiku 4.5 | 룰 기반 |
| 창의적 생성 (발표·벼락치기) | Sonnet 4.6 | 품질 |
| 시험 후 회고 (분석+추천) | Sonnet 4.6 | 복합 추론 |

**무분별한 Sonnet 호출 = 무료 사용자당 월 5,000원 적자**. 의심되면 Haiku로 먼저 + 품질 확인.

---

### 스킬 9. **워터마크는 schema 레벨로 강제**

프롬프트에 적어두는 것만으론 부족. Zod `z.literal()`로 못 박는다.

```ts
const WATERMARK = "이 자료는 학습 보조용이며, 직접 검토·수정해서 본인 것으로 만드세요." as const;

export const WizardOutput = z.object({
  ...,
  watermark: z.literal(WATERMARK),
});
```

위저드 종류별로 약간씩 변형(시험 벼락치기엔 "시험에서 본인 풀이로 다시 풀어보세요" 추가 등) — 그래도 schema에서 정확히 매칭 강제.

---

## 2. 위저드 신설 시 — 작업 체크리스트

| 단계 | 산출물 | 위치 |
|---|---|---|
| 1. 사활 정의 | 1줄 사활 라인 | 프롬프트 §절대 규칙 첫 줄 |
| 2. 입력 슬롯 명세 | TypeScript interface | 프롬프트 §입력 슬롯 + service 함수 시그니처 |
| 3. 출력 Zod schema | z.object | [src/lib/schemas.ts](../../lib/schemas.ts) |
| 4. 프롬프트 9단 작성 | `.md` 파일 | `src/prompts/{slug}.md` |
| 5. 서비스 함수 | 4-Layer (Storage→Parse→AI→Validate→Persist) | `src/lib/services/{slug}.ts` |
| 6. API route | `POST /api/wizards/{slug}` | `src/app/api/wizards/{slug}/route.ts` |
| 7. UI 위저드 컴포넌트 | 단계별 폼 + 결과 화면 | `src/app/dashboard/tools/{slug}/` |
| 8. 결과 저장 | generations 테이블 + payload | service에서 insert |
| 9. Few-shot 3쌍 | ✅/❌ 예시 | 프롬프트 끝 |
| 10. 비용 측정 | input·output·cache 토큰 / generations 테이블 | claude.ts 자동 기록 |

[docs/ARCHITECTURE.md §2 4-Layer](../../../docs/ARCHITECTURE.md) 그대로 복제.

---

## 3. 기존 프롬프트 보강 — 빠진 키 진단

|     | summarize | quiz | syllabus | timetable | presentation |
|---|---|---|---|---|---|
| 사활 정의 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Zod schema | ✅ | ✅ | ✅ | ✅ | ⚠ 부분 |
| 근거 인용 | ⚠ 약함 | ✅ | ✅ | n/a | ⚠ 약함 |
| Few-shot ≥ 3쌍 | ❌ 1쌍 | ❌ 1쌍 | ❌ 1쌍 | ✅ | ❌ 1쌍 |
| Thinking | ❌ | ❌ | ❌ | ❌ | ⚠ 도움될 듯 |
| 거부 분기 | ✅ | ✅ | ✅ | ✅ | ⚠ 약함 |
| 차이축 명시 | n/a | ✅ | n/a | n/a | ⚠ 약함 |

→ 즉시 손볼 것: **few-shot 확장**·**summarize 근거 인용**·**presentation Zod·차이축**.

---

## 4. 윤리·법무 라인 (CLAUDE.md §4·§5)

모든 위저드가 어겨선 안 되는 선:

- **본문 직접 작성 금지** — 리포트·자기소개서·발표 대본 풀텍스트 X. 구조·체크리스트만
- **워터마크 누락 = 출력 거부** (schema 레벨)
- **학교명·교수명 추정 금지** — 자료에 없으면 null
- **타 학생 비교·학점 예측 금지** — 데이터 없음
- **저작권 의심 자료 거부** — fullText에 "교과서 OOO" 같은 식별자 + 본문이 출판물 패턴이면 confidence 낮추고 warning

---

## 5. 토큰·비용 가드

각 위저드 호출은 [generations 테이블](../../lib/data/activity.ts) 에 토큰 기록.

자체 가드:
- input token > 100k → 자료 분량 너무 많음. summarize 먼저 돌리고 그 결과로 위저드 호출 (체이닝)
- output > 4k → JSON schema 너무 큼. 더 작은 단위로 분할

호출자가 토큰 한도 초과하면 호출 거부 (사용자 한도 초과 메시지).

---

**문서버전**: 2026-05-12
**다음 갱신**: 위저드 4종 추가 후 빈 칸 채우면서
