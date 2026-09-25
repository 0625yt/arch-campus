# AI 비용 실측·추정표 (2026-07-24 갱신)

> **2026-09-17 감사 메모:** 아래 비용·A/B 수치는 기록된 당시 조건이다. 현재 가격·운영 환경·생성 품질을 재검증한 수치로 해석하지 않는다. 실제 모델 선택은 `src/lib/claude.ts`의 `getModelIdFor()`/`resolveModel()`이며 `TOOL_MODEL`만으로 판단하면 틀릴 수 있다. 이번 연결/모델 가용성 검사와 남은 비용 보호는 [점검 보고서](audit/2026-09-17-feature-audit.md)에 기록한다.

> **목적**: 기능별로 어떤 모델을 쓰고, 1회 호출당 원가가 얼마이며, 프로덕션에서 실제로 얼마 나가는지 한눈에.
> **근거**: 단가는 [src/lib/claude.ts](../src/lib/claude.ts)의 `PRICING` 상수(코드 실측), 모델 매핑은 `resolveModel()`/`TOOL_MODEL`/`GEMINI_BY_TOOL`, 토큰 상한은 각 서비스 `maxTokens`·본문 cap. **§2는 프로덕션 `generations` 테이블 실측**(2026-05-10~07-23, 234행, $20.18).
> **주의**: 이 문서는 정산용이 아니라 모델 선택·적자 통제 판단용이다. 실측은 매 호출 `estimateCost()`가 `generations`에 남긴다.

---

## 0. 단가 (per 1M tokens, USD) — 코드 `PRICING` 실측

| 티어 상수 | 모델 | 입력 | 캐시 write(1h) | 캐시 read | 출력 | 담당 |
|---|---|---|---|---|---|---|
| **`flashLite`** | **Gemini 3.5 Flash-Lite** | **$0.30** | 0 | 0 | **$2.50** | ★대부분(저비용) |
| **`flash36`** | **Gemini 3.6 Flash** | **$1.50** | 0 | 0 | **$7.50** | 위저드 |
| **`gemini31Pro`** | **Gemini 3.1 Pro** (`preview`) | **$2.00** | 0 | 0 | **$12.00** | Vision(시간표·강계) |
| `haiku` | Claude Haiku 4.5 | $1.00 | $2.00 | $0.10 | $5.00 | (라우팅 미사용 — env 원복용) |
| `sonnet` | Claude Sonnet 4.6 | $3.00 | $6.00 | $0.30 | $15.00 | (env 원복용) |
| `flash` | Gemini 2.5 Flash | $0.30 | 0 | 0 | $2.50 | (미사용) |
| `flashLite31` | Gemini 3.1 Flash-Lite | $0.25 | 0 | 0 | $1.50 | (더 싼 대안, 미사용) |
| `geminiPro` | Gemini 2.5 Pro | $1.25 | 0 | 0 | $10.00 | (LLM_VENDOR=google 시 일부) |

> **2026-07-24 대개편**: Claude를 라우팅에서 전면 걷어냄(전부 Gemini). Claude tier(haiku·sonnet)는 env 원복(`QUIZ_GRADE_MODEL=haiku` 등) 안전판으로만 남김.
> 3.1 Pro는 **thinking budget 512**로 호출(실측: 시간표 정확도 유지하며 56초→10초). 3.6 Flash·Flash-Lite는 thinking 자동.
> Gemini는 명시 캐시 API를 안 써서 캐시 컬럼 0(보수적). 켜면 더 내려간다.

- **환율 가정**: $1 = 1,400원.

---

## 1. 기능별 현재 모델 (코드 `resolveModel()` 실측, env override 없는 기본값)

> 아래는 **로컬·코드 기본값**. 프로덕션이 이와 다르려면 Vercel env에 `LLM_VENDOR=google` 또는 도구별 `*_MODEL_VENDOR`/`*_MODEL`이 설정돼야 한다(§4 참고).
> ✅ **2026-07-24 prod env 실측 확인**(`vercel env pull production`): `LLM_VENDOR=""`(빈 문자열 → `google` 아님), 도구별 override·thinking env **전부 미설정**. 따라서 **prod 실제 라우팅 = 아래 코드 기본값 그대로**. (prod에 `GEMINI_BY_TOOL` 폴백은 안 탐 — `LLM_VENDOR`가 빈 문자열이므로.)

2026-07-24 전면 개편으로 **모든 도구가 Gemini**. 실측 A/B 근거는 §9.

| 기능(tool) | 현재 모델 | 실측 근거 | 원복 스위치 |
|---|---|---|---|
| **quiz** (문제 생성) | **3.5 Flash-Lite** | 강화 파이프라인이 약점 덮음 | `QUIZ_MODEL_VENDOR=anthropic` → Sonnet |
| summarize (요약) | 3.5 Flash-Lite | 환각 0·6초 (실측) | `SUMMARY_MODEL_VENDOR=anthropic` → Haiku |
| chat (자료 RAG 챗) | 3.5 Flash-Lite | 함정질문 3/3 정직(환각0) | `CHAT_MODEL=haiku\|sonnet` |
| chat-free (자유 챗) | 3.5 Flash-Lite | 최고빈도·단순 | `CHAT_FREE_MODEL=haiku\|sonnet` |
| exam-extract (기출 추출) | 3.5 Flash-Lite | 본문 전사 | `EXTRACT_MODEL=haiku\|sonnet` |
| **exam-solve (기출 풀이)** | 3.5 Flash-Lite | 정답 20/20(어려움 포함) | `EXAM_SOLVE_MODEL=haiku\|sonnet` |
| **report-structure (리포트 구조)** | 3.5 Flash-Lite | validateOutput 4/4(물음표가드) | — |
| **quiz-grade / quiz-verify (채점·검수)** | 3.5 Flash-Lite | 3모델 판정 정확도 동일 | `QUIZ_GRADE_MODEL=haiku` / `QUIZ_VERIFY_MODEL=haiku` |
| event-parse (자연어→일정) | 3.5 Flash-Lite | 정형 변환 | `EVENT_PARSE_MODEL_VENDOR=anthropic` → Haiku |
| pdf-ocr | 3.5 Flash-Lite | OCR | `PDF_OCR_VENDOR=anthropic` → unpdf |
| **presentation·wizard-assignment/exam/cram (위저드)** | **3.6 Flash** | 산문·분량 안정성 우위(재검증 §9-1: 프롬프트 개선 후 양쪽 100%나 3.6 Flash가 산문 품질 낫고 저빈도) | — |
| **syllabus-extract·timetable-extract (Vision)** | **3.1 Pro** (thinking 512) | 시간표 요일 9/9(Flash-Lite 오추출) | `SYLLABUS_MODEL=haiku\|sonnet` |
| post-mortem (회고) | Haiku 4.5 | ⚠️ 실제 AI 호출 0건(미구현) | — |

> **Claude는 라우팅에서 완전히 빠짐.** 남은 건 env 원복 안전판뿐. 이번 세션 내내 발목 잡던 Anthropic 크레딧 의존에서 벗어남.

> **quiz 파이프라인 주의**: quiz 1회 생성 = 청크 병렬 호출(1~4) + 보충(최대 5) + 2차 검수(Haiku) → 여러 모델 호출이지만 `generations`엔 **한 행으로 합산 기록**. 아래 §2·§3의 quiz 토큰/비용은 이 합산치다.

---

## 2. ★ 프로덕션 실측 (generations 테이블, 2026-05-10~07-23, 234행, 총 $20.18)

기간 중 라우팅이 여러 번 바뀌어(모델 열에 혼재) **과거 비용**이다. 앞으로의 예상은 §3.

| 기능 | 행수 | 총비용 | 비중 | ok/err | 그 기간 쓰인 모델(행수) |
|---|---|---|---|---|---|
| **quiz** | 99 | **$16.13** | **79.9%** | 68/31 | Sonnet 4.6 ×59, Gemini 2.5 Pro ×37, 2.5 Flash ×3 |
| summarize | 89 | $2.37 | 11.7% | 57/32 | Haiku ×51, 2.5 Flash ×25, unknown ×13 |
| timetable | 20 | $0.76 | 3.8% | 11/9 | Haiku ×12, Sonnet ×6, Pro ×2 |
| presentation | 4 | $0.41 | 2.0% | 3/1 | Sonnet 4.6 ×4 |
| exam-extract | 3 | $0.16 | 0.8% | 2/1 | 2.5 Flash ×2, Pro ×1 |
| syllabus | 8 | $0.10 | 0.5% | 4/4 | Haiku ×7, Pro ×1 |
| chat-free | 9 | $0.09 | 0.5% | 9/0 | Haiku ×9 |
| report-structure | 1 | $0.09 | 0.5% | 1/0 | Sonnet 4.6 ×1 |
| exam-solve | 1 | $0.06 | 0.3% | 1/0 | Pro ×1 |

**핵심 사실**:
- **quiz가 전체 비용의 79.9%** — 여기를 줄이는 게 압도적으로 중요 → 2026-07-24 Flash-Lite로 확정.
- **에러율이 높다**: quiz 31/99(31%), summarize 32/89(36%), timetable 9/20, syllabus 4/8. err 행도 토큰을 쓸 수 있어 비용에 포함됨. **에러율 자체가 별도 개선 과제**(재시도·파싱 실패 원인 추적).
- 성공 quiz 1건 평균: 입력 **31,268토큰** / 출력 **9,196토큰** (청크+보충+검수 합산), 평균 **$0.176/건**.

---

## 3. ★ 새 라우팅(2026-07-24 FIX) 예상 비용 — 실측 평균 토큰 × 신규 단가

같은 자료 밀도(§2 성공 호출 평균 토큰)를 **현재 모델 단가**로 다시 계산:

신규 Flash-Lite 단가는 **3.5 = $0.30/$2.50** (quiz 검증 모델).

| 기능 | 평균 입력 | 평균 출력 | 과거 실제 avg | **신규 모델** | **신규 avg** | 변화 |
|---|---|---|---|---|---|---|
| **quiz** | 31,268 | 9,196 | $0.1764 | Gemini 3.5 Flash-Lite | **$0.0324** | **−82%** |
| summarize | 15,370 | 3,762 | $0.0298 | 3.5 Flash-Lite | $0.0140 | −53% |
| chat-free | 9,555 | 391 | $0.0105 | 3.5 Flash-Lite | $0.0038 | −64% |
| exam-extract | 7,693 | 10,263 | $0.0280 | 3.5 Flash-Lite | $0.0280 | ~0%¹ |
| presentation | 9,974 | 2,880 | $0.1121 | **Gemini 3.6 Flash** | $0.0366 | **−67%** |
| report-structure | 7,287 | 1,891 | $0.0927 | 3.5 Flash-Lite | $0.0069 | **−93%** |
| timetable | 9,436 | 1,669 | $0.0585 | **Gemini 3.1 Pro** | $0.0389 | −33% |
| syllabus | 9,152 | 1,099 | $0.0180 | **Gemini 3.1 Pro** | $0.0315 | **+75%²** |
| exam-solve | 8,093 | 4,844 | $0.0586 | 3.5 Flash-Lite | $0.0145 | **−75%** |

**정직하게 짚을 점**:
- **quiz −82%**가 전체 절감의 핵심 (과거 Sonnet 혼재 → 3.5 Flash-Lite). 실제 파이프라인엔 검수(2차)가 섞여 $0.0324보다 아주 약간 높다(검수 토큰 작아 무시 가능).
- ¹ **exam-extract ~0%**: 과거에 이미 Gemini Flash($0.30/$2.50)로 돌아 3.5 Flash-Lite와 단가 동일. 절감 없음(정직히 표기).
- ² **syllabus "+75%"는 착시**: 과거엔 대부분 **Haiku**로 돌아 실제 avg가 $0.018로 낮았을 뿐. 신규 Vision은 **3.1 Pro**($2/$12)라 단가는 올랐지만, 시간표 요일 오추출(=일정 누락) 방지가 정확도 사활이라 감수. 절대액은 건당 $0.03로 여전히 낮음.
- **presentation −67%·report −93%**: 과거 Sonnet 4.6 → 발표는 3.6 Flash, 리포트구조는 Flash-Lite. 값은 코드 `estimateCost` 실측.
- exam-solve/syllabus는 표본 1~수 건이라 평균 신뢰구간 넓음. 위 신규 avg는 코드로 재계산한 값.

**★ 모델 ID 정정(2026-07-24)**: 초기엔 quiz를 `gemini-3.1-flash-lite`($0.25/$1.50)로 넣었으나, **A/B·강화 파이프라인 검증은 `gemini-3.5-flash-lite`로 했음**을 확인 → prod도 3.5로 통일(검증 모델=배포 모델 일치가 사활). 3.5가 3.1보다 품질 확실히 상위(Google 공식)지만 단가는 약간 높음. 3.1은 `flashLite31` tier로 코드에 남겨둠(품질 덜 민감한 초저비용 대안).

**전체 예상 절감**: quiz만 과거 $16.13 → 같은 건수·토큰이면 **~$2.96**(3.5 기준). 다른 도구 절감까지 합쳐 이번 라우팅으로 **AI 비용을 대략 1/3~1/4 수준으로** 낮춘다(자료 밀도·에러율 동일 가정).

---

## 4. 프로덕션이 코드 기본값과 다를 수 있는 이유

`resolveModel()` 우선순위: **① `LLM_VENDOR=google` 전역 스위치** → 모든 도구 Gemini(단 quiz는 예외로 Flash-Lite) → **② 도구별 `*_MODEL_VENDOR`** → **③ 도구별 `*_MODEL` 티어**. 로컬 `.env.local`엔 이 변수들이 **하나도 없어** 코드 기본값(§1)이 그대로다. **프로덕션(Vercel) env는 이 문서에서 확인 불가** — 실제 prod 모델을 100% 확정하려면 `vercel env ls` 또는 대시보드를 봐야 한다. §2 실측에서 quiz가 과거 Pro·Flash로도 돌았던 건 그 기간 prod env가 달랐다는 증거.

---

## 5. 토큰·본문 cap (코드 실측)

| 서비스 | maxTokens(출력) | 본문 입력 cap |
|---|---|---|
| quiz (청크당) | 8,192 | `compactForQuiz` 120,000자(초과 시 5구간 균등 샘플링) |
| quiz-verify | min(8192, 700+n×150) | — |
| summarize | 81,920 | — (Flash 64K+ 출력 대응) |
| exam-extract | 32,000 | 160,000자 |
| exam-solve | 32,000 | — |
| presentation / report-structure / report-checklist | 4,096 | 자료당 6,000자 |
| exam-cram | 4,096 | 자료당 8,000자 |
| book-review | 3,200 | 메모당 600자 |
| syllabus | 4,096 | 80,000자 |
| timetable | 4,096 | 이미지(Vision) |
| chat | 1,500 | 발췌 RAG |
| chat-free | 1,200 | 질문 500자 |

---

## 6. 적자 분기점 (무료 사용자 1인 월)

CLAUDE.md §1 "무료 1인 월 5,000원 적자선" 기준. **quiz Flash-Lite 전환 후** 재계산:

- 과거: quiz 10문제 ~$0.176(~246원) → 학기 40자료면 ~9,840원/인.
- **신규: quiz ~$0.032(~45원) → 학기 40자료면 ~1,800원/인**. 월 ~450원. 적자선 대비 여유 대폭 확보.
- 요약도 Flash-Lite로 53% 절감. **이제 적자 주범이던 quiz가 통제권 안으로 들어옴.**

---

## 7. 비용 절감 레버 (적용 중 + 남은 것)

- ✅ **quiz·요약·챗·추출 Flash-Lite** (2026-07-24) — 최대 레버.
- ✅ **본문 cap** (quiz 120k / exam-extract 160k / syllabus 80k자).
- ✅ **1h prompt 캐시** (Anthropic 룰), quiz 자료 본문 `cacheUserInput`.
- ✅ **의미 dedup** — 중복 문제 재생성 낭비 차단(품질+비용 겸용).
- 🔲 **에러율 감축** — quiz 31%·summarize 36% err는 재시도 토큰 낭비. 파싱 실패 원인 추적 필요.
- 🔲 무료 티어 월 호출 쿼터(현재 rate-limit만, 비용 쿼터 미구현).

---

## 8. 검증 방법

매 호출 `estimateCost(usage, modelId)`가 `generations.cost_usd`에 기록. `model_id`·`model_provider`도 함께. 이 문서 §2·§3 재현:
```bash
# generations 테이블을 tool·model별로 집계 (service-role 필요)
```
dev에서 `[claude.cache]` 로그로 입력·출력·캐시 히트율 확인. 추정과 실측이 2배 이상 벌어지면 재조정.

---

## 9. ★ 모델 선택 A/B 실측 로그 (2026-07-24, 실제 API 호출)

모든 라우팅 결정을 **실제 사용자 자료로 돌려** 검증. 임시 하네스는 `src/lib/eval/`에 짜서 돌리고 정리(잔재 X).

| 도구 | 테스트 | 결과 → 결정 |
|---|---|---|
| 요약 | 대용량 PDF(93p·35.9k자) 5모델 | 3.5 Flash-Lite: 6초·환각0(조사 제거 후 100%). **Flash-Lite** |
| exam-solve | 정답 아는 문제 20개 채점 | Flash-Lite 20/20(어려움 미분·조합 포함). **Flash-Lite** |
| 자료 챗 | 함정질문(자료에 없는 것) 3개 | Flash-Lite 3/3 "자료에 없어요"(환각0). **Flash-Lite** |
| 채점·검수 | 골든 판정셋 grade 8·verify 4 | 3.6 Flash=Flash-Lite=3.1 Pro 정확도 동일. **Flash-Lite**(10배 쌈) |
| 리포트구조 | validateOutput(물음표 치팅가드 포함) | Flash-Lite 4/4(Sonnet 5 3/4). **Flash-Lite** |
| **발표**(재검증 완료) | validateOutput 6회×조건별, 실제 API | ↓ 아래 표 상세. **3.6 Flash 유지** + 코드 2건 수정 |
| **시간표 Vision** | 실제 시간표 이미지, 요일 채점 | Flash-Lite 8.5/9(요일 오추출), **3.1 Pro 9/9**. **3.1 Pro** |
| **3.1 Pro thinking** | budget 자동 vs 512 vs 128 | 512로 정확도 유지 + 56초→10초(5.6배). **thinking 512** |

### 9-1. 발표 위저드 재검증 (2026-07-24 심층) — 이전 진단 정정

이전 로그는 "Flash-Lite가 슬라이드 5장만 만들어 탈락"이라 적었으나, **실제 API를 6회씩 반복 호출해 파고들어 보니 그 진단은 틀렸다.** 실패의 진짜 원인은 두 엔지니어링 결함이었다:

| 조건 | Flash-Lite 3.5 | 3.6 Flash | 병목 |
|---|---|---|---|
| maxTokens 4096 | 2/12 (17%) | 8/12 (67%) | 3.6 Flash 출력 4096 초과 → **JSON 잘림** |
| maxTokens 6144 | 2/6 (35%) | 4/6 (67%) | 양쪽 `outline.structure=too_small` — 제목/마무리 슬라이드 얇게 |
| **프롬프트 개선 후** | **6/6 (100%)** | **6/6 (100%)** | "표지/마무리도 항목 최소 3개" 강제 규칙 1줄 추가 |

- **수정 1**: [presentation.ts](../src/lib/services/presentation.ts) `maxTokens: 4096 → 6144`. 3.6 Flash가 개선 후 최대 5,655토큰 출력 → 4096이면 잘림.
- **수정 2**: [presentation.md](../src/prompts/presentation.md) 정량 가드레일에 "표지·마무리 슬라이드도 예외 없이 structure 최소 3개" + purpose 최소 길이 강제.
- **결정**: 발표는 **3.6 Flash 유지**. 속도는 Flash-Lite(6초)가 3배 빠르나, 산문 품질·분량 안정성에서 3.6 Flash가 낫고 위저드는 저빈도라 속도 비용 감수.

**핵심 교훈**: 텍스트 작업은 Flash-Lite로 거의 다 충분. **Vision만 Flash-Lite가 약해** 3.1 Pro 필요. 발표 실패는 모델 지능이 아니라 **프롬프트 명세·maxTokens 부족**이었다 — 고치니 양쪽 100%.

> ⚠️ **Anthropic 크레딧 부족**으로 이번 세션 A/B는 Gemini끼리만 비교(Claude 직접 비교는 크레딧 채운 뒤).
> ⚠️ **prod 실 배포 검증 미실시**: 발표 개선(maxTokens·프롬프트)은 코드 반영·로컬 재검증까지 완료. prod URL 실호출은 배포 후 확인 필요(§7 검증 원칙).
