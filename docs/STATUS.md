# 현재 구현 상태 (2026-05-28 기준, 최종 갱신)

> 이 문서는 **지금 무엇이 살아있고 무엇이 미구현인지**의 단일 출처다.
> 청사진(설계 의도)은 [ARCHITECTURE.md](ARCHITECTURE.md), 제품 범위는 [PRODUCT.md](PRODUCT.md).

## 갱신 이력

- **2026-05-28 (최신)** — 자료 업로드 시점에 **자료 종류 선택 모달**(강의자료/기출문제), 기출 추출 동선을 문제 생성 폼과 **통합**(별도 화면 제거), 사이드바·과목 카드 **우클릭 컨텍스트 메뉴**(이름·교수·색상 수정·삭제), 문제 생성 폼의 추천 흐름 프리셋 제거(디자인 정리), **0023 quizzes.question_count cap 30**, **0022 wrong_items_v.topic** 약점 단원 통계, 모바일 UI 8건 + 캘린더 CRUD 2건, 챗 RAG 키워드 hint, SDK 직접 사용(AI Gateway 미사용).
- **2026-05-28** — AI Gateway 도입 후 SDK 직접 사용으로 복귀 (`anthropic/...`·`google/...` slug 제거). `QUIZ_MODEL_VENDOR`·`SUMMARY_MODEL_VENDOR=google`로 Gemini 2.5 Flash A/B 가능(기본 OFF, prod 강제 차단). 0021 `generations.model_provider` 컬럼 추가. PRICING.haiku 단가 보정($0.8/$4 → $1/$5).
- **2026-05-28** — 비로그인 랜딩 페이지·약관/개인정보 페이지 신설, 내 캠퍼스 홈을 **학기 안전망** 중심으로 개편, 시간표·강의계획서 import 강화(syllabus-extract Haiku → Sonnet).

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
| `/dashboard/study` | 실DB | 강의 그룹 + 최근 활동, **과목 우클릭 메뉴** (이름·교수·색상 수정·삭제) |
| `/dashboard/study/[course]` | 실DB | 자료 그리드 + 업로드 존 + **자료 종류 선택 모달**(강의자료 기본 / 기출문제) |
| `/dashboard/study/[course]/[material]` | 실DB | 자료 + 요약/퀴즈, PDF↔요약 분할 뷰(너비 드래그), 자료 챗, **type=exam이면 기출 추출 통합 폼** |
| `/dashboard/calendar` | 실DB | 월/주/일 뷰, 이벤트 인라인 편집, 자연어·시간표·강의계획서 추출, **HITL confidence**, 한국어 음성 받아쓰기 |
| `/dashboard/calendar/import` | 실DB | 시간표/강의계획서 import 플로우(추출→**confidence 확인**→저장) |
| `/dashboard/chat` | 실(SSE) | 자유 챗 — 클라이언트 상태 + `/api/chat/free` 스트리밍 |
| `/dashboard/review` | 실DB | 오답 모아보기 + **약점 단원 통계** (wrong_items_v.topic 기반) |
| `/dashboard/history` · `/history/[gid]` | 실DB | 위저드 결과 목록·재방문 |
| `/dashboard/quiz/[quizId]` (+result, +wrong) | 실DB | 퀴즈 풀이·채점·오답, **step-by-step 풀이 모드** |
| `/dashboard/tools` | mock 카탈로그 | 위저드 12종 카드 배열 (4종만 클릭 가능) |
| `/dashboard/tools/{presentation,exam-cram,report-checklist,report-structure}` | 실(API) | 위저드 본체 — courses/materials 조회 + 비동기 생성 |
| `/dashboard/settings/security` | UI | — |
| `/dashboard/dev/*` | 실DB | audit·cache·quiz 디버그 (개발용) |

---

## API 라우트 (src/app/api)

AI 호출 라우트는 모두 `guardRateLimit("ai", ownerId)` + `force-dynamic`, 대부분 `maxDuration` 300s (chat 60s).

- **자료·생성**: `materials`(+upload-url/finalize/[id]/{summarize,quiz,exam-extract,original-url}) · `quiz`(+[id]/submit) · `summarize`
  - `finalize` 가 `type: "lecture" | "exam" | ...` 받아서 `materials.type`에 박음 (업로드 모달에서 선택)
- **추출**: `syllabus`(+confirm) · `timetable`(+confirm) · `events/draft`(자연어→일정) · `calendar/imports/reset`(import 초기화)
- **위저드(비동기)**: `wizards/presentation` · `wizards/exam-cram` · `wizards/report-checklist` · `wizards/report-structure` — 모두 `after()` + `jobs` 테이블 + 폴링(`jobs/[id]`, `jobs/active`)
- **챗**: `chat/free`(SSE) · `chat/threads`(+[id], +[id]/messages)
- **CRUD**: `account` · `profile` · `courses`(+[id]) PATCH·DELETE · `events`(+[id]) · `activity`

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

## 자료 흐름 (2026-05-28 통합)

```
업로드 존
  │
  ▼ 파일 선택
  ┌─────────────────────┐
  │ "이 자료의 종류는?" │ ← 모달 (chip: 강의자료 기본 / 기출문제)
  └─────────────────────┘
  │
  ▼ 종류 확정
  finalize API (type 박힘)
  │
  ▼
  자료 상세 페이지 (type 분기)
    │
    ├── type=lecture 등: 요약(Haiku) + 분할 뷰 + "문제 만들기" 폼
    │     └─ 폼: 난이도·문제수(1~30)·종류(객·단·서)·범위·추가 요청 → quiz API (Sonnet)
    │
    └── type=exam: "기출문제 추출하기" 통합 폼
          └─ 폼: 모든 옵션 숨김, 안내문만 → exam-extract API (Haiku, env로 Sonnet)
                자료 본문에 실린 문제·정답·해설을 그대로 가져옴 (새 생성 X)
```

이전엔 type=exam 자료에서 별도 Empty/Loading/Error 화면이 떠 있었으나, 2026-05-28 동선 통합으로 일반 자료와 같은 "문제 만들기" 진입점을 쓰되 폼 내용만 분기한다.

---

## AI 레이어 (실제 호출 중)

- **진입점** [src/lib/claude.ts](../src/lib/claude.ts) — `generate()`(JSON 출력) / `streamChatReply()`(SSE). 모든 system 메시지에 injection guard prepend + 1h ephemeral 캐싱.
- **모델**: `claude-sonnet-4-6`, `claude-haiku-4-5`. 매핑은 `TOOL_MODEL`.
  - **Haiku**: summarize · post-mortem · event-parse · exam-extract · chat · chat-free
  - **Sonnet**: quiz · presentation · wizard-cram · report-structure · timetable-extract(Vision) · **syllabus-extract**(2026-05-28 Haiku→Sonnet 승격)
  - env override: `QUIZ_MODEL` · `EXTRACT_MODEL` · `CHAT_MODEL` · `CHAT_FREE_MODEL` · `SYLLABUS_MODEL` (`haiku`|`sonnet`)
- **vendor 분기**: `QUIZ_MODEL_VENDOR=google` · `SUMMARY_MODEL_VENDOR=google` → Gemini 2.5 Flash. **prod에선 강제 무시** (2026-05-28 1회 A/B evidence 매칭 0% — 재측정 전 차단).
- **프롬프트** [src/lib/prompts.ts](../src/lib/prompts.ts) — `loadPrompt(name)`이 `_shared/persona-schema.md` + `_shared/master-rules.md` + 도구별 `*.md`를 조합.
  - 도구별: summarize · quiz · presentation · syllabus · timetable · exam-cram · report-checklist · report-structure · event-parse · exam-extract · chat · chat-free
- **출력 검증** [src/lib/schemas.ts](../src/lib/schemas.ts) — Zod. 위저드 결과는 후처리 검증까지 (예: report-structure는 핵심 질문이 `?`로 끝나는지 — 치팅 가드).
- **챗 RAG**: 자료 기반 챗은 키워드 매칭으로 관련 청크 hint를 system에 prepend → 발췌 정확도 보강.

---

## 데이터·인증 레이어 (실제 동작)

- **Supabase** — Auth + Postgres + Storage + RLS + Realtime.
  - [src/lib/supabase/](../src/lib/supabase/): `client`(브라우저 anon) · `server`(SSR anon+cookie) · `admin`(service-role, RLS 우회) · `types`
  - admin client는 항상 `owner_id`를 세션과 재검증 (RLS 우회 가드).
- **인증** [src/lib/auth.ts](../src/lib/auth.ts) — `getOwnerId()`/`tryGetOwnerId()`. 세션 있으면 user.id, dev는 fallback UUID, prod 세션 없으면 401.
- **데이터 레이어** [src/lib/data/](../src/lib/data/): `activity` · `attempts` · `events` · `jobs` · `materials` · `profile` · `quizzes` · `wizard-history` · `semester-safety`(홈 학기 안전망 — 마감·시험·오답·방치 자료 신호 + 과목 위험도 집계) — 전부 `server-only` + admin + owner 검증.
- **레이트리밋** — Upstash Redis. 미설정 시 우아하게 통과.

---

## DB 마이그레이션 (0001 ~ 0023, 전부 적용됨)

`supabase/migrations/`. 주요 테이블: `profiles` · `courses` · `materials` · `generations` · `quizzes`(+questions/attempts) · `events` · `jobs` · `chat_threads`(+messages) · `audit_log`. 모두 RLS + `owner_id` 격리.

| # | 무엇이 들어왔나 |
|---|---|
| 0001 init | profiles · courses · materials · generations 기본 스키마 |
| 0002 storage | Supabase Storage 정책 |
| 0003 dev_seed | 개발용 시드 |
| 0004 relax_uploads | 업로드 제약 완화 |
| 0005 quizzes | quizzes + questions + attempts |
| 0006 material_summaries | 자료 요약 |
| 0007 events | 캘린더 |
| 0008 jobs | 비동기 작업 |
| 0009 attempt_review | 오답 리뷰 |
| 0010 course_category | semester / personal 분리 |
| 0011 materials_pdf_convert | HWP·Office → PDF 변환 |
| 0012 events_enrich | 이벤트 확장 |
| 0013 quizzes_mode | 퀴즈 모드 (생성 vs 추출) |
| 0014 jobs exam-extract | 기출 추출 tool 추가 |
| 0015 jobs realtime | jobs realtime 채널 |
| 0016 audit_log | 감사 로그 |
| 0017 drop_unused_pii_indexes | 인덱스 정리 |
| 0018 chat_threads | 챗 스레드·메시지 |
| 0019 audit_log_rollup | 감사 로그 집계 |
| 0020 jobs_tool_check_extend | `report-checklist`·`report-structure`·`chat`·`chat-free` jobs.tool CHECK 추가 |
| **0021** generations.model_provider | A/B 라벨링 |
| **0022** wrong_items_v.topic | 약점 단원 통계 view |
| **0023** quizzes_question_count_check | cap 1~20 → 1~30 (시험 직전 대량 점검) |

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
- `ai@^6` + `@ai-sdk/anthropic@^3` + `@ai-sdk/google@^3` (Anthropic 기본, Google은 A/B용)
- `@supabase/ssr@^0.10` · `@supabase/supabase-js@^2`
- `@upstash/ratelimit@^2` · `@upstash/redis@^1`
- 파서: `unpdf` · `mammoth` · `exceljs` · `officeparser` · `file-type` · `tiktoken`
- `zod@^4` · `clsx` · `tailwind-merge` · `lucide-react`
- dev: `@biomejs/biome@^2` · `vitest@^4` · `typescript@^5` · `husky@^9`

---

## 백로그 / 미구현 (Phase 2~3)

- **위저드 8종 (팀플·진로·자기소개서·면접·공모전)** — MVP 제외 (PRODUCT §6-1)
- **챗 스레드 영속** — 생성 API는 있으나 자유 챗은 클라이언트 상태만
- **친구 초대 viral loop** — 초대 코드·스터디 모드 (PRODUCT §2-1 기능 4)
- **성적·합격 추적** — PRODUCT §2-1 기능 5
- **공모전·대외활동 플레이어** — PRODUCT §2-2 기능 8
- **post-mortem (시험 후 회고)** — 도구 정의·프롬프트는 있으나 UI 미연결
- **자료 협업·고급 분석** — Phase 3+
- **자료 종류 "기타" 직접 입력** — 현재 picker는 강의자료/기출문제 2종. "기타 자유 입력"은 `custom_type_label` 마이그레이션 필요 → 별도 PR
