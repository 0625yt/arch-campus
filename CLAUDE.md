# CLAUDE.md

이 파일은 Claude Code가 이 저장소에서 코드를 작성할 때 따르는 규칙입니다.
- 제품 정체성·MVP 범위·로드맵·KPI → [docs/PRODUCT.md](docs/PRODUCT.md)
- 디자인 가이드 (색·여백·반응형·체크리스트) → [docs/design/DESIGN.md](docs/design/DESIGN.md)
- 도입 보류 외부 자료·라이브러리 (HWPX·OCR·RAG 보일러플레이트 등) → [docs/REFERENCES.md](docs/REFERENCES.md)
- 코드 리뷰 서브에이전트: `Agent` 툴에 `subagent_type: "code-reviewer"` (`.claude/agents/code-reviewer.md`)
- UI 검증 (스크린샷·반응형): Playwright MCP는 환경 설정만 돼있고 실제 사용 X. 지금까지 검증은 `npm run build` + `curl` 라우트 200 확인으로 충분했음.

---

## 현재 구현 상태 (2026-05-01 기준)

> **§4 아키텍처는 MVP 청사진이고, 그 중 데이터/AI 레이어는 아직 코드가 없다.** UI 셸·디자인 시스템·라우트 11개는 mock data로 다 살아있다. 작업 전에 이 섹션부터 확인할 것.

### 라이브 데모

- 프로덕션: https://arch-campus.vercel.app (Vercel + GitHub auto-deploy)
- GitHub: https://github.com/0625yt/arch-campus
- `git push` → Vercel 자동 배포. 수동 배포는 `vercel --prod`도 가능 (CLI 로그인 필요)
- `vercel.json`은 framework preset 고정용 — 첫 배포에서 Vercel이 Next.js 인식 못 한 이슈 회피. 지우지 말 것

### 라우트 (모두 200, mock data)

- `/` → `/dashboard` 307 ([src/app/page.tsx](src/app/page.tsx))
- `/dashboard` — ChatGPT 톤 시작 화면. 큰 검색창 (⌘K 트리거) + 시작점 4개 ([src/app/dashboard/start-screen.tsx](src/app/dashboard/start-screen.tsx))
- `/dashboard/today` — 코랄 hero + 카운트다운 + 5분 액션 + 주간 리스트
- `/dashboard/study` — 강의 4개 카드 ([src/app/dashboard/study/page.tsx](src/app/dashboard/study/page.tsx))
- `/dashboard/study/[course]` — 강의 상세 + "이번 학기 한눈에" (키워드/Top 개념/한 번 더 볼만해요) + 자료 카드 + 업로드 + xl+에서 좌측 히스토리 패널
- `/dashboard/study/[course]/[material]` — 노션 톤 풀 요약 + 키워드 칩, 우상단/푸터에 **"문제 만들기"** 버튼 → Modal로 GenerateForm
- `/dashboard/calendar` — 업로드 → 강의계획서 카드 → 학기 일정 타임라인. **각 일정 클릭하면 인라인 편집** (강의·종류·날짜·시간·비중·삭제)
- `/dashboard/tools` — 위저드 12종 그리드, 카테고리 필터 칩
- `/dashboard/tools/presentation` — 5단계 위저드 인터랙티브 (입력/선택지 → 결과: 슬라이드 5장 + 예상 질문)
- `/dashboard/history` — 이번 주 4-stat + 14일 contributions + 검색·필터·시간순 그룹

### 글로벌 인터랙션

- **⌘K / Ctrl+K / `/`** — 어디서든 명령 팔레트 ([src/components/command-palette.tsx](src/components/command-palette.tsx)). 페이지·강의·자료·위저드·최근 활동 통합 검색. ↑↓ Enter ESC
- **사이드바** ([src/components/sidebar.tsx](src/components/sidebar.tsx)) — 검색 input · 학습 메뉴 4개 (Today에 마감 코랄 뱃지) · 강의 4개 (클릭 시 `getResumeMaterial()`로 미완료 자료로 점프) · 히스토리 · 학기 진행률 (5/15주차) · User
- **모바일** — 햄버거 좌상단 → Drawer로 사이드바 그대로 노출 ([src/components/mobile-drawer.tsx](src/components/mobile-drawer.tsx)). 사이드바와 마크업 100% 공유 (`SidebarBody onNavigate=`). 탭바는 Today/Study/Calendar/Tools 4개 유지
- **Modal** ([src/components/modal.tsx](src/components/modal.tsx)) — `createPortal`로 `document.body`에 렌더 (main의 `overflow-y-auto`에서 빠져나와 viewport 정중앙). ESC·외부 클릭·body scroll lock·focus 진입

### 디자인 시스템 (단일 출처)

- **공유 컴포넌트** ([src/components/page-shell.tsx](src/components/page-shell.tsx)) — `PageShell`(width: narrow/md/wide), `PageHint`, `PageTitle`, `MetaLine`, `SectionLabel`, `PageFooter`, `EmptyState`. 모든 페이지가 이걸 써야 자동 정합성. **새 페이지 만들 때 절대 자체 외곽 div 만들지 X**
- **타이포 프리미티브** ([src/components/primitives.tsx](src/components/primitives.tsx)) — `Numeral`, `TimeStamp`, `Arrow`, `Dot`, `ProgressLine`, `Kbd`, `Divider`
- **카운트다운** ([src/components/countdown.tsx](src/components/countdown.tsx)) — 24h 미만은 1초, 그 이상은 1분 갱신. SSR-safe (`mounted` 가드)
- **토큰** ([src/app/globals.css](src/app/globals.css)) — `--color-fg-strong: #0c0c0b` (절대 #000 X), 코랄 `--color-urgent: #e0445e`, 코발트 `--color-accent: #1d4ed8`, 하이라이트 `--color-highlight: #e8efff`, `wght-300~700` 클래스, `kerning-tight/normal/wide/mono`, `fade-up`/`fade-up-1~5`, `slide-in-left`, `pulse-dot`, `row-shift`, `reveal-right`

### Mock 데이터 (단일 출처)

- 강의·자료·요약(SummaryBlock 단락 구조)·키워드·Top 개념: [src/app/dashboard/study/data.ts](src/app/dashboard/study/data.ts). `getCourse()`, `getMaterial()`, `getResumeMaterial()` 헬퍼
- 활동 히스토리·주간 통계: [src/app/dashboard/history/data.ts](src/app/dashboard/history/data.ts)
- 강의계획서·일정·위저드 목록: 각 페이지 안에 inline (작아서)

### 알아둘 SSR 함정

- 클라이언트 컴포넌트에서 `Date.now()`/`new Date()`로 상대시간 계산하면 hydration mismatch 발생. `useState/useEffect`로 `mounted` 플래그 + `suppressHydrationWarning` + 조건부 렌더 패턴 (history-panel, history-view에서 사용)
- `usePlatform`/`isMac` 같은 navigator 의존도 마찬가지

### Anthropic SDK 패턴 (호출되지 않음, 청사진)

- [src/lib/claude.ts](src/lib/claude.ts) — `generate()` + 1h ephemeral 캐싱 + `estimateCost()`. 새 위저드 만들 때 그대로 복제. 사용 예시 [src/lib/README.md](src/lib/README.md)

### 아직 없는 것 (§4 청사진에 언급되지만 미구현)

- Supabase 인증·RLS 전체 (`src/lib/auth.ts`, `src/lib/supabase/*`)
- 학습 루프·검증 파이프라인 (§4-7)
- 프롬프트 룰 (`src/prompts/<tool>.md`)
- API 라우트 (`src/app/api/<tool>/route.ts`) — Anthropic 실제 호출 0건
- DB 스키마·마이그레이션 (`supabase/migrations/*`)
- 페르소나·history-server·rate-limit·sanitize·input-limits 라이브러리
- 강의계획서 파싱·OCR 워커
- 위저드 12종 중 발표만 인터랙티브 데모, 나머지 11종은 그리드 카드만

### 의존성 (실재)

- `next@16.2.4`, `react@19.2.4`, `tailwindcss@4` (`@tailwindcss/postcss`)
- `@anthropic-ai/sdk@0.92.0` (설치만, 호출 X)
- `lucide-react`, `clsx`, `tailwind-merge`

---

## 0. 방향성 가드

새 기능 요청을 받으면 **코딩 시작 전**에:

1. [docs/PRODUCT.md](docs/PRODUCT.md) §2 (MVP 범위)부터 Read로 확인
2. **§2-2 명시적 제외 목록**에 있는 요청이면(자격증·팀플·취업·HWP 등) → 즉시 코딩 X. 사용자에게 "Phase 2/3 범위인데 지금 추가할까요?" 묻기
3. 범위 의심되면 §2-3의 4문항 자가검증

방향 모를 때 멈추고 묻는다. 5초 확인 < 5시간 복구.

---

## 1. 스택 & 버전 주의사항

- **Next.js 16.2.4 + React 19.2.4 (App Router).** 학습 데이터와 breaking change 큼. 라우팅·서버 컴포넌트·캐싱 코드 작성 전에 `node_modules/next/dist/docs/`를 먼저 읽는다. deprecation 경고는 무시 X.
- **Tailwind v4** (`@tailwindcss/postcss`). CSS `@import` 순서 — 외부 폰트(Pretendard CDN)는 반드시 `@import "tailwindcss"` 앞에 와야 한다.
- **Anthropic SDK** (`@anthropic-ai/sdk`) — `claude-sonnet-4-6` + **prompt caching** (`cache_control: { type: "ephemeral", ttl: "1h" }`). 캐시 = 정적 룰/프롬프트, 비캐시 = 사용자 입력·페르소나. 새 도구는 [src/lib/claude.ts](src/lib/claude.ts) 패턴 그대로 복제.
- **모델 라우팅 — 비용 통제 필수**. 무분별한 Sonnet 사용 시 무료 사용자 1인당 월 5,000원 적자.
  - 요약·문제 생성: GPT-4.1 mini 또는 Haiku 4.5
  - 발표·과제 위저드 (품질 중요): Claude Sonnet 4.6
  - 임베딩: `text-embedding-3-small`
- **Supabase** (Auth + Postgres + pgvector + Storage). RLS는 켜두되, 어드민 작업은 service-role로 우회. service-role 사용 시 코드에서 직접 userId를 세션과 재검증.
- **Remotion 사용 X** — 이전 프로젝트와 혼동 주의. 영상 생성 없음.
- **언어**: UI·콘텐츠·프롬프트 한국어 기본. 변수명·함수명·주석은 영어.
- **반응형 1급**: Mobile (< 640) · iPad (md~lg, 768~1024) · Desktop (xl, ≥ 1280) **동등 지원**. 대학생은 폰·태블릿·노트북 다 씀. 새 페이지·컴포넌트 만들 때 항상 3개 viewport에서 확인. 상세는 [DESIGN.md §13](docs/design/DESIGN.md#13-반응형-전략--1급-시민).

---

## 2. 명령어

**현재 작동**:
```bash
npm run dev        # Next dev (default :3000) — Turbopack
npm run build      # 프로덕션 빌드 + 타입 검증
npm run start      # 프로덕션 빌드 로컬 서빙
npx tsc --noEmit   # 빠른 타입 체크 (build보다 가벼움)
```

**미구현** (라이브러리 추가 필요):
- `npm run lint` — ESLint 미설치. 스캐폴딩 시 `--no-eslint`로 만들었음. 필요 시 별도 설정.
- `node scripts/check-db.mjs`, `run-migration.mjs` — Supabase 도입 시점에 만들 예정 (§4 청사진).

**테스트 러너 없음.** UI 변경 후 검증은 §10 디자인 검증 워크플로 참고.

---

## 3. 배포

- **프로덕션**: https://arch-campus.vercel.app
- **GitHub auto-deploy 연결됨** — `main` push → production 자동 배포 / 다른 브랜치 push → preview URL 자동 생성. 따로 명령어 안 돌려도 됨.
- **수동 배포 시점**: GitHub 거치지 않고 즉시 검증해야 할 때만 `vercel --prod`. 사용자가 명시 요청한 경우 외에는 자동 트리거 X.
- **Root Directory `.`** 그대로. 바꾸지 말 것.
- **`vercel.json`** — `framework: nextjs` 명시. 첫 배포 시 Vercel이 Next.js 인식 못 한 이슈 회피용. 함부로 지우거나 수정 X.
- **환경변수**: `vercel env pull .env.local` (현재 env 변수 0개).
- **롤백**: Vercel 대시보드 Deployments에서 이전 배포 → "Promote to Production" 1클릭.

---

## 4. 아키텍처 (MVP 청사진 — 대부분 미구현)

> **이 섹션은 "이렇게 만들 것"의 가이드.** 실재 여부는 헤더의 [현재 구현 상태](#현재-구현-상태-2026-05-01-기준)에서 확인. 새 도구 만들 때 이 청사진 그대로 따른다.

### 4-1. 멀티테넌시 [미구현]

학생은 `profiles.university_id` + `profiles.department_id`로 학과에 속한다. 모든 자료·생성물은 `user_id` 스코프, 친구 초대 viral은 `course_id` 스코프.

**원칙**: userId/courseId는 **반드시 `getSession()`** ([src/lib/auth.ts](src/lib/auth.ts))에서. 클라이언트가 보낸 ID 절대 신뢰 X.

### 4-2. 4-Layer 패턴 (★ 새 도구 추가 시 그대로 복제) [Layer 1·2·4 미구현]

1. **프롬프트 룰** — `src/prompts/<tool>.md`. 캐시되는 시스템 프롬프트.
2. **API 라우트** — `src/app/api/<tool>/route.ts`. 순서:
   - `getSession()` → null이면 401
   - `sanitize()` ([src/lib/sanitize.ts](src/lib/sanitize.ts)) + 길이 제한 ([src/lib/input-limits.ts](src/lib/input-limits.ts))
   - `rateLimit()` ([src/lib/rate-limit.ts](src/lib/rate-limit.ts))
   - `loadPersona()` — 학과·학년 페르소나
   - Anthropic 메시지: `system: [{cached rules}, {dynamic context}]`
   - `logUsage()` — 토큰·비용 기록
   - `saveGeneration()` — try/catch, DB 실패해도 사용자 응답은 막지 않음 (단 §4-3 주의)
3. **대시보드 페이지** — `src/app/dashboard/<tool>/page.tsx`. 위저드 5단계 입력, 우측 결과, `<HistorySidebar>`.
4. **History sidebar 등록** — [src/components/history-sidebar.tsx](src/components/history-sidebar.tsx)에 도구명 + 색상.

**4개 중 하나라도 빠지면 도구는 작동하지 않는다.**

### 4-3. Tool enum — 세 곳 + SQL [미구현]

`Tool` 타입은 [src/lib/history.ts](src/lib/history.ts), 검증은 [src/app/api/history/route.ts](src/app/api/history/route.ts), DB CHECK 제약은 `public.generations`에.

도구 추가 시 새 idempotent 마이그레이션 (`supabase/migrations/000N_<tool>_enum.sql`)으로 CHECK drop & re-add. **SQL 안 돌리면 `saveGeneration`이 23514 에러를 삼키고 history 저장이 조용히 실패.** 이전 프로젝트에서 반나절 디버깅한 함정.

### 4-4. 인증 + RLS [미구현]

- Supabase Auth on edge (`@supabase/ssr`). 세션 쿠키는 [src/lib/supabase/server.ts](src/lib/supabase/server.ts).
- **service-role 어드민 클라이언트** ([src/lib/supabase/admin.ts](src/lib/supabase/admin.ts))는 RLS 우회용. 호출자는 매번 세션과 ID 재검증.
- RLS 정책: `users`, `courses`, `enrollments`, `generations`, `materials`. `admin` role만 전체 조회.

### 4-5. 페르소나 기반 생성 [미구현]

모든 프롬프트는 학생 페르소나(전공·학년·이번 학기 과목·목표 학점·관심 자격증·동아리/알바 시간)로 파라미터화. `user_personas` (JSONB) 테이블.
**결과물이 generic하면 프롬프트 룰을 의심하기 전에 페르소나 빈 값 먼저 확인.**

### 4-6. 프롬프트 인젝션 방어 [미구현 — 패턴은 src/lib/claude.ts에 반영됨]

사용자 자유 입력은 `<user_input>` 태그로 user-role 메시지에 넣고, 시스템 프롬프트엔 직접 concat 금지. [src/lib/sanitize.ts](src/lib/sanitize.ts) 경유.

### 4-7. 학습 루프 검증 파이프라인 (★ 신뢰의 핵심) [미구현]

문제 생성 후 노출 전 서버 검증:

```
문제 생성
  → 출처 근거 span이 원문에 실제 존재? (substring match)
  → 정답이 보기 안에 있나?
  → 보기 중복 없나?
  → 객관식이면 정답 1개·오답 N-1개 명확?
통과한 것만 노출
```

이 검증 우회하는 PR 받지 않는다.

### 4-8. 강의계획서 파싱 — 80% 자동 + 20% 확인 [미구현]

100% 자동은 함정. 신뢰도 점수 표시:

- ≥ 80%: 자동 등록, 토스트 "X건 자동 등록됨, 클릭해 확인"
- < 80%: 한 화면에서 사용자가 빠르게 confirm/edit (체크박스 UX)

확신 없는 추출을 자동 등록하면 사용자가 시험을 놓친다.

---

## 5. 데이터·AI 파이프라인 [전부 미구현]

```
파일 업로드 → 포맷 판별 → 텍스트 추출/OCR → 블록 정규화 →
청킹 → 임베딩 → pgvector 저장 → RAG 검색 →
요약/문제/일정/위저드 결과 생성 → 검증 → 사용자 노출
```

| 영역 | 선택 | 비고 |
|---|---|---|
| 디지털 PDF | PyMuPDF + pdfplumber | 서버리스 함수 또는 Vercel Sandbox |
| 스캔 OCR | PaddleOCR (PP-StructureV3) | 비용 큼 — 무료 티어 제한 |
| HWPX | python-hwpx | HWP는 변환 안내 |
| 임베딩 | text-embedding-3-small | $0.02/1M tokens |
| 벡터 DB | Supabase pgvector | $25/mo부터 |
| 파일 저장 | Vercel Blob 또는 Cloudflare R2 | 사용자 업로드 비공개 기본값 |

사용자 업로드 자료는 비공개 기본값. 학습 재사용 옵트인 분리.

---

## 6. 컨벤션

### 6-1. 한국어 기본

UI·콘텐츠·프롬프트 한국어 우선. 변수명·함수명·주석은 영어. 사용자에게 보이는 모든 문자열은 한국어.

### 6-2. SQL 마이그레이션은 두 곳에

`scripts/run-migration.mjs`로만 돌리지 X. 반드시 `supabase/migrations/000N_<name>.sql` 파일로 커밋, 사용자에게 "Supabase 대시보드에서 실행하세요" 안내.

### 6-3. AI 윤리·치팅 라인 (★ 제품의 사활)

이 서비스는 **학습 보조**이지 **대신 써주는 AI**가 아니다. Gauth 같은 "답 풀어주는 앱"으로 포지셔닝되면 학교가 차단한다.

**구현 규칙**:
- 위저드 결과물 끝에 항상 워터마크: "이 자료는 학습 보조용이며 반드시 본인이 검토·수정해야 합니다."
- "리포트 본문 작성" 위저드는 **만들지 않는다**. 구조·가이드·체크리스트만 제공
- 자기소개서도 항목별 구조 가이드만, 본문 X
- 시험 문제 생성은 본인 자료 업로드 기반에 한정. "기출 문제집 사진 업로드해 풀어주세요" 차단
- 새 위저드 만들 때 "이게 치팅 도구로 보이나?" 자가검증

### 6-4. 테스트 없음 — 골든패스 수동 확인

UI 작업 후 `npm run dev`:
1. 골든패스(자료 업로드 → 요약 → 문제 → 풀이) 끝까지
2. 엣지: 빈 상태, 너무 긴 입력, 한자·이모지 섞인 입력
3. 회귀(특히 Today 대시보드 깨짐 자주 발생)

타입 통과 ≠ 기능 통과. UI 못 띄우면 명시한다 ("성공" 거짓말 금지).

### 6-5. 백워드 호환 흔적 남기지 X

미사용 `_var`, `// removed` 주석, 안 쓰는 export 유지 X. 확실히 안 쓰면 그냥 지운다.

### 6-6. 주석은 "왜"만

코드가 뭐 하는지는 식별자가 설명. 주석은 숨겨진 제약·미묘한 invariant·알려진 버그 회피일 때만. PR 설명·이슈 번호를 코드 주석에 박지 X.

### 6-7. 코딩 전·중·후 4원칙 (Karpathy)

LLM 코딩 사고 줄이는 행동 가이드. 사소한 작업엔 판단으로, 불확실하면 이 4개 통과시킨다.

**(a) 코딩 전에 멈춰라**
- 가정 명시. 불확실하면 묻는다.
- 해석이 둘 이상이면 둘 다 제시. 조용히 하나 고르지 X.
- 더 단순한 길 보이면 먼저 말한다.
- 막힌 곳 있으면 무엇이 막히는지 이름 붙이고 묻는다.

**(b) 단순함 우선**
- 요청한 것만. 추측 기능 X.
- 1회용 코드에 추상화 X.
- 요구되지 않은 "유연성"·"설정 가능성" X.
- 일어날 수 없는 시나리오의 에러 핸들링 X.
- 200줄 썼는데 50줄로 가능하면 다시 쓴다.
- 자가검증: "시니어가 보면 과설계라고 할까?" YES면 단순화.

**(c) 외과적 변경**
- 사용자 요청 외 인접 코드·주석·포맷 "개선" X.
- 망가지지 않은 거 리팩터 X.
- 기존 스타일 다르게 보여도 맞춘다.
- 무관한 데드코드 발견 → 언급만, 삭제 X.
- 내 변경이 만든 고아(import·var·func)만 정리, 기존 데드코드 X.
- 테스트: 변경된 모든 줄이 사용자 요청에 직접 추적 가능한가?

**(d) 목표 주도 실행**
- "검증할 수 있는 목표"로 변환:
  - "검증 추가" → "잘못된 입력 테스트 작성, 통과시킨다"
  - "버그 고침" → "재현 테스트 작성, 통과시킨다"
  - "X 리팩터" → "리팩터 전후 테스트 통과 확인"
- 멀티스텝 작업은 짧은 계획 명시:
  ```
  1. [단계] → 검증: [확인]
  2. [단계] → 검증: [확인]
  ```
- 약한 성공 기준("작동하게")은 매번 재확인 필요. 강한 기준은 자율 루프 가능.

이 4원칙이 작동하는 신호: diff에 불필요한 변경 줄어듦, 과설계로 인한 재작성 줄어듦, 실수 후가 아니라 구현 전에 명확화 질문이 나온다.

---

## 7. 확인 없이 하지 마라

- `rm -rf`, `git push --force`, `git reset --hard`
- 이미 적용된 마이그레이션 파일 삭제·수정
- `.env`·키·토큰 포함 파일을 git add
- Supabase Dashboard에서 직접 SQL 돌리기 (사용자가 직접)
- `vercel --prod` (사용자가 명시 요청한 경우만)
- 사용자 데이터 (페르소나, 업로드 자료) 삭제·이전
- 모델 변경 — 라우팅 테이블(§1) 바꾸기 전 비용 영향 보고

의심되면 묻는다.

---

## 8. 컴플라이언스 — 한국 법규

- **저작권**: 사용자 업로드 강의자료는 교수 저작물. 학습 재사용 옵트인 분리. 이용약관에 "본인이 정당하게 보유한 자료만 업로드" 명시.
- **개인정보**: 학번·연락처 패턴 자동 마스킹. 신고 시 24시간 내 게시 중단.
- **AI 활용 가이드**: 결과물 워터마크(§6-3) + 학칙 위반 시 사용자 책임 명시.

새 기능이 위 셋 중 하나에 닿으면 코딩 전에 "법무 검토 필요해 보입니다" 알림.

---

## 9. 작업 시작 전 체크리스트

새 task마다 머릿속으로 통과:

- [ ] [docs/PRODUCT.md](docs/PRODUCT.md) §2 MVP 범위 안인가? — NO면 사용자 확인
- [ ] 새 도구라면 4-Layer (§4-2) 모두 손댈 준비됐나?
- [ ] DB 스키마 변경 있다면 마이그레이션 SQL 파일도 만들고 사용자에게 실행 안내?
- [ ] AI 호출이면 모델 라우팅(§1) 맞나? Sonnet 남발 X
- [ ] 위저드라면 "치팅 도구"로 안 보이나? (§6-3)
- [ ] 끝나고 `npm run dev` 골든패스 돌릴 건가? (§6-4)
- [ ] UI 작업이면 **§10 디자인 검증 워크플로** 거칠 건가?
- [ ] 큰 변경(>200줄, 새 라우트, 새 위저드)이면 끝난 후 `code-reviewer` 서브에이전트 호출할 건가?

흐려지면 멈추고 묻는다.

---

## 10. 디자인 검증 워크플로 (UI 작업 끝낼 때마다)

**왜**: PRODUCT.md §2 반응형 1급 정책. 데스크톱에서만 잘 보이는 거 100% 막아야 함. 모바일에서 한국어 한 글자씩 깨지는 사고 한 번 있었음.

**검증 단계**:

1. **빌드** — `npm run build` 통과 (타입 + 정적 생성).
2. **dev 서버 띄우기** — `npm run dev` 백그라운드. `localhost:3000/dashboard/today` 200 확인.
3. **3 viewport 스크린샷** — Playwright로 자동:
   - **xl**: 1440×900
   - **desktop**: 1280×900
   - **iPad**: 820×1180
   - **iPhone 14**: device profile (390×844, scale 3)

**스크립트** (`/tmp/shoot.mjs` 패턴 — 필요 시 그대로 복제):
```js
import { chromium, devices } from 'playwright';
const URL = 'http://localhost:3000/dashboard/today';
const targets = [
  { name: 'xl-1440',         viewport: { width: 1440, height: 900 } },
  { name: 'desktop-1280',    viewport: { width: 1280, height: 900 } },
  { name: 'ipad-820',        viewport: { width: 820,  height: 1180 } },
  { name: 'mobile-iphone14', device: 'iPhone 14' },
];
const browser = await chromium.launch();
for (const t of targets) {
  const ctx = await browser.newContext(
    t.device ? devices[t.device] : { viewport: t.viewport, deviceScaleFactor: 2 }
  );
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800); // 폰트·애니메이션 안정화
  await page.screenshot({ path: `/tmp/screenshots/${t.name}.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
```
첫 화면(viewport 한 컷)만 보려면 `fullPage: false`로.

**합격 기준**:
- 4개 viewport 모두 한국어 깨짐 0건
- 모바일에서 콘텐츠가 사이드바·탭바와 겹치지 않음
- 첫 화면(스크롤 없는 viewport) 안에 핵심 정보가 보이는가
- 호버 액션이 모바일에서 영구 노출 X (반대로 항상 노출하든지 결정)

**참고**: 사용자가 Playwright MCP 활성화하면 (다음 Claude Code 재시작 후) `Agent`/MCP 호출로도 가능. 지금은 Playwright CLI 직접 사용.

**주의**: `.next/` 캐시가 globals.css 변경을 못 받는 경우가 있음. 디자인 토큰 추가했는데 안 보이면 `rm -rf .next && npm run dev` 재시작.

**Next.js dev 인디케이터** (좌하단 작은 원형 N): 정적 렌더링 표시. UI 아님. 무시.
