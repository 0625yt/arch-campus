# Quiz 모델 Haiku vs Sonnet 비교 테스트 (2026-05-16)

> 스프린트 #4 — `claude-sonnet-4-6`이 quiz 생성에 과한가 검증.
> 진단 리포트 P0 #2 (적자 직결, 무료 사용자 1인당 월 ~5,000원).
> 검증 셋업 완료 → 사용자 수기 N=10 비교 단계.

---

## 셋업 — 완료

`QUIZ_MODEL` 환경변수로 quiz tool만 모델 분기:

- 기본값(unset 또는 `sonnet`): `claude-sonnet-4-6` (현재 운영)
- `haiku`: `claude-haiku-4-5`
- 다른 tool(summarize·timetable 등)은 영향 없음
- 한 줄 환경변수 변경으로 즉시 롤백 가능

구현: [src/lib/claude.ts](../../src/lib/claude.ts) `resolveModel()` + `getModelIdFor()` export.
사용처: [src/lib/services/quiz.ts](../../src/lib/services/quiz.ts):2,111

---

## 사용자 수기 테스트 방법

### 1. 자료 3~5개 고정

본인 보유 자료 중 다음 도메인 1개씩 골라 `materials`에 업로드:

- [ ] 영어 어휘 (난이도: 쉬움)
- [ ] CS·프로그래밍 (난이도: 보통)
- [ ] 수학·통계 (난이도: 어려움)
- [ ] 인문·사회 (선택)
- [ ] 강의 안내 (선택)

각 자료의 `materialId` 메모.

### 2. Sonnet baseline (현재 상태)

`.env.local`에 `QUIZ_MODEL` 미설정(또는 `=sonnet`) 상태에서 자료별로 퀴즈 생성 N=5회. 결과 캡처:

| 자료 | 시도 | Zod 통과 | validateQuiz 통과 | 출처 근거 정확 | 비용 |
|---|---|---|---|---|---|
| 영어 어휘 | 1 | ✓/✗ | ✓/✗ | ✓/✗ | $X.XXXX |
| ... | ... | | | | |

비용은 [src/lib/data/jobs.ts](../../src/lib/data/jobs.ts)의 `logGeneration` row에서 확인. Supabase Dashboard → `generations` 테이블 → `cost` 컬럼.

### 3. Haiku 전환 후 동일 N=5회

`.env.local`에 추가:
```
QUIZ_MODEL=haiku
```

dev server 재시작(`npm run dev`). 같은 자료들로 N=5회 반복. 같은 표에 기록.

### 4. 판단 기준 (사전 합의)

- **Zod 통과율 ≥ 90%** + **출처 근거 정확도 ≥ 85%** → Haiku로 전환 결정 (#5 prod 적용)
- 80~90% 사이 → prompt 보강(예시 추가) 후 N=5회 재시도
- < 80% → GPT-4.1 mini 후보로 이동 검토 (별도 셋업 필요)

### 5. 롤백

문제 발견 시 `.env.local`에서 `QUIZ_MODEL` 줄 제거 또는 `=sonnet`. 재시작. **즉시 원복**.

---

## 비용 계산 메모

quiz 호출당 평균 토큰 추정 (현재 prod 로그 기준 — `generations` 테이블에서 확인):

- prompt cache hit 일관 ≥1회/시간일 때 cacheRead가 input의 80~90% 차지
- 보통 quiz 1회: input ~3K (cached) + output ~2K

Sonnet 1회 비용 추정: `(3000 × 0.3 + 2000 × 15) / 1M = $0.0309`
Haiku 1회 비용 추정: `(3000 × 0.08 + 2000 × 4) / 1M = $0.00824`

→ **3.7배 절감**. 사용자 1인당 학기 50회 가정 시 학기당 $1.55 → $0.41 ($1.14 절감). 무료 사용자 1000명 = 학기당 $1140 (≈ ₩155만) 절감.

---

## 다음

1. 사용자 자료 5개 고정 + N=5×2 = 10회 비교
2. 결과 위 표 채워서 본 문서 업데이트
3. 판단 기준 통과 시 #5 prod 적용 (별도 작업 — `.env.local`이 아니라 Vercel env에 `QUIZ_MODEL=haiku` 박기)
4. 통과 못하면 prompt 보강 또는 GPT-4.1 mini 후보 검토
