# arch-campus

**한국 대학생을 위한 AI 학기 운영 OS.** 공부·일정·AI를 한 화면에서.

강의자료를 올리면 AI가 요약·문제를 만들고, 시간표·강의계획서를 자동으로 캘린더에 꽂고, 발표·리포트·시험 준비를 위저드로 도와준다. 단 **"대신 써주는 AI"가 아니라 학습 보조**다 — 본문은 본인이 쓰고, 우리는 구조·체크리스트·예상 질문만 잡아준다.

- **프로덕션**: https://arch-campus.vercel.app
- **GitHub**: https://github.com/0625yt/arch-campus
- 배포: `main` push → Vercel production 자동 배포 / 다른 브랜치 → preview URL

---

## 스택

| 레이어 | 기술 |
|---|---|
| 프레임워크 | Next.js 16.2.4 (App Router) · React 19.2.4 |
| 스타일 | Tailwind CSS v4 (`@tailwindcss/postcss`) · Apple 톤 디자인 토큰 |
| AI | Vercel AI SDK v6 (`ai`) + `@ai-sdk/anthropic` — Claude **Sonnet 4.6** / **Haiku 4.5**, 1h prompt caching |
| 백엔드 | Supabase — Auth · Postgres · Storage · RLS · Realtime |
| 레이트리밋 | Upstash Redis (`@upstash/ratelimit`) |
| 파서 | `unpdf`(PDF) · `mammoth`(DOCX) · `exceljs`/`officeparser`(Office) · HWP는 별도 변환 서비스 |
| 검증 | Zod v4 |
| 린트·포맷 | Biome v2 |
| 테스트 | Vitest |

> **모델 라우팅(비용 통제)**: 요약·추출·챗처럼 빈도 높은 작업은 Haiku, 발표·리포트·벼락치기·퀴즈처럼 품질이 중요한 위저드는 Sonnet. 자세한 매핑은 [src/lib/claude.ts](src/lib/claude.ts)의 `TOOL_MODEL`.

---

## 빠른 시작

```bash
# 1. 의존성
npm install

# 2. 환경변수 (아래 표 참고) — Vercel 연동 시 pull
vercel env pull .env.local
# 또는 .env.local 직접 작성

# 3. 환경변수 검증
npm run verify:env

# 4. 개발 서버 (http://localhost:3000)
npm run dev
```

DB가 비어 있으면 [supabase/migrations](supabase/migrations) 를 순서대로 적용한다 (Supabase Dashboard SQL Editor 또는 CLI). 자세한 건 [supabase/README.md](supabase/README.md).

---

## 명령어

```bash
npm run dev          # 개발 서버 :3000
npm run build        # 프로덕션 빌드 + 타입 검증
npm run typecheck    # tsc --noEmit (빠른 타입 체크)

npm run lint         # Biome lint
npm run lint:fix     # Biome lint --write
npm run format       # Biome format --write
npm run check        # Biome lint + format 한 번에
npm run check:fix    # check --write

npm run test         # Vitest 1회 실행
npm run test:watch   # Vitest watch
npm run verify:env   # .env.local 환경변수 누락 검사
```

---

## 환경변수

`.env.local`에 설정. **필수**가 없으면 부팅·AI 호출이 막힌다.

| 변수 | 용도 | 필수 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 키 (브라우저 클라이언트) | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | RLS 우회용 admin 키 (서버 전용, 절대 노출 X) | ✅ |
| `ANTHROPIC_API_KEY` | Claude API 키 | ✅ (dev는 AI 호출 시) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | 레이트리밋용 Redis | 권장 |
| `NEXT_PUBLIC_SITE_URL` | 사이트 베이스 URL | 권장 |
| `SUPABASE_PROJECT_REF` / `SUPABASE_DB_URL` | 마이그레이션·CLI | 선택 |
| `HWP_CONVERTER_URL` / `HWP_CONVERTER_TOKEN` | HWP→PDF 변환 서비스 | 선택 |
| `CLOUDCONVERT_API_KEY` | 문서 변환 폴백 | 선택 |
| `QUIZ_MODEL` · `EXTRACT_MODEL` · `CHAT_MODEL` · `CHAT_FREE_MODEL` | 도구별 모델 override (`haiku`\|`sonnet`) | 선택 |

> 키·토큰이 든 파일은 절대 커밋하지 않는다. pre-commit에 gitleaks 스캔이 걸려 있다.

---

## 디렉터리 구조

```
src/
  app/
    (auth)          login · onboarding
    dashboard/      내 캠퍼스 홈 · today · study · calendar · review · history · tools · chat
    api/            서버 라우트 (materials · quiz · summarize · wizards/* · chat/* · events · ...)
  components/       사이드바 · 캘린더 · 모달 · 명령 팔레트 · 위저드 사이드바 등 공유 UI
  lib/
    claude.ts       AI 진입점 — generate() / streamChatReply(), 모델 라우팅, 1h 캐싱
    prompts.ts      loadPrompt(name) — persona + master-rules + 도구별 프롬프트 조합
    schemas.ts      Zod 출력 스키마 (위저드 결과 구조 검증)
    auth.ts         getOwnerId / tryGetOwnerId (세션 → user.id, dev fallback)
    supabase/       client · server · admin · types
    data/           DB 조회·기록 레이어 (events · materials · jobs · wizard-history · ...)
    services/       위저드 실행 서비스 (presentation · report-structure · chat-free · ...)
  prompts/          *.md 도구별 시스템 프롬프트 (+ _shared/)
supabase/migrations/ 0001~0020 SQL 마이그레이션
services/hwp-converter/ HWP→PDF 변환 마이크로서비스 (LibreOffice, 별도 배포)
docs/               아키텍처·제품·컨벤션·디자인·진단 문서
```

---

## 현재 살아있는 기능

자세한 현황은 [docs/STATUS.md](docs/STATUS.md). 요약:

- **자료**: 강의자료 업로드(PDF/DOCX/Office/HWP) → AI 요약 + 퀴즈 자동 생성, 분할 뷰(PDF ↔ 요약 너비 드래그), 자료 기반 챗
- **일정**: 캘린더 월/주/일 뷰, 시간표·강의계획서 이미지 → 자동 추출, 자연어("다음 주 화 3시 영어 과제") → 일정
- **복습**: 퀴즈 채점·오답 모아보기·오답 통계
- **위저드 4종 (실동작)**: 발표자료 구조화 · 리포트 구조 설계 · 교수 요구사항 체크 · 시험 벼락치기 — 비동기 jobs + 결과 재방문(`/dashboard/history/[gid]`)
- **챗**: 자유 챗(Haiku) · 자료 기반 챗(RAG)
- **공통**: ⌘K 명령 팔레트, RLS 멀티테넌트, Redis 레이트리밋, 모바일/iPad 반응형

---

## 배포·롤백

- `main` push → Vercel production 자동 배포. 다른 브랜치 push → preview URL.
- 수동 배포 `vercel --prod`는 명시적으로 필요할 때만.
- 롤백: Vercel 대시보드 Deployments에서 직전 배포 "Promote to Production".
- `vercel.json`은 framework preset 고정용 — 함부로 지우지 않는다.

---

## 기여 가이드

- AI 윤리 라인(치팅 도구 금지)·MVP 범위·모델 라우팅은 [CLAUDE.md](CLAUDE.md)에 박혀 있다. 새 기능 전에 읽는다.
- 새 도구는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)의 4-Layer 패턴을 복제한다.
- UI는 [docs/design/DESIGN.md](docs/design/DESIGN.md)의 가드(특히 §10 AI 티 패턴 금지)를 따른다.
- UI·콘텐츠·프롬프트는 한국어, 코드(변수·함수·주석)는 영어.
