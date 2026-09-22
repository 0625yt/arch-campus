# 실제 아키텍처 — 2026-09-22

이 문서는 구현을 설명한다. 예정 기능은 [NEXT-STEPS.md](NEXT-STEPS.md), 제품 의도는 [PRODUCT.md](PRODUCT.md), 검증 범위는 [점검 보고서](audit/2026-09-22-hardening.md)를 따른다.

## 1. 앱과 데이터 경계

Next.js App Router에서 서버 페이지가 데이터를 조회하고 클라이언트 컴포넌트가 검색·탭·편집을 담당한다. 개인 데이터 페이지는 동적이다. 공개 랜딩은 개인 세션 조회를 기다리지 않는다.

- `src/proxy.ts`: 세션 갱신·페이지 접근 가드. 공개 경로와 API 예외가 있으므로 이 파일만으로 API 권한을 보장하지 않는다.
- `src/lib/supabase/server.ts`: 쿠키 기반 서버 클라이언트, `getCurrentUser()`는 `auth.getUser()`로 검증.
- `src/lib/auth.ts`: `getOwnerId()` / `tryGetOwnerId()`. 개발 fallback은 운영에서 사용하지 않는다.
- `src/lib/supabase/admin.ts`: service-role. RLS를 우회하므로 호출 코드에 owner 검증이 필요하다.
- `src/lib/data/*`: 사용자 범위 쿼리·화면용 결과 매핑. 일부 조회는 오류를 빈 결과로 바꾸므로 장애와 진짜 빈 상태를 분리하는 개선 여지가 있다.

학과/조직 단위 멀티테넌트 권한은 없다. 현재 경계는 사용자 owner이며, 문서에만 존재하던 `enrollments`/`user_personas` 구조를 실제 스키마처럼 취급하지 않는다.

## 2. 새 생성 기능의 구성

1. `src/prompts/<tool>.md`: 공통 규칙과 합쳐지는 프롬프트.
2. `src/lib/schemas.ts` 및 도구별 스키마: 입력/출력 검증.
3. `src/lib/services/*`: 모델 호출·후처리·생성 기록.
4. `src/app/api/*/route.ts`: 사용자·입력·소유권·호출 제한 검증, 실행/작업 생성.
5. `src/app/dashboard/*`: 입력·진행·결과·재시도. 필요하면 `wizard-history`와 결과 재방문 렌더러 등록.

도구 식별자를 추가할 때 `ToolKind`, 프롬프트, 라우트, 결과 렌더러, jobs/generations SQL 제약을 **실제 파일에서** 확인한다. 존재하지 않는 `api/history`를 등록 대상으로 사용하지 않는다.

## 3. AI 라우팅

`src/lib/claude.ts`는 파일명과 달리 Anthropic과 Google SDK 모두를 사용한다. `getModelIdFor()`가 `resolveModel()`의 환경 분기를 포함한다. 모델 ID·vendor·tier·가격 표를 같이 검토한다.

- 주요 기본 경로: Gemini 3.5 Flash-Lite(요약/문제/챗 등), 3.6 Flash(위저드), 3.1 Pro Preview(Vision).
- `LLM_VENDOR`, 도구별 vendor/tier 설정이 영향을 준다. 모든 도구가 똑같은 override를 지원한다고 가정하지 않는다.
- Anthropic prompt caching 옵션을 Google 요청에도 그대로 적용하지 않는다.
- AI Gateway 환경변수가 있어도 실제 요청은 현재 SDK 직접 경로다.
- 모델 API에서 메타데이터를 조회할 수 있다는 사실은 생성 정확도·비용 평가를 대신하지 않는다.

## 4. 사용자 격리와 입력 검증

service-role을 사용하는 신규 경로는 다음을 유지한다.

- 함수 진입 시 검증된 사용자 ID 획득.
- 조회/수정/삭제에 `owner_id` 제한; profiles는 `id` 제한.
- 사용자가 준 course/material/quiz ID의 소유권 검증.
- 저장소 경로는 소유권을 확인한 DB row 또는 서버에서 만든 `<ownerId>/...`를 사용.
- 자유 입력은 길이·형식 제한, 프롬프트 경계 태그 중립화와 출력 스키마 검증.
- 로그인 `next`는 `src/lib/auth-redirect.ts`로 내부 경로만 허용.

`/auth/mfa`와 proxy·getCurrentUser의 AAL2 검증으로 등록한 계정의 화면/API 접근을 보호한다. redirect 시 갱신 쿠키를 보존한다. DB 직접 접근 강제는 0027 restrictive policy를 적용해야 하며 현재 연결 오류로 미적용이다. 전체 로그아웃은 refresh token 폐기이며 이미 발급된 access token의 남은 유효기간을 고려해야 한다.

## 5. 업로드·문서 파싱

```text
파일 선택 → 자료 종류 확인 → 업로드 URL → Storage 업로드 → finalize
→ 포맷별 텍스트 추출/OCR → 요약/문제 생성 작업 → 검증 → 저장/표시
```

| 형식/역할 | 실제 구현 |
|---|---|
| PDF | unpdf/pdfjs 기반, 필요 시 모델 OCR (`lib/parsers/pdf.ts`) |
| DOCX | mammoth |
| XLSX/XLSM | exceljs |
| PPTX | officeparser |
| TXT/MD | 텍스트 파서 |
| 이미지 | 모델 Vision |
| HWP/HWPX | `lib/parsers/hwp.ts`, 외부 변환 서비스가 필요한 조건부 경로 |
| 저장 | Supabase Storage |

PyMuPDF/PaddleOCR/pgvector/R2는 현재 파이프라인의 구성요소가 아니다. 자료 챗은 본문과 키워드 기반 관련 부분 hint를 사용한다. quiz 의미 중복 제거는 임베딩을 일시적으로 사용하며 벡터 DB에 저장하지 않는다.

## 6. 생성 검증과 비동기 실행

퀴즈는 스키마·보기/정답·출처 근거·중복·검수 후 노출한다. 일부 짧은 정답은 규칙 채점, 필요한 경우 모델 채점을 사용한다. 자료별 생성 API의 입력 상한(50)과 DB 저장 제약(100)을 구분한다.

`after()` + jobs 테이블 + Realtime/폴링으로 긴 작업의 진행 상태를 표시한다. 8분 이상 stale 작업은 복구 가능한 실패로 처리한다. 이 구조는 서버 중단 뒤 자동 재개하는 내구성 워크플로와 다르다. pending→running 조건부 갱신으로 한 worker만 선점하며 늦은 오류가 done을 덮어쓰지 않는다. enqueue 충돌은 기존 active 작업을 반환한다. 단계 체크포인트·자동 재시도는 후속 개선 대상이다.

SSE 소비자는 `src/lib/chat-client.ts`에서 UTF-8/이벤트 경계, 서버 오류, 완료 신호를 처리한다. 부분 응답 뒤 오류도 사용자에게 표시한다.

## 7. 일정과 복습

시간표/강의계획서 결과는 confidence와 함께 확인·수정 후 confirm API로 저장한다. 높은 confidence만으로 확인 단계를 건너뛰는 ‘자동 등록’을 완료 기능으로 적지 않는다.

오답은 최신 풀이와 문제 ID를 기준으로 모아 재풀이한다. FSRS due 계산, 푸시 전송, 외부 캘린더 동기화는 미구현이다. `reminder_minutes`는 데이터 필드다.

## 8. 운영·검증

- Upstash가 없으면 인메모리 sliding window; 저장소 오류 시 503으로 거절. 월 사용량 과금/쿼터와 다르다.
- 마이그레이션 파일은 0001~0027. 운영 적용 여부는 이력 대조 필요.
- `verify:env`는 키 비공개·생성 없는 연결 검사. `--models`는 모델 메타데이터 확인.
- Vitest: 로직/경계 검증. 외부 모델 평가는 opt-in.
- Playwright/axe: 모바일 390·태블릿 834·노트북 1280. 개발 fixture/네트워크 모의와 실제 계정 테스트를 분리.
- 전체 Biome 검사 실패는 현재 잔여 작업이며 무시하거나 ‘전체 통과’로 보고하지 않는다.
- 사용자별 캐시·auth 검증 비용 최적화는 사용자 경계를 보존한 상태에서 프로파일링 후 적용한다.
