# 기능 구현 현황 — 2026-09-22

현재 코드 기준의 단일 현황 문서. [점검 보고서](audit/2026-09-22-hardening.md)에 테스트 결과·수정·제약을 기록한다. 제품 목표는 [PRODUCT.md](PRODUCT.md), 다음 작업은 [NEXT-STEPS.md](NEXT-STEPS.md).

## 판정 기준

- **구현**: 화면과 실행 코드가 연결되어 있음. 모든 운영 조건에서 검증됐다는 의미는 아니다.
- **부분 구현**: 핵심 일부는 있으나 목표 기능을 끝까지 충족하지 못함.
- **미구현**: 실행 경로가 없음. 프롬프트·타입·기획 문서만 있는 경우도 포함.
- 자동 테스트, 외부 서비스 연결, 실제 사용자 흐름 검증을 분리한다.

## 기능별 현황

| 영역 | 판정 | 근거 / 한계 |
|---|---|---|
| 랜딩·가입 전 학습 체험 | 구현 | `app/landing/semester-demo.tsx`; 일정·요약 출처·문제 해설 체험, 테스트 포함 |
| 이메일·Google 로그인/가입 | 구현 | `app/login`, `app/signup`, `app/auth/callback`; 실제 신규 가입·메일 도착·OAuth 왕복은 별도 |
| 온보딩·프로필 | 구현 | `app/onboarding`, `api/profile` |
| 비밀번호 재설정·전체 로그아웃·계정 삭제 | 구현 | `login/forgot`, `auth/reset`, `settings/security`, `api/account`; 실제 계정 삭제는 이번 점검에서 실행하지 않음 |
| MFA | **부분** | 로그인 challenge·서버/API AAL2 강제 구현 및 실제 TOTP 검증. DB restrictive policy 0027은 작성됐지만 미적용·미검증 |
| 기기별 세션 목록·선택 로그아웃 | 미구현 | 현재는 모든 기기 로그아웃 버튼 |
| 시간표·강의실·과목 수정 | 구현 | `dashboard/timetable-hero.tsx`, `course-sheet.tsx`; 주간/오늘/목록, 강의실 표시 |
| 오늘의 우선순위 | 구현 | `dashboard/today/page.tsx`; 실제 safety 신호+다가오는 일정. 9월 15일 누락 라우트 복구 |
| 공부 과목 검색·분류 | 구현 | `study/study-workspace.tsx`; 과목·교수·강의실, 학기·개인 공부 |
| 자료 업로드·이동·삭제·진행 표시 | 구현 | `study/[course]/upload-zone.tsx`, `materials-grid.tsx`, `api/materials/*`; 검색·요약 필터·실패 복구 테스트 |
| 요약·출처·분할 PDF 보기 | 구현 | `study/[course]/[material]`; PDF별 원문 추출 정확도·큰 파일 품질은 별도 |
| 자료 챗·자유 챗 | 구현 | `api/chat/*`, `lib/chat-client.ts`; 스트림 조각/오류 복구 테스트 |
| 문제 생성·기출 추출·채점·오답 | 구현 | `api/quiz/*`, `api/materials/[id]/*`, `dashboard/review`; 자료별 생성 입력 상한 50, DB 제약 상한 100은 별개 |
| 간격 반복 복습(FSRS) | 미구현 | 현재 오답 묶음·재풀이이며 복습 시점 계산/리뷰 스케줄 모델 없음 |
| 일정 월·주·일·연 보기·CRUD | 구현 | `dashboard/calendar/calendar-board.tsx`, `api/events/*` |
| 시간표·강의계획서 추출 | 구현 | `api/timetable`, `api/syllabus`; 사용자 확인 후 저장. 양식별 정확도는 별도 실측 필요 |
| 외부 캘린더 양방향 동기화 | 미구현 | Google/Apple OAuth calendar scope·sync worker 없음 |
| 알림 | **부분** | `reminder_minutes` 저장 필드가 있으나 푸시 구독·전송 worker 없음 |
| PWA | **부분** | manifest 있음. 오프라인 서비스워커·푸시 없음 |
| 발표·리포트 구조·요구사항·벼락치기·독후감 | 구현 | 5개 위저드 페이지와 API. 독후감 재표현 API도 있음 |
| Q&A·기출형 문제·오답 분석 카탈로그 | 기존 기능 연결 | 각각 발표/공부/복습으로 이동. 독립 위저드로 세지 않음 |
| 팀플·진로 위저드 | 미구현 | 도구 카탈로그 비활성 항목 |
| 시험 후 회고(post-mortem) | 미구현 | 모델 ToolKind 등이 있어도 페이지·서비스·API 실행 흐름 없음 |
| 결제·Pro·월별 비용 쿼터 | 미구현 | 분당 호출 제한과 결제/사용량 상한은 다름 |
| 친구 초대·보상·학과 통계 | 미구현 | referrals 및 entitlement 흐름 없음 |
| 성적·합격 추적 | 미구현 | outcomes 입력·저장·통계 흐름 없음 |
| 피드백·관리 화면 | 구현 | `api/feedback`, `admin/feedback`, admin 권한 가드 |
| 작업 실행 | **부분** | `after()`+jobs+Realtime/폴링, 8분 stale 복구·원자적 실행 선점·완료 상태 덮어쓰기 방지. 내구성 있는 재시도 큐/스케줄러는 없음 |

## 데이터와 운영 경계

- 사용자 확인은 `getCurrentUser()` → `getOwnerId()`/`tryGetOwnerId()`; 서비스 역할 쿼리는 owner 조건을 별도로 유지한다.
- Auth 연결·anon 4개 테이블 0행·Storage 연결 확인. 임시 인증 사용자 2개로 과목·자료·일정·문제 조회/삭제/위조 소유자 삽입 차단과 실제 TOTP를 검사해 22개 통과했다. 모든 테이블의 모든 작업 검증을 뜻하지 않는다.
- 코드에 있는 27개 SQL의 운영 적용 여부는 마이그레이션 이력 대조 전까지 **미확인**이다.
- Upstash 미설정 시 메모리 sliding window. 제한 저장소 장애 시 503으로 작업 시작을 거절한다. 멀티인스턴스 비용 보호를 보장하지 않는다.
- 서버 개발 모드에서는 fallback 사용자가 있으므로 개발 화면이 열린다는 사실만으로 실제 로그인이 검증되지 않는다.

## 모델과 품질

`src/lib/claude.ts`의 `getModelIdFor()`가 실제 라우팅 기준이다. 주석·`TOOL_MODEL`·과거 문서만으로 운영 모델을 단정하지 않는다.

9월 17일 로컬 설정에서 Gemini 3.5 Flash-Lite / 3.6 Flash / 3.1 Pro Preview의 모델 메타데이터 조회가 성공했다. 이것은 **API 가용성** 검증이며 생성 품질 점수가 아니다. 과거 A/B 수치는 [COST.md](COST.md) 당시 조건으로 한정한다. 기본 단위 테스트에서 외부 AI 테스트 7개는 건너뛴다.

## 디자인

시간표 정보 밀도와 공부 공간의 그래파이트·코발트·CSS 3D 문서 레이어를 사용한다. 검색·분류·자료 카드·모바일/다크/동작 줄이기 테스트가 있다. 전체 앱이 동일한 수준으로 접근성 검증된 것은 아니다. 현재 우선 기준은 [ARCH-CAMPUS-STYLE.md](design/ARCH-CAMPUS-STYLE.md).
