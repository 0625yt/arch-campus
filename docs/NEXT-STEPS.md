# 모델·정확도 다음 단계 (2026-05-28)

> **목적**: [MODEL-OPTIONS.md](MODEL-OPTIONS.md) 결론(퀴즈 고빈도·Vision 99.9%)에서 도출된 3가지 next step의 **실행 가능한 spec + 승인 요청 자료**.
> **상태**: 설계·조사만. 실제 코드 변경은 각 항목 §6대로 사용자 승인 후 별도 PR.

---

## 1. Upstage Document Parse 학교 무료 PoC

### 1-1. 적격성 (web 1차 확인)

[Upstage × AWS AI Initiative](https://www.upstage.ai/events/ai-initiative-2025-en) 기준:

| 대상 | 자격 |
|---|---|
| K-12 학교·대학 | ✅ 명시 |
| 대학병원 | ✅ 명시 |
| NPO/NGO | ✅ 명시 |
| **arch-campus(1인 빌더, 상용 지향)** | ⚠ 명시 외 — 신청 가능하지만 거절 가능성 |

**현실 판단**: 신청 자체는 무료고 코드 변경 X. 거절되면 유료로 진행 — Parse $0.01/페이지 + Extract $0.03 → 학기 초 시간표 100건 추출 ~5,600원으로 비용 부담 작음.

### 1-2. 받는 것

- Solar Pro 2/3 (LLM) + **Document Parse** 1년 무료
- 교육 콘텐츠 + 선택적 멘토링·워크숍
- 모집 마감: **2027-03-31**

### 1-3. 신청 절차

3단계 — ① 양식 제출 → ② 내부 심사 → ③ 승인 시 이메일 안내. 문의: contact@upstage.ai

### 1-4. 신청 시 강조할 명분 (제안)

- "한국 대학생 전용 AI 학기 운영 서비스" 포지셔닝
- 한국 대학 시간표·강의계획서 표준화가 제품 핵심 가치 ([PRODUCT.md](PRODUCT.md) §1)
- Upstage가 한국어 문서 파싱에 강한 만큼, 학교별 양식 다양성을 평가셋으로 누적 가능
- 사용자가 학생이라 비상용 학습 보조 성격 (cheat 방지 가드, [CLAUDE.md](../CLAUDE.md) §4)

### 1-5. 승인 받을 사항

- [ ] **PoC 신청 자체 진행 여부** — 코드 변경 0, 신청 양식만. 거절 위험은 정보 누락 없음.
- 거절 시 fallback: 유료 + 우리 결제 카드로 계속 진행할지 판단.

---

## 2. 퀴즈 Gemini 2.5 Flash A/B 설계

### 2-1. 동기

- 학기당 자료 40+ × 퀴즈 = Sonnet 단가로 ~9,920원/인 ([COST.md §5](COST.md))
- Gemini 2.5 Flash 단가: 입력 $0.30 / 출력 $2.50 (Sonnet 대비 입력 1/10, 출력 1/6)
- 변별력·함정·evidence 정확도가 유지되면 학기 비용 ~1,600원/인으로 떨어짐 (절감 ~83%)

### 2-2. 전환 조건 (블라인드 통과 시에만)

같은 자료 N개로 Sonnet vs Flash 퀴즈를 나란히 생성 → **다음 4개 모두 동등 이상이어야 전환**:

1. **변별력**: 정답률 분포가 너무 쉽거나/너무 어렵지 않음 (목표 정답률 50~75%)
2. **evidence 정확도**: 모든 문제 `evidence`가 자료 본문 substring 매칭 통과 ([quiz.md §1](../src/prompts/quiz.md))
3. **함정 선택지 품질**: 4개 보기가 모두 다른 표현, "전부 정답" 류 제거
4. **한국어 어휘·표현**: 어색한 직역·문법 오류 없음

### 2-3. 평가 메트릭 (자동화 가능한 것)

- evidence substring 매칭률 (목표 100%)
- 보기 4개 중복 검사 (정확히 1개 정답)
- 한국어 자료에서 stem 한국어 비율
- 출력 길이·JSON 스키마 위반 0
- **추가**: 모델별 단가로 환산한 실제 비용 (`estimateCost`)

이건 우리 코드의 `validateQuizQuestions` (있다면) 또는 새로 작성하는 평가 스크립트로 측정.

### 2-4. 구현 마운트포인트 (코드 변경 시)

1. **AI Gateway 도입** ([MODEL-OPTIONS.md §5](MODEL-OPTIONS.md)) — `@ai-sdk/gateway` 또는 `@ai-sdk/google` 추가. `claude.ts` `resolveModel`에 Gemini 분기.
2. **env 플래그**: `QUIZ_MODEL_GEMINI=1` 일 때 Flash로 라우팅 — 작은 사용자 그룹에 먼저.
3. **A/B 로깅**: `generations` 테이블에 `model_provider` 컬럼 추가 (마이그레이션 필요), 평가셋과 매칭.
4. **`PRICING`에 Gemini Flash 단가 추가** — `estimateCost`가 벤더별로 분기.

### 2-5. 트레이드오프

- ✅ 학기 비용 ~83% 절감 (Sonnet 적자 위험 제거)
- ⚠ 멀티벤더 운영 복잡도 ([MODEL-OPTIONS.md §5](MODEL-OPTIONS.md))
- ⚠ 한국어 위저드 문체는 Claude 평판 우위 — **퀴즈만 전환, 위저드는 Sonnet 유지**
- ⚠ 캐시 의미 차이: Anthropic 1h ephemeral vs Gemini 캐시 미확인 → 첫 호출 비용 보수적 계산

### 2-6. 승인 받을 사항

- [ ] AI Gateway 또는 `@ai-sdk/google` 도입 (의존성 추가)
- [ ] `model_provider` 컬럼 마이그레이션
- [ ] 블라인드 A/B 실행 자료 (자료 5~10개 골라줘)

---

## 3. HITL Confidence UI (시간표·강의계획서 신뢰 보호)

### 3-1. 왜 필요한가

업계 합의: 단일 LLM 호출로 99.9% 추출은 불가. 우리 제품에서 일정 1개 누락 = 신뢰 붕괴 ([MODEL-OPTIONS.md §4](MODEL-OPTIONS.md)).

**현재 상태**: 우리 `syllabus-import-flow`·`timetable-import-flow`가 이미 "추출 → 확인 → 저장" 패턴이라 confirm 화면이 있음. **여기에 confidence 정보만 얹으면 됨** — 큰 UI 변경 X.

### 3-2. 데이터 흐름

```
LLM Vision 추출 (Sonnet 4.6 또는 Gemini Pro)
  → 각 필드(과목·요일·시간·시험일)에 confidence 점수 동봉
  → confirm 화면에서 confidence별 색 분기:
     - ≥0.9: 평소처럼 표시
     - 0.7~0.9: 노란 배지 ("확인 필요")
     - <0.7: 빨간 배지 ("자동 인식 어려움 — 직접 입력")
  → 사용자가 노란/빨간만 보고 수정
  → 저장 시 (final_value, original_extracted, confidence)를 attempts/audit_log에 누적
  → 학교별 정확도 추적 → 다음 양식 추출 품질 개선 재료
```

### 3-3. confidence 계산 방법 (옵션)

LLM이 직접 confidence를 반환하는 건 신뢰도 낮음. 권장은 **간접 측정 2종**:

1. **다중 샘플 합의** (가장 표준) — 같은 입력을 2~3번 호출 → 일치 비율을 confidence로
   - 비용 2~3배지만 시간표 추출은 학기 초 1회성이라 부담 작음
2. **cross-ref 검증** — 요일 범위 1~5, 시간 0~23, 학기 시작/종강 사이인지 — 위반 시 confidence 강제 하향

### 3-4. 스키마 변경

- `syllabus_imports`·`timetable_imports` 테이블(있다면)에 `field_confidence: jsonb` 컬럼 추가
- Zod 스키마(`schemas.ts`)에 각 필드 옆 `confidence: z.number().min(0).max(1).optional()` 추가
- 마이그레이션 1건 필요

### 3-5. UI 변경 (작음)

- `syllabus-import-flow.tsx` confirm 단계의 각 row에 confidence 배지 SVG/이모지 X
- "낮은 confidence만 보기" 토글 (필드가 많을 때 사용자 부담 줄임)
- 저장 버튼 옆 "확인 필요 N개 남았어요" 카운터

### 3-6. 트레이드오프

- ✅ 신뢰 보호 — 99% 달성 불가능한 자동화를 "사용자 확인 1단계"로 흡수
- ✅ 학교별 정확도 데이터 누적 (평가셋) — 다음 모델 선택의 근거
- ⚠ 다중 샘플 도입 시 Vision 호출 비용 2~3배 — 단 학기 초 1회성이라 영향 작음
- ⚠ 사용자 UX 추가 마찰 (확인 화면 시간 +) — 단 우리 confirm flow는 이미 있음

### 3-7. 승인 받을 사항

- [ ] confidence 컬럼 마이그레이션 (한 건)
- [ ] 다중 샘플 합의 방식 도입할지 (비용 2~3배 vs cross-ref만)
- [ ] 빨간 배지(<0.7) 필드는 자동 저장 막을지(사용자가 명시 수정해야 통과)

---

## 4. 우선순위 권고 (리스크·효과 종합)

| 순서 | 항목 | 비용 변경 | 코드 변경 | 효과 |
|---|---|---|---|---|
| 1 | Upstage PoC 신청 | 0 | 0 | 잘하면 1년 무료 Vision 추출 |
| 2 | HITL confidence UI | 마이그레이션 1 | 작음 (UI·스키마) | 정확도 체감 ↑, 신뢰 보호 |
| 3 | 퀴즈 Gemini A/B | 의존성·마이그레이션 | 중간 (멀티벤더 분기) | 학기 ~83% 절감 (조건부) |

순서를 바꿀 이유가 없다면 1·2·3 순. 1은 신청만이라 지금 바로 가능.
