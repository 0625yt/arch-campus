# arch-campus 출시 전 정밀 감사 — 2026-05-28

> 코드 결함 · UI/UX 깨짐 · 제품 갭을 세 에이전트(code-reviewer / UX Architect / Sprint Prioritizer)가 병렬로 본 결과를 한 문서로 묶음.
> 추측·일반론 X — 모든 항목은 실제 파일·라인을 가리킨다.
> 우선순위는 "30만 한국 대학생을 사로잡으려면 무엇이 부족한가"라는 사용자 질문 기준.

---

## 🧭 한 줄 진단

**도구는 7할 완성, 매일 열 이유와 viral 루프는 0할.** 위저드 4종·캘린더·자료 학습 루프·퀴즈는 살아있지만 PRODUCT.md가 차별점 1·4·5로 못박은 **친구 초대 · 성적 추적 · 강의계획서 자동 일정화의 "감탄 순간"** 이 STATUS에 흔적조차 없다. 침투율 1%(2만 명)는 가능, 침투율 15%(30만)는 viral 계수 K≥0.5 없이는 비현실.

추가로 — **즉시 막아야 할 4건의 Critical 코드 결함**(공백 삭제 버그·치팅 가드 항등식·rate limit 부재·SSRF 미가드)과 **모바일·태블릿에서 캘린더·퀴즈가 사용 불가에 가까운 UI 깨짐**이 있다.

---

## 🚦 출시까지의 우선순위 한눈에

| # | 항목 | 분류 | 담당 영역 | 예상 공수 |
|---|---|---|---|---|
| 1 | `sanitize.ts:22` 공백 전체 삭제 버그 | 🔴 Critical | 백엔드 | 15분 |
| 2 | `report-structure.ts:290` 치팅 가드 항등식 (`?` 두 번) | 🔴 Critical | 백엔드 | 10분 |
| 3 | `/api/materials/route.ts` AI 호출 라우트 rate limit 부재 | 🔴 Critical | 백엔드 | 30분 |
| 4 | `cloudconvert.ts:103` SSRF 미가드 fetch | 🔴 Critical | 백엔드 | 20분 |
| 5 | 모바일 캘린더 월뷰가 한 화면에 안 들어옴 + 헤더 버튼 8개 wrap | 🔴 Critical | UI | 2~3h |
| 6 | 모바일·iPad 퀴즈 진행률 사이드바가 본문 위로 400px 차지 | 🔴 Critical | UI | 1~2h |
| 7 | 랜딩 모바일에서 시각 단서(미리보기 카드) 0 | 🔴 Critical | UI | 1~2h |
| 8 | 친구 초대 viral 루프 — 완전 부재 | 🔴 제품 | 풀스택 | 3~5일 |
| 9 | 강의계획서 "감탄 순간"이 첫 5분에 안 들어옴 | 🔴 제품 | 온보딩 | 2일 |
| 10 | 일일 푸시/이메일 다이제스트 0 | 🔴 제품 | 인프라 | 3일 |
| 11 | 성적·합격 추적 (차별점 5) — 미구현 | 🔴 제품 | DB+UI | 2일 |
| 12 | "치팅 아님" 메시지가 랜딩 헤드라인에 없음 | 🔴 제품 | 카피 | 1h |

> 위 12개를 막은 뒤에야 Phase 2 결제 검증 진입 의사결정이 가능해진다 (현재 GO/STOP 6개 지표 중 5개가 측정조차 안 됨).

---

# I. 🔴 코드 결함 (code-reviewer)

## Critical — 즉시 수정

### C-1. `src/lib/sanitize.ts:22` — 텍스트 전체 공백을 삭제한다

```ts
cleaned = cleaned.replace(/ /g, "");
```

정규식 슬래시 사이가 일반 스페이스(U+0020). `sanitizeUserInput("안녕 하세요")` → `"안녕하세요"`. 이 함수는 파서 파이프라인의 `sanitizedText` 컬럼 전처리 경로에 있어 **공백 잃은 한국어 본문이 RAG 청크 분리·LLM 독해를 동시에 무너뜨린다.**

**수정**: 해당 줄 전체 삭제. 의도가 NBSP(U+00A0) 같은 특수문자 정규화였다면 그 문자만 명시.

---

### C-2. `src/lib/services/report-structure.ts:290` — 치팅 가드가 항등식

```ts
if (!trimmed.endsWith("?") && !trimmed.endsWith("?")) {
```

두 조건 모두 ASCII `?`(U+003F). 의도는 전각 물음표 `？`(U+FF1F) 체크. 모델이 한국어 전각으로 마무리하면 가드 통과 → **CLAUDE.md §4 "리포트 본문 작성 차단"의 핵심 검증이 뚫린다.**

**수정**: 두 번째를 `？`로 교체. 함께 `validateOutput` 전체에 단위 테스트(테스트 갭 §섹션 참고) 추가.

---

### C-3. `src/app/api/materials/route.ts` POST — rate limit 부재

한 번 업로드가 `runSummarize`(Sonnet) + `runQuizGeneration`(Sonnet) 두 건의 AI 호출을 트리거. 추정 **~$0.05/업로드**. `guardRateLimit("ai", ownerId)` 호출이 진입점에 없다. 같은 ownerId로 반복 호출 시 비용 무한 누적. `/api/materials/finalize`도 동일하게 점검 필요.

**수정**: 진입 직후 `guardRateLimit("ai", ownerId)` 또는 `upload` 버킷(30회/시간) 적용.

---

### C-4. `src/lib/cloudconvert.ts:103` — SSRF 미가드 fetch

```ts
const fileRes = await fetch(fileUrl);
```

`fileUrl`이 CloudConvert API 응답에서 추출된 외부 URL. `ssrf-guard.ts`의 `assertSafeUrl()`이 다른 곳에선 적용돼있는데 이 fetch만 빠짐. CloudConvert 응답 변조 또는 공격자 SSRF 유도 시 `169.254.169.254` 같은 내부 메타데이터 엔드포인트 접근 가능.

**수정**: `assertSafeUrl(fileUrl)` 선행 또는 `safeFetch(fileUrl)` 사용.

---

## High — 다음 스프린트 안

| # | 위치 | 요약 |
|---|---|---|
| H-1 | `src/app/api/events/draft/route.ts:73` | 자연어→일정 AI 호출에 rate limit 없음 (Haiku지만 무한 호출 누적) |
| H-2 | `src/app/api/profile/route.ts` | `export const runtime = "nodejs"` 누락. Vercel 기본이 Edge로 잡히면 `@supabase/ssr` 쿠키 헬퍼 깨짐 |
| H-3 | `src/lib/auth.ts:26` vs `src/lib/claude.ts` | 프로덕션 가드 기준 env 불일치. `NODE_ENV` vs `VERCEL_ENV` — Vercel preview에서 비대칭 |
| H-4 | `src/app/api/chat/threads/route.ts:126` | `materialId`가 `z.string().uuid()` 아닌 `typeof string`만 검증 |
| H-5 | `supabase/migrations/0020_jobs_tool_check_extend.sql` | git에서 `M` 상태 — 이미 적용된 마이그레이션 수정은 CLAUDE.md §6 위반. `0023_*.sql`로 분리 |

---

## Medium — 출시 후 첫 스프린트

| # | 위치 | 요약 |
|---|---|---|
| M-1 | `src/lib/services/chat.ts:134-168` `fetchRecentMessages` | `.eq("owner_id", ownerId)` 가드 누락 — 향후 재사용 시 노출 위험 |
| M-2 | `src/lib/parsers/types.ts:27` | `MAX_PARSE_BYTES=60MB` vs 버킷 25MB 불일치. 주석이 거짓말 |
| M-3 | `src/lib/services/report-structure.ts:97` | 오류 로깅 시 modelId 하드코딩 — env override 변경 시 비용 추적 오차 |
| M-4 | `src/lib/services/chat-free.ts:57` | 클라이언트가 보낸 `history` 검증 없이 그대로 모델로 전달 → 이전 발언 위조 가능 |
| M-5 | `supabase/migrations/0022_wrong_items_topic.sql:46` | "RLS는 quiz_attempts에서 상속" 주석이 service-role 우회 케이스를 누락 — 경고 명시 필요 |

---

## Low / Nit

- **L-1** `src/app/api/chat/threads/route.ts:57-88, 161-174` · `chat.ts` — `as unknown as { ... }` 반복. typed wrapper로 집중
- **L-2** `src/lib/cloudconvert.ts:121` — `hwp`/`hwpx` 화이트리스트 포함. PRODUCT.md §2-2 MVP 제외 항목이면 주석 또는 제거
- **L-3** `src/app/api/events/draft/route.ts` — `export const maxDuration` 누락
- **L-4** `src/lib/sanitize.ts:33` — 학번 패턴이 연도 숫자 오탐 가능

---

## 📊 테스트 갭

- **`parseChatResponse`** (`src/lib/services/chat.ts:36`) — `[CITATIONS]{...}` 파싱, 정규식 엣지케이스 무테스트
- **`validateOutput`** (`src/lib/services/report-structure.ts:242`) — §4 치팅 가드의 핵심인데 0
- **`sanitizeUserInput`** / **`maskPersonalInfo`** — C-1 버그 조기 발견 가능했던 위치
- **`extractRelevantChunks`** / **`formatChunksAsHint`** (`src/lib/rag/`) — RAG 품질 핵심인데 0

---

## 🧱 마이그레이션 위험

- **`0020_jobs_tool_check_extend.sql`** — git `M` 상태, CLAUDE.md §6 위반 (H-5 참조)
- **`0022_wrong_items_topic.sql`** — `cross join lateral jsonb_array_elements(a.results)`가 `a.results NULL` 또는 비배열일 때 뷰 전체 오류. `jsonb_typeof(a.results) = 'array'` 가드 필요
- **`0002_storage.sql`** — 주석 거짓말(25MB vs 60MB)

---

# II. 🎨 UI/UX 깨짐 (UX Architect)

## Critical — 출시 차단급

### U-1. 모바일 캘린더 월뷰가 한 화면에 안 들어옴
`src/app/dashboard/calendar/calendar-board.tsx:1020` — 셀 `min-h-[94px]` × 6주 = 564px. iPhone 14에서 topbar·tabbar·헤더 빼면 ~710px 안에 강제 스크롤. EventChip은 `text-[11px]` + 셀당 3개 + "외 N" → **칩이 거의 안 읽힘**.
→ 모바일은 `min-h-[68px]`로 줄이고 풀스크린에 한 달이 다 들어오게. 칩 줄 수는 2 + `+N`.

### U-2. 캘린더 헤더 버튼 8개가 모바일에서 wrap 두 줄
`src/app/dashboard/calendar/calendar-board.tsx:412-522` — monthLabel + nav 3개 + ScaleToggle 4탭 + ViewModeToggle 2탭 + import 아이콘 2개. iPhone 375px에서 두 줄로 깨지고 터치 타깃 32px(Apple HIG 44px 미달).
→ 모바일은 ScaleToggle 숨기고 import 아이콘 2개를 1개 드롭다운으로.

### U-3. 모바일·iPad 퀴즈 진행률 사이드바가 본문 위 400px
`src/app/dashboard/quiz/[quizId]/quiz-solver.tsx:233-292` — `lg:sticky lg:top-6` 240px 사이드바가 lg 미만(<1024)에선 본문 위 거대 카드. iPad 세로(820)·모바일에서 첫 문제까지 ~400px 스크롤.
→ 모바일·태블릿은 sticky bottom 슬림 헤더(40px)로 압축, 4×4 번호 그리드는 가로 스크롤 칩.

### U-4. 랜딩 모바일에 미리보기 카드 안 보임
`src/app/page.tsx:78-148` — `hidden md:block`이라 모바일에선 hero 텍스트만 풀 높이 + 빈 그라데이션. **이게 뭐 하는 서비스인지** 시각 단서 0.
→ 모바일에서도 "이런 화면을 받는다" 미니 카드 1개를 `mt-8 md:hidden`으로.

### U-5. 내 캠퍼스 빈 상태에 1순위 CTA 없음
`src/app/dashboard/page.tsx:106` — hero "지금 손대야 할 것만." 회색 한 문장. 시간표·자료 둘 다 없는 첫 진입 사용자는 SemesterSafetyPanel 빈 상태(`hasSignals=false`) + 4-grid CampusIntake 동등 위계 카드 4개 → **다음 동작이 5초 안에 떠오르지 않음.**
→ 빈 상태일 때 "시간표 한 장 올려보기" Primary 다크 버튼 1개를 hero 아래에 강제.

### U-6. 사이드바 collapsed에서도 `/api/courses` 매번 호출
`src/components/sidebar.tsx:184-194 + 455` — `overflow-hidden`만 걸려있고 DOM은 살아있어 `useSidebarCourses` fetch가 collapsed 상태에서도 실행. 모바일에선 collapse 토글 SSR 깜빡임.
→ collapsed면 `hidden`으로 DOM 제거. 토글은 `setMounted` 패턴.

---

## High — 다음 스프린트

| # | 위치 | 위반 |
|---|---|---|
| U-H1 | `src/app/dashboard/tools/page.tsx:344-348, 412-417` | 좌측 동그라미 점(●) — DESIGN.md §10 직접 위반 |
| U-H2 | `src/app/dashboard/page.tsx:251` TrustSection | 좌측 success 도트 3개 행 |
| U-H3 | `src/app/dashboard/page.tsx:106-114` | 마침표 카피 4개 연속 ("...것만." "...먼저." "...일정." "...과목.") |
| U-H4 | `src/app/dashboard/today/page.tsx:296, 444` | H2가 마침표 감성 카피 — 정보 라벨인데 마케팅 톤 |
| U-H5 | `src/app/dashboard/study/page.tsx:141, 208` | "과목 폴더." / "자격증·시험·개인 공부." |
| U-H6 | `calendar-board.tsx:1192-1213` EventChip allDay | 셀 가로 가득 컬러 막대 → 학기 import 후 캘린더 무지개 |
| U-H7 | `quiz-solver.tsx:253` | 진행률 바 파랑→초록 그라데이션 (액센트 두 개) |
| U-H8 | `quiz-solver.tsx:301` | `backdrop-blur-xl` + 70px shadow — 카드 뒤 흰 배경뿐 |
| U-H9 | `quiz-solver.tsx:235, 384` | `rounded-[24px]` / `rounded-full` 52px — §10 라운드 16px 초과 |
| U-H10 | `src/app/dashboard/chat/chat-view.tsx:191` | 전체 배경 단색 (대시보드 다른 페이지는 radial blob) |
| U-H11 | `src/app/dashboard/chat/chat-view.tsx:194-208` | 첫 진입 안내 박스가 화면 깎음 |
| U-H12 | `src/components/sidebar.tsx:17-23` | `SEMESTER = "2026 봄학기 5/15주차"` mock 하드코딩 → 매일 보는 사이드바에 거짓 데이터 |

---

## Medium

| # | 위치 | 위반 |
|---|---|---|
| U-M1 | `calendar-board.tsx:1037` | 오늘 셀이 파란 동그라미 — Google Calendar 클리셰 |
| U-M2 | `src/app/dashboard/today/today-hero.tsx:139-152` | 흰 카드 안 또 흰 카드 — elevation 위계 무너짐 |
| U-M3 | `src/app/dashboard/page.tsx:357-388` CampusIntake | 색만 다른 4-grid — §A-3 fail |
| U-M4 | `material-view.tsx:239` | 챗 FAB가 💬 이모지 |
| U-M5 | `material-view.tsx:209` | 분할 핸들 grip이 `⋮⋮` 문자 — 학생이 드래그 가능성 인지 못함 |
| U-M6 | `src/app/dashboard/error.tsx:24-29` | `⚠` 이모지 본문 |
| U-M7 | `sidebar.tsx:339-345` | `#fff0f3`·`#e0445e` 토큰 외 hex 하드코딩 |
| U-M8 | `sidebar.tsx:24-25` | `TODAY_SIGNAL_COUNT = 1` 또 mock — 신호 배지 항상 "1" |
| U-M9 | `sidebar.tsx:704-712 Avatar` | 모든 사용자가 같은 핑크 그라데이션 |
| U-M10 | `wizard-shell.tsx:13-25 WizardWatermark` | 카드 바깥 회색 한 줄 — 스크린샷 공유 시 빠지기 쉬움 (§4 가드 약화) |

---

## 📱 반응형 깨짐 맵

| 화면 | Mobile (<640) | iPad (768~1024) | Desktop (≥1280) |
|---|---|---|---|
| 랜딩 `/` | 🔴 미리보기 카드 안 보임 | 🟡 92svh hero 길어 두 번 스크롤 | 🟢 |
| 로그인·온보딩 | 🟡 학년 chip 78px | 🟢 | 🟢 |
| 내 캠퍼스 | 🟠 4-grid 세로 4개 적층 | 🟠 1.2fr/0.8fr md에서 빈 공간 | 🟢 |
| Today | 🟠 카운트다운 셀 24px | 🟡 grid-2 좁아짐 | 🟢 |
| 캘린더 | 🔴 한 달이 한 화면 X + 헤더 두 줄 | 🟠 sidebar 압축 안 됨 | 🟢 |
| 자료 학습 | 🟠 FAB 이모지 + PDF 새 탭만 | 🟠 768px 좌우 50/50 → 350px FitH 무력 | 🟢 |
| 위저드 | 🟠 단계 헤더 작음 | 🟠 본문 + 280px 사이드바 좁음 | 🟢 |
| 퀴즈 풀이 | 🔴 사이드바 본문 위 400px | 🔴 iPad 세로(820)에서 깨짐 | 🟢 |
| 챗 | 🟡 안내 박스 + 평평한 배경 | 🟡 | 🟡 |

---

## ✨ "있으면 학생이 놀랄" 디테일 5

1. **TodayHero "이거 끝나면" 박스 → next-event 카운트다운 자동 전환** (today-hero.tsx:139-152)
2. **과목 카드 좌측 ribbon에 학기 진척 % 미니바** (study/page.tsx CourseCard) — 시각으로 5초 안에 강의별 진척 잡힘
3. **모바일 캘린더 EventChip long-press → "내일로 / 이번 주말 / 다음 주" 시간 시프트 단축 액션** (이미 `navigator.vibrate(8)`만 있음)
4. **자료 split-view에서 PDF 페이지 동기 인디케이터** — iframe message API로 1초 polling, 요약 헤더에 "현재 보고 있는 p.N" + PageChip 자동 하이라이트
5. **위저드 첫 단계에서 "최근 자료 3개" chip 1탭 attach** — Gemini A/B의 evidence 0% 문제와도 직결

---

# III. 🎯 제품 갭 (Sprint Prioritizer)

## 출시 전 반드시 막아야 할 갭 — Top 5

### P-1. 친구 초대 viral 루프 — 완전 부재
PRODUCT.md §1-3 · §2-1 기능 4 · §6-1 MVP 8개 중 4번 · KPI §8-1 K=0.3 6개월 목표. **STATUS.md에 `invite`·`referral` 흔적 0.**

**1주 안 최소 형태**: `/dashboard/invite` 단일 페이지 + `profiles.invite_code` 컬럼 + 회원가입 시 `?ref=` 받아 양쪽 "Pro 7일" 플래그. 공유 URL과 코드 카운터만으로도 K 측정 시작.

### P-2. 강의계획서 "감탄 순간"이 첫 5분에 안 들어옴
PRODUCT.md §1-4 "한국 강의계획서 파싱 사전"이 1순위 moat. `/calendar/import`는 살아있지만 **온보딩에서 강제되지 않음.** 사용자가 찾아 들어가야 함. PRODUCT.md §4-3 온보딩 3·4단계 미실장.

**1주 안 최소 형태**: `/onboarding` 마지막 단계 = "강의계획서 PDF 1개 → 60초 안에 한 학기 캘린더". skip 가능하되 default ON. 완료 직후 캘린더로 자동 이동해 추출된 일정을 와우 모먼트로 노출.

### P-3. 일일 푸시·이메일 다이제스트 0
PRODUCT.md §9-6 리텐션 푸시 + §2-1 기능 3 Today 알림 사양. **STATUS에 web push·이메일 라우트 없다.** 앱을 열어줘야만 Today가 보임 → 4주 재방문율 30%(§6-3) 달성 불가.

**1주 안 최소 형태**: 이메일부터. Vercel Cron + Supabase에서 owner_id별 D-3·D-1·시험 D-7 쿼리 → Resend. Web Push는 권한 마찰 크니 Phase 2.

### P-4. 성적·합격 추적 (차별점 5) — 미구현
PRODUCT.md §0 차별점 5 + §2-1 기능 5 + §11 결론 2 "데이터가 진짜 해자". `courses`에 grades 컬럼 없음. **5년 누적 자산 카운터가 출시 시점에 0에서 시작하면 코호트 분석 가치 폭락.**

**1주 안 최소 형태**: `courses` 테이블 `target_grade`·`actual_grade` 컬럼 + `/dashboard/study/[course]` 학기 말 입력 modal. AI 분석은 나중. 데이터를 모으기 시작하는 게 핵심.

### P-5. "치팅 아님"이 비로그인 랜딩에 노출 안 됨
CLAUDE.md §4 "Gauth로 보이면 학교 차단". README에 명시돼있지만 **랜딩 헤드라인에 없다.** 학과 단톡방에 공유될 때 "이건 써도 된다"는 안전 신호가 빠짐.

**1주 안 최소 형태**: `/` 헤드라인에 "**리포트 본문은 안 써줍니다. 구조와 예상 질문만.**" 학칙 친화 카피.

---

## Phase 1 안에 채울 갭 — Top 5

1. **시험 후 회고 (post-mortem)** — STATUS 백로그 마지막 줄에 "정의됐는데 미연결". PRODUCT.md §2-2 기능 7 "학기 종료 이탈을 막는 유일한 P1". 11월·6월 골든타임 놓치면 retention 폭락.
2. **결제 시스템 0** — PRODUCT.md §6-1 MVP 8번. STATUS에 토스/아임포트 흔적 0. Phase 2 결제 검증 진입 의사결정 불가능.
3. **Tools 탭 12종 중 8종 mock** — STATUS가 "4종만 클릭 가능, 5종 redirect, 5종 ⚫ 준비 중" 명시. 첫 진입 사용자에게 **제품 미완성 인상** 직접 노출. 못 만들 위저드는 카탈로그에서 빼거나 "대기 중 N명" 카드로 교체.
4. **퍼널 측정 인프라** — PRODUCT.md §6-3 "첫 7일 자료 업로드 50%" GO/STOP인데 측정 불가. PostHog 무료 + funnel 정의 1주차.
5. **자유 챗 영속화** — `chat_threads`(0018)·`chat_messages` 테이블은 있는데 UI 미연결. 어제 뭐 물어봤지를 못 찾으면 매일 열 이유 하나 잃음. 1~2일.

---

## Phase 2 진입 조건 — 측정 가능성

| GO/STOP 지표 (PRODUCT §6-3) | 측정 가능? | 사유 |
|---|---|---|
| 학생 베타 100명 | △ | 가입은 되지만 모객 채널·도메인 인지 미언급 |
| 첫 7일 자료 업로드 50% | ❌ | 퍼널 트래킹 없음 |
| 4주차 재방문율 30% | ❌ | 푸시·이메일 없음 → 자연 재방문 의존 |
| 첫 결제 사용자 10명 | ❌ | 결제 시스템 0 |
| NPS 40+ | ❌ | NPS 위젯·설문 미구현 |
| 친구 초대 K 0.3+ | ❌ | viral 루프 0 |

**6개 중 5개가 측정조차 못 함.** "기능은 다 만들었는데 GO/STOP을 못 판단" 함정 진입 중.

---

## 차별점 5초 전달

| 차별점 | 현재 위치 | 문제 | 제안 |
|---|---|---|---|
| 1. 강의계획서 자동 일정화 | `/calendar/import`에 묻힘 | 랜딩에 데모 GIF 0 | 1스크롤에 "PDF 1장 → 캘린더 12개 일정" 60초 GIF |
| 2. 위저드 학습 보조 | `/tools` 4탭 마지막 | 첫 사용자가 안 봄 | 온보딩 마지막 단계 강제 시연 |
| 3. 학기+시험+자격증 통합 | — | 자격증 Phase 2 | 지금은 노출 X가 정답. 미완성 인상 차단 |
| 4. 친구 초대 viral | — | 부재 | P-1 |
| 5. 성적·합격 추적 | — | 부재 | P-4 |

**5개 중 사용자에게 5초 안에 전달되는 게 0개.**

---

## 재방문 동력 점수표 (10점)

| 화면 | 점수 | 근거 |
|---|---|---|
| `/dashboard` 내 캠퍼스 | 6 | 학기 안전망 신호는 좋은 훅. 푸시 없이 자발 재방문은 약함 |
| `/dashboard/today` | 4 | 캘린더와 중복. "단 하나의 화면(§2-1)"인데 둘로 분산 |
| `/dashboard/calendar` | 7 | 매일 기본 습관 |
| `/dashboard/study` | 5 | 시험기간만 폭발 |
| `/dashboard/review` | 6 | FSRS 살아있다면 7~8. STATUS에 명시 없음 |
| `/dashboard/tools` | 2 | 발표·과제 직전만 |
| `/dashboard/chat` | 3 | ChatGPT 있으면 굳이? 자료 기반 챗만 강력 |

내 캠퍼스 + Today가 **갈라져 동력 분산** — 합쳐야 §11 "Today 5분이 모든 것"이 작동.

---

## 30만 도달 시나리오 — 정직

- **도달 가능 (조건)**: 강의계획서 데모 1회 바이럴(누적 조회 500만+) + K 0.4+ + 학기 시작 3·9월 광고 집중 + 학과 단톡방 침투. **3년 시점.** PRODUCT §8-1 24개월 20만 목표에 +50%.
- **비현실 (왜 못 감)**: 지금처럼 viral·푸시·랜딩 약함 상태로 인스타 광고 CAC 5,000~8,000원 × 30만 = **15~24억 마케팅비.** Phase 1 자본 7천만 원의 20~30배. 천억 매출 회사 못 됨. §11 "마케팅으로 키운 회사는 마케팅으로 죽는다."

**현실적 상한**: viral + 푸시 + 성적추적 다 박은 후 **18개월에 3~5만 명**이 합리적 목표선. 30만은 "결제 검증 통과 + 시드 3억 + Year 2 시리즈A 10억" 24개월 끝점.

---

## "이거 한 가지만 추가해도 viral" 후크 3

1. **강의계획서 → 한 학기 캘린더 60초 공유 카드** — 추출 완료 시 자동 이미지 카드 1장 생성 → 인스타 스토리 1탭 공유. "내 강의계획서도 해줘"로 자연 전환. moat 1 + 차별점 4 동시 가동.
2. **"같은 과목 N명 모이면 잠금 해제"** — PRODUCT.md §2-1 기능 4의 최소형. 같은 강의명·교수명 3명 모이면 "이 과목 평균 정답률 67%" 통계 1줄. 자료 공유는 X(저작권). 희소성+동질감 트리거.
3. **"학점 받으면 친구에게 1주 무료 푸시"** — 성적 입력 + post-mortem 작성 시 초대해준 친구에게 Pro 1주 자동 푸시. 학기 종료 이탈 골든타임에 친구가 친구를 깨움. K 0.4의 핵심 후크.

---

# IV. 🗓 권장 실행 순서 (4주)

## Week 1 — 출시 차단급 (코드 4 + UI 3 + 카피 1)
- [ ] C-1 sanitize 공백 버그
- [ ] C-2 치팅 가드 항등식
- [ ] C-3 materials/finalize rate limit
- [ ] C-4 cloudconvert SSRF
- [ ] U-1, U-2 모바일 캘린더 (월뷰 압축 + 헤더 정리)
- [ ] U-3 퀴즈 사이드바 모바일·iPad 슬림
- [ ] P-5 랜딩 헤드라인 "본문은 안 써줍니다"

## Week 2 — 제품 viral 인프라
- [ ] P-1 친구 초대 (`/dashboard/invite` + invite_code + ref 보상)
- [ ] P-2 온보딩 마지막 단계 = 강의계획서 강제
- [ ] P-4 성적 추적 컬럼 + modal 1개
- [ ] V-1 강의계획서 공유 카드 (이미지 1장 + 인스타 스토리)

## Week 3 — 재방문 + 측정
- [ ] P-3 이메일 다이제스트 (Resend + Vercel Cron)
- [ ] Phase1-4 PostHog funnel 정의
- [ ] Phase1-5 챗 영속화 UI 연결
- [ ] U-H1~H12 디자인 §10 위반 일괄 정리

## Week 4 — 후크 + Phase 2 준비
- [ ] Phase1-1 post-mortem 위저드 연결
- [ ] Phase1-3 Tools 탭 ⚫ 카드들 정리 (대기열 카드 또는 제거)
- [ ] V-2 "같은 과목 N명" 통계 최소형
- [ ] Phase1-2 결제 시스템 스파이크 (토스페이먼츠 단순 결제 1건)

---

# V. 🔚 닫는 한 줄

**지금 상태는 "예쁘게 만든 학습 도구"다. 30만으로 가려면 "친구가 친구를 부르는 학기 운영 OS"가 돼야 하고, 그 차이는 위 Week 1~4 안의 12개 항목으로 메워진다.** 코드 결함은 1일이면 끝나고, viral·푸시·성적추적은 각 2~3일. 4주 안에 다 가능하다.
