# 현재 구현 상태 (2026-05-28 기준)

> 이 문서는 **지금 무엇이 살아있고 무엇이 미구현인지**의 단일 출처다.
> 청사진(설계 의도)은 [ARCHITECTURE.md](ARCHITECTURE.md), 제품 범위는 [PRODUCT.md](PRODUCT.md).
>
> 2026-05-09 시점의 옛 STATUS는 "AI 호출 0건 / DB 미구현 / 위저드 발표만 데모"였으나,
> 그 이후 데이터·AI·인증 레이어가 전부 실제로 붙었다. 아래는 그 반영본이다.
>
> **2026-05-28 갱신**: 비로그인 랜딩 페이지·약관/개인정보 페이지 신설, 내 캠퍼스 홈을
> '학기 안전망' 중심으로 개편, 시간표·강의계획서 import 플로우 강화(syllabus-extract Haiku→Sonnet).
>
> **2026-05-28 후속**: AI Gateway 도입(`anthropic/...`·`google/...` slug 라우팅). `QUIZ_MODEL_VENDOR`·`SUMMARY_MODEL_VENDOR=google`로 Gemini 2.5 Flash A/B 가능(기본 OFF). `generations.model_provider` 컬럼 추가(마이그레이션 0021). PRICING.haiku 단가 보정($0.8/$4→$1/$5).

## 라이브 데모

- 프로덕션: https://arch-campus.vercel.app (Vercel + GitHub auto-deploy)
- GitHub: https://github.com/0625yt/arch-campus
- `main` push → production 자동 배포 / 다른 브랜치 → preview URL
- `vercel.json`은 framework preset 고정용 — 지우지 말 것

---

## 라우트 — 대부분 실제 DB/AI 연결 (mock 아님)

`/dashboard/*`는 전부 `force-dynamic` (SSR, 캐시 X).

| 라우트 | 상태 | 데이터 |
|---|---|---|
| `/` | 비로그인 랜딩(마케팅) / 로그인 시 대시보드 리다이렉트 | 인증 체크 |
| `/privacy` · `/terms` | 개인정보처리방침·이용약관 | 정적 |
| `/login` · `/onboarding` | 폼 | Supabase Auth |
| `/dashboard` (내 캠퍼스) | 실DB | **학기 안전망** — 마감·시험·오답·방치 자료 신호 + 과목 위험도, 다가오는 일정, 강의 그리드 (`semester-safety.ts`) |
| `/dashboard/today` | 실DB | 다가오는 일정 + 최근 활동 |
| `/dashboard/study` | 실DB | 강의 그룹 + 최근 활동 |
| `/dashboard/study/[course]/[material]` | 실DB | 자료 + 요약/퀴즈, PDF↔요약 분할 뷰(너비 드래그), 자료 챗 |
| `/dashboard/calendar` | 실DB | 월/주/일 뷰, 이벤트 인라인 편집, 자연어·시간표·강의계획서 추출 |
| `/dashboard/calendar/import` | 실DB | 시간표/강의계획서 import 플로우(추출→확인→저장) |
| `/dashboard/chat` | 실(SSE) | 자유 챗 — 클라이언트 상태 + `/api/chat/free` 스트리밍 |
| `/dashboard/review` | 실DB | 오답 모아보기 |
| `/dashboard/history` · `/history/[gid]` | 실DB | 위저드 결과 목록·재방문 |
| `/dashboard/quiz/[quizId]` (+result, +wrong) | 실DB | 퀴즈 풀이·채점·오답 |
| `/dashboard/tools` | mock 카탈로그 | 위저드 12종 카드 배열 (4종만 클릭 가능) |
| `/dashboard/tools/{presentation,exam-cram,report-checklist,report-structure}` | 실(API) | 위저드 본체 — courses/materials 조회 + 비동기 생성 |
| `/dashboard/settings/security` | UI | — |
| `/dashboard/dev/*` | 실DB | audit·cache·quiz 디버그 (개발용) |

---

## API 라우트 (src/app/api)

AI 호출 라우트는 모두 `guardRateLimit("ai", ownerId)` + `force-dynamic`, 대부분 `maxDuration` 300s (chat 60s).

- **자료·생성**: `materials`(+upload-url/finalize/[id]/{summarize,quiz,exam-extract,original-url}) · `quiz`(+[id]/submit) · `summarize`
- **추출**: `syllabus`(+confirm) · `timetable`(+confirm) · `events/draft`(자연어→일정) · `calendar/imports/reset`(import 초기화)
- **위저드(비동기)**: `wizards/presentation` · `wizards/exam-cram` · `wizards/report-checklist` · `wizards/report-structure` — 모두 `after()` + `jobs` 테이블 + 폴링(`jobs/[id]`, `jobs/active`)
- **챗**: `chat/free`(SSE) · `chat/threads`(+[id], +[id]/messages)
- **CRUD**: `account` · `profile` · `courses`(+[id]) · `events`(+[id]) · `activity`

---

## 위저드 현황 (`/dashboard/tools`)

12종 카탈로그 카드 중:

| slug | 상태 | 연결 |
|---|---|---|
| presentation | ✅ 실동작 | `/api/wizards/presentation` (Sonnet) |
| report-structure | ✅ 실동작 | `/api/wizards/report-structure` (Sonnet) |
| report-checklist | ✅ 실동작 | `/api/wizards/report-checklist` (Sonnet) |
| exam-cram | ✅ 실동작 | `/api/wizards/exam-cram` (Sonnet) |
| presentation-qa | 🔁 redirect | → presentation 위저드 내 Q&A 포함 |
| exam-questions | 🔁 redirect | → `/dashboard/study` 자료별 문제 생성 |
| exam-wrong | 🔁 redirect | → `/dashboard/review` 오답 분석 |
| team-roles · team-minutes · career-* (5종) | ⚫ 준비 중 | MVP 제외 (PRODUCT §6-1: 팀플·진로 = Phase 3) |

- 위저드 4종 모두 마지막 단계에 "추가 요청 사항" 자유 입력.
- 위저드 페이지 우측에 ChatGPT 톤 사이드바 — 전체 위저드 결과 히스토리(탭 필터), 접기/펼치기 localStorage 영속.
- 결과 재방문: `/dashboard/history/[gid]`에서 `generations.payload`를 Zod로 파싱해 ResultCard 렌더.

---

## AI 레이어 (실제 호출 중)

- **진입점** [src/lib/claude.ts](../src/lib/claude.ts) — `generate()`(JSON 출력) / `streamChatReply()`(SSE). 모든 system 메시지에 injection guard prepend + 1h ephemeral 캐싱.
- **모델**: `claude-sonnet-4-6`, `claude-haiku-4-5`. 매핑은 `TOOL_MODEL`.
  - **Haiku**: summarize · post-mortem · event-parse · exam-extract · chat · chat-free
  - **Sonnet**: quiz · presentation · wizard-cram · report-structure · timetable-extract(Vision) · **syllabus-extract**(2026-05-28 Haiku→Sonnet 승격, 추출 정확도)
  - env override: `QUIZ_MODEL` · `EXTRACT_MODEL` · `CHAT_MODEL` · `CHAT_FREE_MODEL` · `SYLLABUS_MODEL` (`haiku`|`sonnet`)
- **프롬프트** [src/lib/prompts.ts](../src/lib/prompts.ts) — `loadPrompt(name)`이 `_shared/persona-schema.md` + `_shared/master-rules.md` + 도구별 `*.md`를 조합.
  - 도구별: summarize · quiz · presentation · syllabus · timetable · exam-cram · report-checklist · report-structure · event-parse · exam-extract · chat · chat-free
- **출력 검증** [src/lib/schemas.ts](../src/lib/schemas.ts) — Zod. 위저드 결과는 후처리 검증까지 (예: report-structure는 핵심 질문이 `?`로 끝나는지 — 치팅 가드).

---

## 데이터·인증 레이어 (실제 동작)

- **Supabase** — Auth + Postgres + Storage + RLS + Realtime.
  - [src/lib/supabase/](../src/lib/supabase/): `client`(브라우저 anon) · `server`(SSR anon+cookie) · `admin`(service-role, RLS 우회) · `types`
  - admin client는 항상 `owner_id`를 세션과 재검증 (RLS 우회 가드).
- **인증** [src/lib/auth.ts](../src/lib/auth.ts) — `getOwnerId()`/`tryGetOwnerId()`. 세션 있으면 user.id, dev는 fallback UUID, prod 세션 없으면 401.
- **데이터 레이어** [src/lib/data/](../src/lib/data/): `activity` · `attempts` · `events` · `jobs` · `materials` · `profile` · `quizzes` · `wizard-history` · `semester-safety`(홈 학기 안전망 — 마감·시험·오답·방치 자료 신호 + 과목 위험도 집계) — 전부 `server-only` + admin + owner 검증.
- **레이트리밋** — Upstash Redis. 미설정 시 우아하게 통과.

---

## DB 마이그레이션 (0001 ~ 0020, 전부 적용됨)

`supabase/migrations/`. 주요 테이블: `profiles` · `courses` · `materials` · `generations` · `quizzes`(+questions/attempts) · `events` · `jobs` · `chat_threads`(+messages) · `audit_log`. 모두 RLS + `owner_id` 격리.

- 0001 init · 0002 storage · 0005 quizzes · 0007 events · 0008 jobs · 0013 quizzes_mode
- 0014 jobs exam-extract · 0015 jobs realtime · 0016 audit_log · 0018 chat_threads · 0019 audit rollup
- **0020 jobs_tool_check 확장** — `report-checklist`·`report-structure`·`chat`·`chat-free`를 jobs.tool CHECK에 추가 (적용 완료)

> 새 ToolKind를 jobs에 INSERT하려면 0020처럼 CHECK 제약을 확장하는 마이그레이션이 필요하다.

---

## 디자인 시스템 (Apple 톤)

- **토큰** [src/app/globals.css](../src/app/globals.css): `--color-apple-pearl/ink/muted/action/hairline` + 시맨틱(success/coral/cobalt/…). 단일 액센트 = action blue `#0071e3`.
- letterSpacing: 본문 `-0.012em`, uppercase eyebrow `0.06em`. chevron `›`.
- 가드는 [docs/design/DESIGN.md](design/DESIGN.md) — 특히 §10 AI 티 패턴 금지(좌측 동그라미 점·마침표 카피 남발·generic shadcn 모달).
- **반응형 1급**: Mobile/iPad/Desktop 동등 지원. 캘린더는 모바일에서 풀스크린(헤더·패딩 제거 + FAB), 위저드 사이드바는 모바일 우하단 pill로 접근.

---

## 알아둘 SSR 함정

- 클라이언트에서 `Date.now()`/`new Date()` 상대시간 → hydration mismatch. `mounted` 플래그 + `suppressHydrationWarning` 패턴.
- localStorage·`matchMedia` 의존 UI(사이드바 접힘, 분할 비율)는 SSR 기본값 → mount 후 반영. 첫 프레임 깜빡임 주의(위저드 사이드바는 mount 전 렌더 차단).
- App Router는 같은 라우트로 돌아올 때 client 컴포넌트 인스턴스를 캐시 → 입력값 초기화는 `useEffect(() => {...}, [])` 마운트 리셋 필요(챗 입력창에서 사용).

---

## 보조 서비스

- **services/hwp-converter** — HWP/HWPX → PDF 변환 마이크로서비스 (LibreOffice + Node, 별도 배포). `HWP_CONVERTER_URL`/`TOKEN` 미설정 시 "PDF로 내보내서 올려주세요" 안내. 호출부 [src/lib/parsers/hwp.ts](../src/lib/parsers/hwp.ts).

---

## 의존성 (실재, package.json)

- `next@16.2.4` · `react@19.2.4` · `react-dom@19.2.4`
- `tailwindcss@4` + `@tailwindcss/postcss`
- `ai@^6` + `@ai-sdk/anthropic@^3` (Anthropic, 실제 호출)
- `@supabase/ssr@^0.10` · `@supabase/supabase-js@^2`
- `@upstash/ratelimit@^2` · `@upstash/redis@^1`
- 파서: `unpdf` · `mammoth` · `exceljs` · `officeparser` · `file-type` · `tiktoken`
- `zod@^4` · `clsx` · `tailwind-merge` · `lucide-react`
- dev: `@biomejs/biome@^2` · `vitest@^4` · `typescript@^5` · `husky@^9`

---

## 백로그 / 미구현 (Phase 2~3)

- 위저드 8종 (팀플·진로·공모전·자기소개서) — MVP 제외 (PRODUCT §6-1)
- 챗 스레드 영속(생성 API는 있으나 자유 챗은 클라이언트 상태만)
- 자료 협업·고급 분석
- 학습 루프 강화(post-mortem 도구는 정의됐으나 미연결)
