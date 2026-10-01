# 프롬프트 운영 — 2026-10-01

현재 실행되는 지시·검증·평가의 기준이다. 실제 결과와 비용은 [품질 점검](audit/2026-10-01-prompt-quality.md), 기능 범위는 [STATUS](STATUS.md)를 따른다.

## 실제 로딩과 모델

[loadPrompt](../src/lib/prompts.ts)는 `_shared/persona-schema.md` → `_shared/master-rules.md` → 도구 MD 순으로 읽고 프로세스 안에서 캐시한다. 수정은 새 서버/배포에서 반영한다. `_shared/skills-v2.md`는 개발용 문서이며 모델에 자동 주입되지 않는다. 공통 보안 경계는 [모델 호출](../src/lib/claude.ts)에서 추가한다.

실제 모델은 `getModelIdFor()`가 선택한다. 프롬프트의 헤더·과거 가격·TOOL_MODEL만으로 현재 운영 모델을 판단하지 않는다. 이번 변경은 모델·가격표·환경 키·DB 스키마를 바꾸지 않았다. 기존 AI SDK 6와 Zod를 사용하며 새 외부 계정이나 라이브러리는 필요 없다.

| 프롬프트 | 역할 / 호출 도구 |
|---|---|
| [quiz](../src/prompts/quiz.md) | 자료 기반 객관식·단답형·서술형 / quiz |
| [quiz-verify](../src/prompts/quiz-verify.md) | 실제 인용 위치·정답·해설 검수 / quiz-verify |
| [quiz-grade](../src/prompts/quiz-grade.md) | 보수적인 의미·서술 채점 / quiz-grade |
| [summarize](../src/prompts/summarize.md) | 자료 범위·조건·출처를 보존한 요약 / summarize |
| [chat](../src/prompts/chat.md), [chat-free](../src/prompts/chat-free.md) | 자료 질문·자유 질문 / chat·chat-free |
| [event-parse](../src/prompts/event-parse.md) | 자연어 일정 후보 / event-parse |
| [syllabus](../src/prompts/syllabus.md), [timetable](../src/prompts/timetable.md) | 강의계획서·시간표 추출 / syllabus-extract·timetable-extract |
| [presentation](../src/prompts/presentation.md) | 발표 구성 / presentation |
| [report-checklist](../src/prompts/report-checklist.md) | 공지의 제출 조건 / wizard-assignment |
| [report-structure](../src/prompts/report-structure.md) | 리포트 구조 / report-structure |
| [exam-cram](../src/prompts/exam-cram.md) | 제공된 범위의 공부 계획 / wizard-cram |
| [exam-extract](../src/prompts/exam-extract.md), [exam-solve](../src/prompts/exam-solve.md) | 기출 추출·추정 풀이 / exam-extract·exam-solve |
| [book-review](../src/prompts/book-review.md), [book-review-paraphrase](../src/prompts/book-review-paraphrase.md) | 실제 독서 메모 기반 구성·재표현 / wizard-assignment |

## 문제 생성의 품질 경계

1. 자료에서 연속된 근거를 선택하고 학습 목표·문항·대안 검토 순서로 출제한다. 다른 과목 지식을 추가해 어려워 보이게 만들지 않는다.
2. [종류별 배분](../src/lib/quiz-blueprint.ts)을 코드에서 계산해 청크마다 전달한다. 별도의 계획 모델 호출을 추가하지 않는다. 자료가 부족하면 요청 개수보다 적게 낸다.
3. 생성·검수·채점에 SDK `Output.object()`와 Zod 구조화 출력을 사용한다. JSON 형식이 맞는다고 정답이 맞는 것은 아니다.
4. [형식·근거·보기 검증](../src/lib/validate-quiz.ts)과 기존 표면/의미 중복 검사를 거친다. 원어 표기를 훼손하는 일부 혼합 문자도 보류한다. 이 규칙이 모든 외국어 오타를 잡는 것은 아니다.
5. [검수](../src/lib/services/quiz-verifier.ts)는 20문항씩 실제 원문 주변 문맥을 제공한다. 객관식은 검수자가 판정한 유일한 정답 키가 생성 답안과 같아야 한다. 인용 위치를 못 찾으면 인용 자체를 원문으로 대신 쓰지 않는다. 누락·중복 판정은 보류하고 검수 기술 실패 시 저장을 차단한다.
6. 쪽수는 [실제 원문 표식](../src/lib/source-grounding.ts)에서 재계산한다. 표식 없음·반복 인용은 null이다. 원문 매칭은 레이아웃 공백·문장부호 차이를 허용하고 내용 정확성은 모델 검수가 추가 판단한다.
7. 보기 키·순서를 언급한 기존 해설은 보기를 섞지 않는다. 새 프롬프트는 보기 내용으로 설명해 재정렬 뒤에도 의미가 유지되도록 한다.

자료 내용과 조건을 우선하며 범위 밖 보충·가짜 쪽수·강제 감정 문장·인용문 단어 치환을 금지한다. 내부 답 구분자 `&`·`|`는 학생 입력 형식으로 강요하지 않는다. 재시도·보충은 기존 상한을 유지하며 이를 무제한 품질 보장으로 표현하지 않는다.

## 다른 도구의 경계

요약도 구조화 출력과 [인용 위치 검사](../src/lib/summary-grounding.ts)를 거친다. 원문에서 찾지 못한 인용은 저장을 거절한다. 확인한 구간은 실제 원문의 줄바꿈·기호를 그대로 복원하고 쪽수도 바로잡는다. 모든 요약 주장에 대한 독립적인 의미 검수는 아직 없으므로 출처 확인을 대체하지 않는다.

일정 초안은 모호한 날짜를 지어내지 않고 점수와 비중을 구분한다. [서버 비중 검사](../src/lib/event-weight.ts)는 원문의 명시적 백분율·지원하는 만점 표현에서 확인되지 않는 비중을 null로 돌린다. 여러 일정에 같은 비율이 있을 때 어느 일정에 귀속되는지까지 증명하는 파서는 아니다. 날짜·시간 후보는 사용자가 확인하고 저장한다.

자료 챗의 `[CITATIONS]`는 워터마크 다음의 마지막 토큰이다. 독후감은 실제 메모·인용과 해석을 구분하며 표절 검사 통과·검출 회피를 약속하지 않는다. 강의계획서의 ‘4월 중순’ 같은 표현은 특정 날짜로 변환하지 않는다. 발표 분량·리포트 조건·벼락치기 범위도 제공된 입력을 우선한다.

## 재현과 변경 기준

```sh
npm run test
npm run test:quiz-quality
npm run test:live-ai
npm run test:prompt-live
npm run test:prompt-tools-live
npm run test:prompt-flows
npm run check:docs
```

`test:live-ai`, `test:prompt-live`, `test:prompt-tools-live`, `test:prompt-flows`는 기존 `.env.local` 키로 호출 비용이 발생한다. 기본 단위 테스트에서는 생략한다. 가상 자료만 쓴다. 앞의 AI 평가 3개는 DB에 저장하지 않는다. `test:prompt-flows`는 실행 중인 서버의 실제 API·작업·저장을 임시 인증 계정으로 확인하고 계정/생성 데이터를 삭제한다. 외부 배포는 `E2E_BASE_URL`로 지정한다. 비교 원본은 기본 `4f3279c`이며 `BASELINE_PROMPT_REF`로 변경할 수 있다. `.tmp/prompt-quality.json`에는 가상 문항과 측정 기록이 남는다. 측정 비용은 코드 단가표 추정이며 다음 호출 시작 전 $0.80 초과 여부를 검사한다. 제공자 과금의 강제 상한은 아니다.

품질 기준은 근거 일치·정답 유일성·개념 다양성·표기 정확성·채점 보수성이다. 실패를 통과시키기 위해 기준을 낮추지 않는다. 비용·지연은 검수까지 포함하고 실패한 응답 비용도 기록한다. 한 번의 소규모 합격을 전체 학과·긴 PDF·실제 시험 성적의 보장으로 확장하지 않는다.

공식 참고: [Gemini 프롬프트 전략](https://ai.google.dev/gemini-api/docs/prompting-strategies), [Gemini 구조화 출력](https://ai.google.dev/gemini-api/docs/structured-output), [AI SDK 객체 출력과 오류 처리](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data).
