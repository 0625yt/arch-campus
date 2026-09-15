# 멀티벤더 모델 선택 리서치 (2026-05-28 작성 · 2026-07-24 결정 반영)

> **목적**: "비용 최소 + 품질 최고" 조합을 찾기 위해 Claude/Gemini/GPT/오픈모델을 기능별로 비교한 **판단 근거 문서**.
> **상태**: 2026-05 리서치 + **2026-07-24 실제 결정·구현 반영**(아래 §3-A). 실제 라우팅은 [COST.md](COST.md) §1이 단일 출처.
> **출처**: 2026-05 web 확인. 가격 변동성 큼 — 전환 직전 재확인. 미확인 칸은 "—".

---

## 3-A. ★ 2026-07-24 확정·구현 (리서치 → 실제 코드) — **전면 Gemini 전환**

리서치(아래 §3~§7)의 권고 중 **실제로 코드에 반영된 최종 결정**. 세션 내내 Anthropic 크레딧 소진이 반복돼 **Claude를 라우팅에서 완전히 걷어내고 전 도구를 Gemini로** 전환. Claude tier(haiku·sonnet)는 env 원복 안전판으로만 코드에 남김. 실제 라우팅 단일 출처는 [COST.md](COST.md) §1.

| 도구 | 최종 모델 | 근거 | 상태 |
|---|---|---|---|
| **quiz** | **Gemini 3.5 Flash-Lite** ($0.30/$2.50) | quiz가 prod 비용 79.9%. A/B 실측(exam-solve 20/20 등)으로 evidence 인용·의미중복 통과. 강화 파이프라인(verbatim 프롬프트 + evidence검증 + **의미 dedup(gemini-embedding-001)** + 스마트 topup + 2차 검수)이 Flash-Lite 약점을 덮음. **1회 −82%**. | ✅ 구현 |
| summarize·exam-extract·exam-solve·report-structure·event-parse·pdf-ocr·chat·chat-free·quiz-grade·quiz-verify | **Flash-Lite 3.5** | 텍스트 판정·풀이·요약·챗·채점 전부 Flash-Lite로 실측 통과(exam-solve 20/20, 채점·검수 3모델 동일, 챗 함정 3/3). 최저가 현세대. | ✅ |
| presentation·wizard-assignment·wizard-exam·wizard-cram | **Gemini 3.6 Flash** ($1.50/$7.50) | 위저드는 슬라이드 감각·분량 준수가 사활. Flash-Lite도 상당 부분 통과하나 안정성 위해 상위 Flash. (2026-07-24 A/B: [COST.md](COST.md) §9) | ✅ |
| syllabus·timetable Vision | **Gemini 3.1 Pro** ($2/$12, thinking budget 512) | 시간표 요일 오추출=일정 신뢰 붕괴. Flash-Lite는 요일 8.5/9로 약함 → 3.1 Pro 9/9. thinking 512로 낮춰 정확도 유지 + 속도 5.6배. | ✅ |

> **리서치 대비 최종 판단**: §3 리서치는 "위저드·Vision은 Sonnet 유지" 권고였으나, **크레딧 현실 + Gemini 현세대 품질 실측**으로 전면 Gemini 채택. Sonnet 5 승격안(§2)은 폐기됨.
> **⚠️ prod env 확정**(2026-07-24 `vercel env pull`): `LLM_VENDOR=""`(빈 문자열 → google 아님) → prod는 `GEMINI_BY_TOOL`이 아니라 `TOOL_MODEL` 기본 경로. 도구별 `*_MODEL_VENDOR`·`*_MODEL`·thinking env 모두 미설정 → **prod 실제 모델 = 코드 기본값**(위 표 그대로).
> **아직 미채택(리서치 제안 중)**: Upstage Document Parse(시간표/강의계획서 1차 OCR 하이브리드, §4), Vercel AI Gateway(§5-2). 둘 다 도입 시 추가 이득 가능하나 미결정.

---

## 0. 먼저 — 우리 문서가 낡았던 점

- CLAUDE.md/PRODUCT.md 초기 리서치의 "GPT-4.1 mini · text-embedding-3-small"는 **이미 구세대 모델명**. 2026-05 시장은 GPT-5.x / Gemini 3.x / DeepSeek V4 세대.
- **Claude Haiku 4.5 실제 단가는 입력 $1.00 / 출력 $5.00** (공식 확인). COST.md 초판의 $0.80/$4.00은 오차 → 보정함.

---

## 1. 저비용 tier (요약·추출·분류·챗 후보)

| 모델 | 입력 $/1M | 출력 $/1M | 컨텍스트 | Vision | 한국어 평판 |
|---|---|---|---|---|---|
| **Gemini 3.5 Flash-Lite** (★현행 저비용 tier) | **0.30** | **2.50** | 1M | 예 | 강화 파이프라인 통과 확인 |
| Claude Haiku 4.5 (env 원복용) | 1.00 | 5.00 | 200K | 예 | 문체 자연스러움 우수 |
| Gemini 3.1 Flash-Lite (대안 tier) | 0.25 | 1.50 | 1M | 예 | 더 싸나 quiz 검증은 3.5로 함 |
| GPT-5.4 mini | 0.75 | 4.50 | 400K | 예 | 한글 이미지·검색 강점 |
| DeepSeek V4-flash | 0.14 | 0.28 | 1M | 미확인 | — |

> **2026-07-24 채택**: **Gemini 3.5 Flash-Lite($0.30/$2.50)** 를 저비용 tier 표준으로 확정. quiz A/B 검증을 3.5로 했기에 검증=배포 일치를 위해 3.5 채택(3.1 Flash-Lite는 더 싸지만 대안 tier로만 코드에 남김). quiz·요약·추출·풀이·챗·OCR·채점·검수 담당.

## 2. 고품질 tier (퀴즈·위저드 후보)

| 모델 | 입력 $/1M | 출력 $/1M | 컨텍스트 | 비고 | 한국어 |
|---|---|---|---|---|---|
| **Gemini 3.6 Flash** (★위저드 현행) | 1.50 | 7.50 | 1M | 위저드(발표·리포트·벼락치기) | 산문·분량 준수 양호 |
| **Gemini 3.1 Pro** (★Vision 현행) | 2.00 | 12.00 | 1M | thinking budget 512(3.x Pro는 0 거부) | 시간표 요일 9/9 |
| Claude Sonnet 5 (env 원복용) | 2.00→3.00 | 10.00→15.00 | 1M | 도입가 ~2026-08-31 | 라우팅 미사용 |
| GPT-5.5 (플래그십) | 5.00 | 30.00 | long | — | 강함 |

> **2026-07-24 최종**: 위저드=**3.6 Flash**, Vision=**3.1 Pro(thinking 512)**. Sonnet 5 승격안은 크레딧 현실 + Gemini 현세대 품질 실측으로 **폐기**. Claude는 전부 env 원복 안전판으로만 남김.

## 3. 기능별 권고 (근거 기반) — 2026-05-28 재정정

> **초판 오류 정정**:
> ① 퀴즈를 "저빈도"로 분류했던 게 틀림 — 사용자 한 명이 학기당 40+ 자료에 퀴즈를 만들면 **퀴즈가 가장 비싼 고빈도 작업**(Sonnet 문제당 25원 × 40 = ~1만원/학기). 적자선 한참 초과.
> ② 시간표·강의계획서를 "정형 추출"로 분류한 것도 틀림 — 학교·학과별 레이아웃 천차만별, 표 격자 + 한글 + 비정형이 섞인 **고난도 작업이고 정확도가 제품 신뢰의 절대 변수**.

> ⚠️ 아래 "현행" 컬럼은 **2026-05 리서치 당시** 상태다. **2026-07-24 최종 결과는 §3-A**(전면 Gemini)를 볼 것.

| 작업 | 리서치 당시 | 재정정 권고 | → 2026-07-24 최종 |
|---|---|---|---|
| 요약·추출·챗 (고빈도) | Haiku 4.5 | Gemini Flash A/B | **Flash-Lite 3.5** ✅ |
| **퀴즈** (고빈도, 학기당 40+회) | Sonnet 4.6 | Gemini Flash A/B 우선 | **Flash-Lite 3.5** ✅ (−82%) |
| 위저드(발표·리포트·벼락치기) | Sonnet 4.6 | 현행 유지 | **3.6 Flash** ✅ (Sonnet→Gemini) |
| **시간표·강의계획서 Vision** (정확도 절대) | Sonnet 4.6 | 하이브리드 파이프라인 권장(§4) | **3.1 Pro thinking 512** ✅ (하이브리드는 미채택) |

## 4. 시간표·강의계획서 정확도 99.9% — 단일 LLM은 불가능

업계 합의(Box, Unstract, Grab, Alan, Virtido 등 production 보고):

- **잘 만든 단일 호출 = 90~98%가 천장**. 99%+는 파이프라인.
- 표준 4겹: ① schema validation(Zod 즉시 거부) ② confidence gating(다중 샘플링 일치도) ③ cross-reference(요일 1~5, 시간 0~23 등) ④ retry + fallback model
- **LLM as a judge** 이중 검증(다른 모델/프롬프트로 두 번 → 합의될 때만 통과)이 99% 달성의 표준 기법
- **HITL(사용자 확인 UI)은 필수** — Box Extract가 2026-01에 confidence score 정식 출시, <90% 필드는 사용자 검수 큐로 라우팅이 기본 패턴

### 벤치마크가 보여준 사실 (OmniDocBench v1.5)

| 모델/솔루션 | OmniDocBench | 한국어 적합 | 비고 |
|---|---|---|---|
| GLM-OCR (Zhipu) | **94.62** (SOTA) | 미확인 | 전용 OCR |
| PaddleOCR-VL | 92.86~94.50 | 미확인 | 전용 OCR, Apache 2.0 |
| **Gemini 3.1 Pro** (★현행 Vision) | ~90.3 | 양호 | **우리 시간표·강계 현행**(thinking 512, 요일 9/9) |
| GPT-5.4 | ~85.4 | 한국 표에서 가끔 오류 보고 | Structured Outputs 1위 |
| Claude Sonnet 4.6 | 미공개 | 한국 금융 표 인식 보고 양호 | 2026-05 리서치 당시 현행(현재는 env 원복용) |
| **Upstage Document Parse** | (LLM 벤치 미참여) | **★ 한국어·복잡 레이아웃 명시 특화** | TEDS 93.48, 창업자 Naver Clova AI 헤드 출신, **학교·비영리 1년 무료** |
| AWS Textract | (벤치 미참여) | **한국어 미지원 ❌** | 표 line-item 82% — 영어만 |

### 권장 아키텍처 (정확도 99%+ 목표 시)

```
[시간표/강의계획서 이미지·PDF]
  ↓
[1차] Upstage Document Parse  ← 한글 표·격자 추출 (TEDS 93.48)
  ↓
[2차] LLM 의미 정규화          ← 요일/시간/과목명 통합 (Claude Sonnet 또는 GPT-5.4 strict JSON)
  ↓
[검증] Zod 스키마 + cross-ref  ← 요일 1~5, 시간 범위, 학기 일치
  ↓
[confidence <0.9 필드만] 사용자 확인 UI(노란 배지, 한 클릭 수정)
  ↓
[저장] 사용자 수정값을 평가셋에 누적 → 학교별 정확도 추적
```

핵심 결정 포인트:
1. **Upstage 학교 1년 무료** 적격성 검토 — arch-campus는 "한국 대학생 AI" 포지셔닝이라 명분 충분. 적격 시 1차 추출 비용 0.
2. **JSON 안정성 우선이면** 2차 정규화에 GPT-5.4 strict JSON, **한국어 산문 우선이면** Sonnet 4.6 유지.
3. **HITL UI는 필수** — "추출 결과 확인 화면"을 시간표/강의계획서 import flow 끝에 강제로. 이미 우리 syllabus-import-flow가 이 패턴(추출→확인→저장)이라 confidence 표시만 추가하면 됨.

## 5. 가장 현실적인 "최고의 조합" — 재정정

리스크 작은 순서, 효과 큰 순서:

1. **시간표·강의계획서 → Upstage 학교 무료 PoC 신청** — 적격이면 비용 0 + 정확도 점프. 신청 자체가 단계 0.
2. **퀴즈 → Gemini 2.5 Flash 블라인드 A/B** — 절감 효과 가장 큼 (학기당 ~8천원/인). 변별력·함정·evidence 정확도 통과가 조건.
3. **요약·챗 → Gemini 2.5 Flash A/B** — 한국어 문체 통과 조건.
4. **위저드 → Sonnet 유지** — 산문 품질 핵심.
5. **HITL confidence UI** — 비용 절감과 무관, 신뢰 보호용. 코드 변경 작음(이미 confirm flow 있음).

> 한 번에 전 벤더 전환 X. 한국어 품질·정확도 회귀가 비용 절감보다 손해 클 수 있다.

## 5. 멀티벤더 도입 비용 (운영 복잡도)

- API 키·SDK 추가 (`@ai-sdk/google`, `@ai-sdk/openai`) — 환경변수·에러·레이트리밋 벤더별 분기.
- 캐시 모델 차이 — Anthropic은 명시적 cache write/read, Gemini/OpenAI는 방식이 달라 `estimateCost` 벤더별 재작성 필요.
- 프롬프트 이식 — 벤더별 JSON 안정성·한국어 톤 차이로 위저드 품질 회귀 위험.
- **완화책**: **Vercel AI Gateway** — 멀티벤더를 `"provider/model"` 단일 인터페이스로 추상화. 라우팅·페일오버·비용 추적 한 곳에. AI SDK v6를 이미 쓰므로 도입 난이도 낮음. 멀티벤더 갈 거면 직접 SDK 여러 개보다 Gateway 우선 검토.

## 6. 미확인·한계

- Gemini 캐시 단가, DeepSeek/Qwen Vision 정식 지원, GPT-5.5 컨텍스트 토큰 수, Haiku/Sonnet/GPT mini의 개별 GPQA, Claude/GPT의 KMMLU 정량 점수 — 모두 신뢰 가능한 단일 출처 못 찾음.
- KMMLU 2차 출처: SKT A.X 4.0 78.3 / Gemini 3 시리즈 75~77 / Qwen3 73~74 (블로그 출처라 확정 근거 약함).
- 프로모션 가격(DeepSeek V4-pro 75% 할인, Gemini Pro Preview) 섞임 — 정가 아닐 수 있음.

## 7. 결론 한 줄 (재정정)

**우선순위 두 가지**:
① **시간표·강의계획서 정확도** — 단일 LLM으론 99.9% 불가, **Upstage Document Parse 1차 + LLM 정규화 + HITL confidence UI** 하이브리드. 학교 1년 무료 적격성부터 검토.
② **퀴즈 비용** — 학기 ~1만원/인 적자 위험, **Gemini 2.5 Flash로 블라인드 A/B**. 변별력·evidence 통과 시 1/6로 절감.

위저드·요약·챗은 부차적. 멀티벤더는 Vercel AI Gateway로 추상화 권장.
