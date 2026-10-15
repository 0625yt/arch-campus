# AI 모델 운영 기준 — 2026-10-15

실제 호출 모델은 [`getModelIdFor()`](../src/lib/claude.ts)가 환경변수를 반영해 결정한다. `TOOL_MODEL`은 환경변수가 없는 기본값과 일치한다. 과거 비용 실측은 [COST.md](COST.md), 세부 내용 품질과 대용량 처리 변경은 [학습 품질 보고서](audit/2026-10-15-study-quality.md), 초기 평가와 라이브러리 변경은 [업그레이드 보고서](audit/2026-10-15-upgrades.md)를 참고한다.

## 기본 모델

| 작업 | 기본값 | 판단 |
|---|---|---|
| 요약·문제 생성 | `claude-haiku-5-5` | 내용 감사에서 핵심 25/26 보존. 실제 누락은 요약 검수로 보충. 문제는 구조·근거·중복·독립 검수 후 저장 |
| 요약 내용 검수 | `gemini-3.8-flash` | 학생에게 보이는 본문을 원문과 대조해 누락을 보충. 실패하면 이전 요약 유지 |
| 문제 검수·보조 채점·분류·채팅·기출·일정·OCR·리포트 구조 | `gemini-3.5-flash-lite` | 채점 15개 경계 사례 통과. Haiku의 서술형 오판이 관찰돼 채점은 기존 모델 유지 |
| 발표·과제 체크리스트·독후감 | `gemini-3.8-flash` | 3.6과 같은 공식 가격대의 최신 안정 Flash. 실제 서비스 검증 범위는 보고서 참고 |
| 벼락치기 | `gemini-3.6-flash` | 3.8 평가에서 실패해 기존 모델 유지. 양쪽 모델의 priority 값 문제를 프롬프트에서 수정 후 3.6 재검증 통과 |
| 시간표·강의계획서 Vision | `gemini-3.1-pro-preview` | 모델 API 정상, 공식 종료일 미정. 표 추출 품질을 재측정하지 않았으므로 유지 |
| AI 회고 예약 슬롯 | `claude-haiku-4-5` | 기존 기본 유지. 학생이 직접 작성하는 회고와 별개이며 현재 서비스의 AI 호출 없음 |

`wizard-exam`은 현재 호출자가 없는 예약 슬롯이다. 모델을 바꾼 사실을 새 기능 제공으로 세지 않는다.

## 지정 및 되돌리기

우선순위는 **명시적 모델 ID → 도구별 공급자 → 전역 Google → 기존 티어 설정 → 기본값**이다. ID 설정은 서버 환경변수로만 제공하며 사용자 요청에서 받지 않는다.

```dotenv
# 요약을 이전 모델로 되돌릴 때
SUMMARY_MODEL_ID=gemini-3.5-flash-lite
# 발표를 이전 모델로 되돌릴 때
PRESENTATION_MODEL_ID=gemini-3.6-flash
# 과제 체크리스트와 독후감은 같은 라우팅을 공유
WIZARD_ASSIGNMENT_MODEL_ID=gemini-3.6-flash
WIZARD_CRAM_MODEL_ID=gemini-3.6-flash
# 특정 기능만 Anthropic 사용. 명시 ID가 있다면 먼저 제거한다.
QUIZ_MODEL_VENDOR=anthropic
QUIZ_MODEL=sonnet
```

접두사는 `SUMMARY`, `SUMMARY_VERIFY`, `CLASSIFY`, `QUIZ`, `QUIZ_GRADE`, `QUIZ_VERIFY`, `PRESENTATION`, `WIZARD_ASSIGNMENT`, `WIZARD_EXAM`, `WIZARD_CRAM`, `REPORT_STRUCTURE`, `SYLLABUS`, `TIMETABLE`, `POST_MORTEM`, `EVENT_PARSE`, `EXAM_EXTRACT`, `EXAM_SOLVE`, `CHAT`, `CHAT_FREE`, `PDF_OCR`이다.

ID는 코드 `MODELS`의 허용 목록으로 검증한다. 현재 허용값은 `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.1-pro-preview`, `gemini-2.5-flash`, `gemini-2.5-pro`, `claude-haiku-5-5`, `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-sonnet-5`. 알 수 없는 ID는 유료 요청 전에 오류로 중단한다. 오래된 모델은 계정별 가용성을 먼저 확인한다.

`LLM_VENDOR=google|gemini`는 Google을 강제하지만 도구별 `*_MODEL_VENDOR=anthropic|claude`를 존중한다. 과거 `EXTRACT_MODEL`, `CHAT_MODEL`, `CHAT_FREE_MODEL`, `SYLLABUS_MODEL`, `QUIZ_GRADE_MODEL`, `QUIZ_VERIFY_MODEL` 설정도 지원한다. `QUIZ_MODEL`은 Anthropic 공급자를 선택했을 때만 사용한다. `PDF_OCR_VENDOR=anthropic`은 PDF 파서의 기존 OCR 비활성 스위치이기도 하므로 PDF OCR을 재활성화할 때 함께 제거해야 한다.

## 비용 및 검증

[Google 공식 가격](https://ai.google.dev/gemini-api/docs/pricing)에 따르면 3.6/3.8 Flash는 2026년 말까지 입력/출력 100만 토큰당 $0.75/$3.75, 이후 $1.50/$7.50이다. 코드의 비용 추정은 할인 종료 뒤의 **$1.50/$7.50**을 사용한다. 할인·암묵적 캐시를 반영하지 않는 보수적 추정이며 실제 공급자 청구액이 아니다. Flash-Lite는 $0.30/$2.50으로 추정한다. 과거 저장된 비용을 소급 변경하지 않는다.

```bash
npm run verify:env -- --models
npm run test:model-upgrade-live
npm run test:wizard-upgrade-live
npm run test:prompt-tools-live
```

첫 명령은 연결/메타데이터만 읽는다. 나머지는 가상 자료로 실제 AI를 호출하므로 비용이 발생한다. 비교 검사는 `.tmp/model-upgrade.json`에 실패를 포함한 결과를 기록한다. 기능별 품질 검사는 별도로 실행한다. 단일 실행의 가상 자료 통과는 모든 실제 강의의 품질 보장을 뜻하지 않는다.

새 모델을 추가할 때 ID·가격·생성/스트리밍 옵션·해당 기능의 품질 평가를 함께 검토한다. Google의 [모델 목록](https://ai.google.dev/gemini-api/docs/models)과 [종료 공지](https://ai.google.dev/gemini-api/docs/deprecations), Anthropic의 [현행 모델](https://platform.claude.com/docs/en/models/overview)을 확인한다. Gemini 4 Argon은 메타데이터 접근만 확인했다. Haiku 5.5는 후속 실제 평가 뒤 요약·문제 생성에 채택했다.


Haiku 5.5는 프롬프트 100K 토큰까지 입력/출력 $0.10/$0.50, 초과 시 $0.50/$2.50이다. 1시간 캐시 쓰기 $0.20/$1.00, 읽기 $0.01/$0.05도 문맥 임계값을 따른다. AI SDK의 전체 입력 토큰에서 캐시 읽기·쓰기를 빼고 해당 단가로 각각 계산해 중복 청구 추정을 피한다. 추가한 요약 검수 비용은 생성 모델 단가 절감과 별개로 합산하며, 전체 파이프라인 비용 절감을 보장하지 않는다.
