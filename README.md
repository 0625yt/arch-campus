# arch-campus

**한국 대학생을 위한 AI 학기 운영 OS.** 공부·일정·AI를 한 화면에서.

강의자료를 올리면 AI가 요약·문제·복습 큐를 만들고, 시간표·강의계획서 이미지를 자동으로 캘린더에 꽂고, 발표·리포트·시험 준비를 단계별 위저드로 돕는다. 단, **"대신 써주는 AI"가 아니라 학습 보조**다 — 본문은 본인이 쓰고, 우리는 구조·체크리스트·예상 질문만 잡아준다 (CLAUDE.md §4 치팅 라인).

- **프로덕션**: https://arch-campus.vercel.app
- **GitHub**: https://github.com/0625yt/arch-campus
- **배포**: `main` push → Vercel production 자동 배포 / 다른 브랜치 → preview URL

---

## 목차

1. [지금 살아있는 기능](#지금-살아있는-기능)
2. [스택과 아키텍처](#스택과-아키텍처)
3. [모델 라우팅 — 비용 통제 핵심](#모델-라우팅--비용-통제-핵심)
4. [데이터·인증 모델](#데이터인증-모델)
5. [빠른 시작](#빠른-시작)
6. [환경변수](#환경변수)
7. [명령어](#명령어)
8. [디렉터리 구조](#디렉터리-구조)
9. [개발 흐름·새 도구 만들기](#개발-흐름새-도구-만들기)
10. [배포·롤백](#배포롤백)
11. [더 읽을 문서](#더-읽을-문서)

---

## 지금 살아있는 기능

자세한 현황과 미구현 백로그는 [docs/STATUS.md](docs/STATUS.md). 빠르게 훑으면:

### 홈 · 학기 안전망 (`/dashboard`)
오늘 놓치면 손해인 신호를 한 화면에 모은다 — 마감 임박, 시험·발표 D-day, 누적된 오답, 한참 안 본 자료, 과목별 위험도. 학기를 "절대 빠뜨리지 않는" 게이트 한 장.

### 공부 (`/dashboard/study`)
- **자료 업로드**: PDF · DOCX · PPTX · XLSX · TXT · MD 직지원. HWP·HWPX는 별도 LibreOffice 마이크로서비스에서 PDF로 변환.
- **업로드 시점에 자료 종류 선택**: "강의자료(기본)" / "기출문제". 종류가 이후 동선을 결정한다.
- **AI 요약**: 자료를 올리면 Claude Haiku 4.5가 핵심 개념·단원별 요약·복습 포인트를 생성. 페이지 출처(`p.10` 등) 인용.
- **PDF ↔ 요약 분할 뷰**: 양옆 너비를 드래그로 조절. 모바일은 탭 전환.
- **문제 생성(객관식·단답형·서술형)**: 자료 본문 기반, 1~30문제 cap, 난이도 3단계. 보기·정답·근거 evidence를 자료에서 substring 매칭 검증(치팅 가드).
- **기출문제 추출**: 자료 종류를 "기출문제"로 올린 자료에서 본문에 실린 문제·정답·해설을 그대로 추출 (AI가 새 문제 생성 X).
- **자료 기반 챗 (RAG)**: 키워드 기반 청크 hint로 발췌 정확도 보강. 1h prompt caching으로 같은 자료 재질문 비용 최소화.
- **과목 우클릭**: 사이드바·과목 카드에서 우클릭/롱프레스 → 이름·교수·색상 수정, 강의 삭제.

### 일정 (`/dashboard/calendar`)
- **월·주·일 뷰**: 이벤트 인라인 편집, 드래그로 시간 이동·길이 조절.
- **시간표·강의계획서 이미지 추출**: 사진 한 장 올리면 Vision 모델이 과목·요일·시간·시험·과제 마감을 뽑아 캘린더에 일괄 등록.
- **HITL Confidence**: 추출 결과에 필드별 신뢰도가 따라붙고, 낮은 신뢰도는 사용자가 확인·수정해야 저장된다 (다음 양식 추출 품질 누적).
- **자연어 입력**: "다음 주 화 3시 영어 과제 마감" → 일정 자동 생성. 한국어 음성 받아쓰기도 지원.

### 위저드 (`/dashboard/tools`)
실제 동작하는 4종 — 모두 비동기 jobs 패턴(폴링) + 결과 영속(`/dashboard/history/[gid]`):

| 위저드 | 무엇을 하는가 |
|---|---|
| 발표자료 구조화 | 슬라이드 목차 + 발표 대본 + 예상 질문 |
| 리포트 구조 설계 | 목차 + 섹션별 가이드 (본문 작성 X, 핵심 질문은 반드시 `?`로 끝나야 통과) |
| 교수 요구사항 체크 | 과제 공지·평가 기준에서 가점 슈팅 체크리스트 |
| 시험 벼락치기 | 남은 시간 / 시험 범위 기반 30분·1시간·3시간 학습안 |

카탈로그에 보이는 나머지 8종(팀플·진로·자기소개서·면접 등)은 Phase 2·3 범위 — 현재는 카드만 노출 (PRODUCT.md §6).

### 복습 (`/dashboard/review`)
- 퀴즈 채점·오답 누적·**약점 단원 통계** (오답이 몰리는 topic 자동 집계).
- 오답마다 자료 원문 인용으로 다시 펼침. 오답 노트는 손으로 안 만든다.

### 챗 (`/dashboard/chat`)
- 자유 챗(Haiku) — 자료 없이 학습 상담·정리 도움.
- 자료 기반 챗(자료 페이지 안의 사이드 패널) — 키워드 매칭으로 관련 청크만 hint로 박아 인용.

### 공통 인프라
- ⌘K **명령 팔레트** — 어디서든 자료·일정·위저드로 점프.
- **RLS 멀티테넌트** — 모든 테이블이 `owner_id` 격리, service-role 호출도 세션과 재검증.
- **레이트리밋** — Upstash Redis. `guardRateLimit("ai", ownerId)`가 AI 호출 라우트 전부에 박혀 있다.
- **반응형 1급** — Mobile / iPad / Desktop 동등 지원. 캘린더는 모바일에서 풀스크린(FAB), 위저드 사이드바는 모바일 우하단 pill.
- **Apple 톤 디자인** — 단일 액센트 blue `#0071e3`, hairline·pearl·ink·muted 4단 회색. AI 티 패턴(좌측 동그라미 점·마침표 카피 남발·generic shadcn 모달) 금지 ([DESIGN.md](docs/design/DESIGN.md) §10).

---

## 스택과 아키텍처

| 레이어 | 기술 | 비고 |
|---|---|---|
| 프레임워크 | Next.js **16.2.4** App Router · React **19.2.4** | 라우팅·서버 컴포넌트·캐싱 코드 작성 전에 `node_modules/next/dist/docs/` 참고 |
| 스타일 | Tailwind CSS v4 (`@tailwindcss/postcss`) | 외부 폰트(Pretendard CDN)는 `@import "tailwindcss"` 앞에 와야 함 |
| AI SDK | Vercel AI SDK **v6** (`ai@^6`) | SDK 직접 사용 (AI Gateway 미사용) |
| AI 모델 | `@ai-sdk/anthropic@^3` + `@ai-sdk/google@^3` | Claude Sonnet 4.6 / Haiku 4.5 (기본) + Gemini 2.5 Flash (A/B 옵션, dev/preview only) |
| 백엔드 | Supabase | Auth · Postgres · Storage · RLS · Realtime |
| 레이트리밋 | Upstash Redis (`@upstash/ratelimit`) | 미설정 시 우아하게 통과 |
| 파서 | `unpdf`(PDF) · `mammoth`(DOCX) · `exceljs` · `officeparser` · `file-type` · `tiktoken` | HWP는 별도 변환 서비스 (services/hwp-converter) |
| 검증 | Zod v4 | 위저드 결과·외부 입력 모두 |
| 린트·포맷 | Biome v2 | ESLint·Prettier 미사용 |
| 테스트 | Vitest v4 | 단위·통합 |

### 4-Layer 패턴 (새 도구는 그대로 복제)

새 위저드·도구를 추가할 때 따르는 청사진:

```
1. Prompt        src/prompts/<tool>.md          시스템 프롬프트 (한국어, master-rules에 조합됨)
2. Schema        src/lib/schemas.ts             Zod로 출력 모양 잠금
3. Service       src/lib/services/<tool>.ts     generate() 호출 + 후처리 검증 + DB 기록
4. Route         src/app/api/wizards/<tool>/    `after()` + jobs 큐잉 + 폴링용 ID 반환
```

전체 가이드는 [docs/ARCHITECTURE.md §2](docs/ARCHITECTURE.md).

---

## 모델 라우팅 — 비용 통제 핵심

**무분별한 Sonnet 사용 시 무료 사용자 1인당 월 5,000원 적자**가 난다. 그래서 도구별로 모델이 정해져 있다 — [src/lib/claude.ts](src/lib/claude.ts) `TOOL_MODEL`이 단일 출처:

| 도구 | 기본 모델 | 이유 |
|---|---|---|
| `summarize` | Haiku 4.5 | 빈도 높음 (자료 1개당 1회) |
| `event-parse` · `chat` · `chat-free` · `exam-extract` · `post-mortem` | Haiku 4.5 | 추출·정형·고빈도 |
| `quiz` | Sonnet 4.6 | 함정 선택지 품질이 학습 가치 결정 |
| `presentation` · `wizard-cram` · `report-structure` · `wizard-exam` · `wizard-assignment` | Sonnet 4.6 | 학기당 1~3건, 품질이 곧 차별점 |
| `timetable-extract` (Vision) | Sonnet 4.6 | 표 격자 정확도 사활 |
| `syllabus-extract` | Sonnet 4.6 | 일정 1개 누락 = 신뢰 붕괴 (2026-05-28 Haiku → Sonnet 승격) |

**모든 system 메시지에 prompt injection 가드 prepend + Anthropic 1h ephemeral 캐싱**. 같은 자료 챗 turn은 80~90% 캐시 할인.

### 환경변수로 모델 override

```bash
# 도구별 tier 분기 (Anthropic 안에서)
QUIZ_MODEL=haiku            # quiz를 일시적으로 Haiku로
EXTRACT_MODEL=sonnet        # 기출 추출 정확도 부족 시
CHAT_MODEL=sonnet           # 챗 품질 실험
CHAT_FREE_MODEL=sonnet
SYLLABUS_MODEL=haiku

# vendor 분기 (Anthropic ↔ Google). production에선 강제 무시됨 — 평가 통과 전엔 prod 차단
QUIZ_MODEL_VENDOR=google    # → Gemini 2.5 Flash
SUMMARY_MODEL_VENDOR=google
```

> **Gemini A/B 상태 (2026-05-28)**: 1회 비교에서 evidence 매칭 0% → 자료 5~10개 + 프롬프트 보강 전까지 prod 차단. 진행 계획은 [docs/NEXT-STEPS.md](docs/NEXT-STEPS.md).

---

## 데이터·인증 모델

### Supabase 4종 client

| 클라이언트 | 어디서 | 권한 |
|---|---|---|
| `client` | 브라우저 컴포넌트 | anon (RLS 적용) |
| `server` | 서버 컴포넌트·route 핸들러 | anon + cookie (사용자 세션) |
| **`admin`** | route 핸들러 (RLS 우회 필요 시) | **service-role — 세션과 owner_id 반드시 재검증** |
| `types` | 타입 only | 스키마 동기화 |

`getAdminSupabase()` 쓰는 새 라우트는 가드 4개를 반드시 박아야 한다 — [ARCHITECTURE.md §4-1](docs/ARCHITECTURE.md#4-1-service-role-사용-체크리스트-신규-라우트마다).

### 인증 진입점
[src/lib/auth.ts](src/lib/auth.ts) — `getOwnerId()` / `tryGetOwnerId()`.
세션 있으면 user.id, dev 환경은 fallback UUID, prod에서 세션 없으면 401.

### 데이터 레이어
[src/lib/data/](src/lib/data/) — `activity` · `attempts` · `events` · `jobs` · `materials` · `profile` · `quizzes` · `wizard-history` · `semester-safety`(학기 안전망 집계). 전부 `server-only` + admin + owner 검증.

### DB 마이그레이션
`supabase/migrations/` 안에 0001~0023 모두 적용됨. 주요 테이블:

```
profiles  courses  materials  generations  
quizzes (+questions +attempts +wrong_items_v)  
events  jobs  chat_threads(+messages)  audit_log
```

최근 변경:
- **0021** `generations.model_provider` — A/B 라벨링
- **0022** `wrong_items_v.topic` — 약점 단원 통계 view
- **0023** `quizzes.question_count` cap 20 → 30

---

## 빠른 시작

```bash
# 1. 의존성
npm install

# 2. 환경변수 — Vercel 연동 시 pull 한 번이면 끝
vercel env pull .env.local
# (또는 .env.local을 손으로 작성)

# 3. 환경변수 누락 검사
npm run verify:env

# 4. 개발 서버 (http://localhost:3000)
npm run dev
```

DB가 비어 있으면 [supabase/migrations](supabase/migrations) 0001부터 순서대로 적용 (Supabase Dashboard SQL Editor 또는 `supabase db push`). 자세한 절차는 [supabase/README.md](supabase/README.md).

> **요청 시 자동 deploy** — `main` push는 Vercel production 직행. PR이 아니라 `main`에 바로 푸시할 때 항상 의식할 것.

---

## 환경변수

`.env.local`에 설정. **필수**가 없으면 부팅·AI 호출이 막힌다.

### 필수

| 변수 | 용도 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 브라우저 anon 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | RLS 우회용 admin 키 (서버 전용, 절대 노출 X) |
| `ANTHROPIC_API_KEY` | Claude API 키 (dev에서도 AI 호출 시 필요) |

### 권장

| 변수 | 용도 |
|---|---|
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | 레이트리밋 |
| `NEXT_PUBLIC_SITE_URL` | OAuth redirect·시드 URL 등 |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini A/B 켤 때 |

### 선택

| 변수 | 용도 |
|---|---|
| `SUPABASE_PROJECT_REF` · `SUPABASE_DB_URL` | 마이그레이션·CLI |
| `HWP_CONVERTER_URL` · `HWP_CONVERTER_TOKEN` | HWP→PDF 변환 마이크로서비스 |
| `CLOUDCONVERT_API_KEY` | 문서 변환 폴백 |
| `QUIZ_MODEL` · `EXTRACT_MODEL` · `CHAT_MODEL` · `CHAT_FREE_MODEL` · `SYLLABUS_MODEL` | 도구별 tier override (`haiku`\|`sonnet`) |
| `QUIZ_MODEL_VENDOR` · `SUMMARY_MODEL_VENDOR` | vendor 분기 (`anthropic`\|`google`). production에선 무시됨 |

> 키·토큰이 든 파일은 절대 커밋하지 않는다. pre-commit hook에 **gitleaks 스캔**이 걸려 있다 (.husky/pre-commit).

---

## 명령어

```bash
# 개발
npm run dev          # Next dev :3000
npm run build        # 프로덕션 빌드 + 타입 검증

# 품질
npm run typecheck    # tsc --noEmit (빠른 타입 체크)
npm run lint         # Biome lint
npm run lint:fix     # Biome lint --write
npm run format       # Biome format --write
npm run check        # lint + format 한 번에
npm run check:fix    # check --write

# 테스트
npm run test         # Vitest 1회
npm run test:watch   # Vitest watch

# 운영
npm run verify:env   # .env.local 누락 검사
```

UI 작업 끝에는 반드시 [디자인 검증 워크플로](docs/ARCHITECTURE.md#10-디자인-검증-워크플로-ui-작업-끝낼-때마다) 수행.

---

## 디렉터리 구조

```
src/
  app/
    page.tsx                       비로그인 랜딩(마케팅) / 로그인 시 대시보드로
    privacy · terms                개인정보처리방침 · 이용약관 (정적)
    login · onboarding             가입·로그인 폼
    dashboard/
      page.tsx                     내 캠퍼스 홈 (학기 안전망)
      today                        오늘 할 일
      study/                       과목·자료 (강의 → 자료 → 요약·문제·챗)
        [course]/upload-zone.tsx   자료 업로드 + 자료 종류 선택 모달
        [course]/[material]/       자료 상세 (PDF↔요약 분할 뷰, 문제 생성·기출 추출 폼)
      calendar/                    월·주·일 뷰 + import 플로우
      review                       오답 모아보기 + 약점 단원 통계
      tools/                       위저드 카탈로그 + 4종 본체
      history/[gid]                위저드 결과 재방문
      chat/                        자유 챗
      quiz/[quizId]/...            퀴즈 풀이·채점·오답
      dev/*                        audit·cache·quiz 디버그 (개발용)
    api/                           서버 라우트 (materials · quiz · summarize · wizards/* · chat/* · events · calendar/* · ...)
  components/                      사이드바·캘린더·모달·명령 팔레트·위저드 사이드바
  lib/
    claude.ts                      AI 진입점 — generate() / streamChatReply(), 모델 라우팅, 1h 캐싱
    prompts.ts                     loadPrompt(name) — persona + master-rules + 도구별 프롬프트 조합
    schemas.ts                     Zod 출력 스키마 (위저드 결과 검증)
    auth.ts                        getOwnerId / tryGetOwnerId
    supabase/                      client · server · admin · types
    data/                          DB 조회·기록 레이어 (server-only)
    services/                      위저드 실행 서비스
    hooks/use-job.ts               비동기 잡 폴링 훅 (위저드 결과 대기)
    ratelimit.ts                   Upstash 가드
  prompts/                         *.md 도구별 시스템 프롬프트 (+ _shared/ persona·master-rules)
supabase/migrations/               0001~0023 SQL 마이그레이션
services/hwp-converter/            HWP→PDF 마이크로서비스 (LibreOffice + Node, 별도 배포)
docs/                              아키텍처·제품·컨벤션·디자인·진단 문서
scripts/verify-env.mjs             .env.local 누락 검사
```

---

## 개발 흐름·새 도구 만들기

### 작업 시작 전 5초 체크

코딩 시작 전에 반드시 통과해야 하는 가드는 [CLAUDE.md §9](CLAUDE.md). 핵심만:

- 이 작업이 [PRODUCT.md §2 MVP 범위](docs/PRODUCT.md#2-최종-기능-명세-12개-기능-통합) 안인가? Phase 2·3이면 사용자 확인 후 진행.
- AI 호출이면 모델 라우팅 맞나? **Sonnet 남발 X**.
- 위저드라면 "치팅 도구"로 안 보이나? (본문 자동 작성 X, 가이드만)
- 새 도구라면 [ARCHITECTURE.md §2 4-Layer](docs/ARCHITECTURE.md#2-4-layer-패턴--새-도구-추가-시-그대로-복제) 다 손댈 준비?
- `getAdminSupabase()` 쓰면 [§4-1 4개 가드](docs/ARCHITECTURE.md#4-1-service-role-사용-체크리스트-신규-라우트마다) 박혔나?

### 끝 선언 전 검증 ([CLAUDE.md §7](CLAUDE.md))

"빌드 통과" ≠ "기능 동작". 외부 영향 작업은 반드시 실제 환경에서 한 번 돌려본 뒤에만 보고:

- API 라우트 수정 → 로컬에서 해당 엔드포인트 호출해 응답 확인
- Vercel 배포 후 → 변경된 페이지를 프로덕션 URL에서 직접 열어 확인
- AI 파서·추출기 수정 → 실제 사용자 자료(시간표 PDF 등)로 한 번 돌려서 결과 비교
- 같은 워크어라운드 2회 실패 → 멈추고 사용자에게 보고, 3번째 시도 X

### 컨벤션

- **언어**: UI·콘텐츠·프롬프트는 한국어, 코드(변수·함수·주석)는 영어.
- **AI 윤리 워터마크**: 모든 위저드 결과 끝에 "이 자료는 학습 보조용이며 반드시 본인이 검토·수정해야 합니다." ([CLAUDE.md §4](CLAUDE.md)).
- **반응형 1급**: Mobile (<640) · iPad (768~1024) · Desktop (≥1280) 동등 ([DESIGN.md §13](docs/design/DESIGN.md)).
- **AI 티 패턴 금지**: 좌측 동그라미 점 bullet · 마침표 카피 남발 · generic shadcn 모달 ([DESIGN.md §10](docs/design/DESIGN.md)).

---

## 배포·롤백

| 동작 | 어떻게 |
|---|---|
| **프로덕션 배포** | `git push origin main` → Vercel auto-deploy (몇 분 안 영구 반영) |
| **프리뷰 배포** | 다른 브랜치 push → PR URL에 preview 환경 |
| **수동 배포** | `vercel --prod` — 사용자가 명시 요청한 경우에만 |
| **롤백** | Vercel 대시보드 → Deployments → 직전 배포 "Promote to Production" |
| **환경변수 동기화** | `vercel env pull .env.local` (Vercel → 로컬) |

`vercel.json`은 framework preset 고정용 — 함부로 지우지 않는다.

---

## 더 읽을 문서

| 문서 | 무엇이 적혀 있나 |
|---|---|
| [CLAUDE.md](CLAUDE.md) | **행동 규칙** — 모델 라우팅, 치팅 라인, MVP 가드, 검증 의무 |
| [docs/PRODUCT.md](docs/PRODUCT.md) | 제품 정체성 · MVP 범위 · 로드맵 · KPI |
| [docs/STATUS.md](docs/STATUS.md) | 지금 살아있는 기능 · 미구현 · 마이그레이션 진행 상태 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 4-Layer 패턴 · RLS 가드 · 파이프라인 · UI 검증 |
| [docs/CONVENTIONS.md](docs/CONVENTIONS.md) | 코드 컨벤션 · Karpathy 4원칙 |
| [docs/design/DESIGN.md](docs/design/DESIGN.md) | 디자인 토큰 · 반응형 전략 · AI 티 패턴 금지 |
| [docs/NEXT-STEPS.md](docs/NEXT-STEPS.md) | 다음 우선순위 (Upstage PoC, Gemini A/B, HITL confidence) |
| [docs/COST.md](docs/COST.md) | 학기당 비용 추정 · 모델별 단가 |
| [docs/MODEL-OPTIONS.md](docs/MODEL-OPTIONS.md) | 모델 비교 리서치 (Claude vs Gemini, Vision 정확도) |
| [docs/REFERENCES.md](docs/REFERENCES.md) | 도입 보류한 외부 자료 |
| [supabase/README.md](supabase/README.md) | DB 마이그레이션 적용 절차 |

---

## 기여

이 저장소는 1인 빌더가 운영 중이며, AI 코더(Claude Code, Codex 등)와 협업한다. 외부 PR은 받지 않지만, 코드 리뷰·이슈 제보·아이디어는 GitHub Issues로 환영.

새 기능 작업 전에 반드시 [CLAUDE.md](CLAUDE.md)를 읽고 §0 방향성 가드를 통과시킬 것.
