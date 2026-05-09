# 현재 구현 상태 (2026-05-09 기준)

> [docs/ARCHITECTURE.md](ARCHITECTURE.md)는 MVP 청사진이고, 그 중 데이터/AI 레이어는 아직 코드가 없다. UI 셸·디자인 시스템·라우트 11개는 mock data로 다 살아있다.

## 라이브 데모

- 프로덕션: https://arch-campus.vercel.app (Vercel + GitHub auto-deploy)
- GitHub: https://github.com/0625yt/arch-campus
- `git push` → Vercel 자동 배포. 수동 배포는 `vercel --prod`도 가능 (CLI 로그인 필요)
- `vercel.json`은 framework preset 고정용 — 첫 배포에서 Vercel이 Next.js 인식 못 한 이슈 회피. 지우지 말 것

## 라우트 (모두 200, mock data)

- `/` → `/dashboard` 307
- `/dashboard` — ChatGPT 톤 시작 화면. 큰 검색창 (⌘K 트리거) + 시작점 4개
- `/dashboard/today` — 코랄 hero + 카운트다운 + 5분 액션 + 주간 리스트
- `/dashboard/study` — 강의 4개 카드
- `/dashboard/study/[course]` — 강의 상세 + 키워드/Top 개념 + 자료 카드 + 업로드
- `/dashboard/study/[course]/[material]` — 노션 톤 풀 요약, "문제 만들기" Modal로 GenerateForm
- `/dashboard/calendar` — Big Calendar (월 그리드) + Right Inspector (오늘·AI 후보·다가오는·범례). 이벤트 클릭 = 인라인 편집, AI 후보 우선순위 정렬 + 풀스크린 Review 모달
- `/dashboard/tools` — 위저드 12종 그리드, 카테고리 필터 칩
- `/dashboard/tools/presentation` — 5단계 위저드 인터랙티브 (입력/선택지 → 결과: 슬라이드 5장 + 예상 질문)
- `/dashboard/history` — 이번 주 4-stat + 14일 contributions + 검색·필터·시간순 그룹

## 글로벌 인터랙션

- **⌘K / Ctrl+K / `/`** — 명령 팔레트 ([src/components/command-palette.tsx](../src/components/command-palette.tsx))
- **사이드바** ([src/components/sidebar.tsx](../src/components/sidebar.tsx)) — Apple 톤. 검색 input + 학습 메뉴 5개 (Today에 마감 코랄 뱃지) + 강의 4개 + 학기 진행률 + User
- **모바일** — 햄버거 좌상단 → Drawer로 사이드바 그대로 ([src/components/mobile-drawer.tsx](../src/components/mobile-drawer.tsx))
- **Modal** ([src/components/modal.tsx](../src/components/modal.tsx)) — `createPortal`로 viewport 정중앙. ESC·외부 클릭·body scroll lock

## 디자인 시스템 (Apple 톤 통일됨)

- **토큰** ([src/app/globals.css](../src/app/globals.css)):
  - `--color-apple-pearl` `#f5f5f7` (배경), `--color-apple-ink` `#1d1d1f` (텍스트), `--color-apple-muted` `#6e6e73` (보조)
  - `--color-apple-action` `#0071e3` (액션 블루) — 단일 액센트
  - `--color-apple-hairline` `#d2d2d7` (1px 보더)
  - `--color-apple-success/streak/coral/cobalt/coral-soft/action-soft` (시맨틱)
- **공유 컴포넌트** ([src/components/page-shell.tsx](../src/components/page-shell.tsx)) — `PageShell`, `PageHint`, `PageTitle`, `MetaLine`, `SectionLabel`, `PageFooter`, `EmptyState`
- **타이포 프리미티브** ([src/components/primitives.tsx](../src/components/primitives.tsx)) — `Numeral`, `TimeStamp`, `Arrow`, `Dot`, `ProgressLine`, `Kbd`, `Divider`
- **카운트다운** ([src/components/countdown.tsx](../src/components/countdown.tsx)) — 24h 미만 1초, 그 이상 1분 갱신. SSR-safe
- **letterSpacing**: 본문 `-0.012em`, uppercase eyebrow `0.06em`
- **CTA**: h-[48px] = Action Blue 풀, outline pill = 화이트 + hairline
- **chevron**: `›`

## Mock 데이터 (단일 출처)

- 강의·자료·요약·키워드·Top 개념: [src/app/dashboard/study/data.ts](../src/app/dashboard/study/data.ts). `getCourse()`, `getMaterial()`, `getResumeMaterial()` 헬퍼
- 활동 히스토리·주간 통계: [src/app/dashboard/history/data.ts](../src/app/dashboard/history/data.ts)
- 강의계획서·일정·위저드 목록: 각 페이지 안에 inline

## 알아둘 SSR 함정

- 클라이언트 컴포넌트에서 `Date.now()`/`new Date()`로 상대시간 계산하면 hydration mismatch. `useState/useEffect`로 `mounted` 플래그 + `suppressHydrationWarning` 패턴 (history-panel, history-view에서 사용).
- `usePlatform`/`isMac` 같은 navigator 의존도 마찬가지.

## Anthropic SDK 패턴 (호출되지 않음, 청사진)

- [src/lib/claude.ts](../src/lib/claude.ts) — `generate()` + 1h ephemeral 캐싱 + `estimateCost()`. 새 위저드 만들 때 그대로 복제. 사용 예시 [src/lib/README.md](../src/lib/README.md).

## 아직 없는 것 (청사진엔 있지만 미구현)

- Supabase 인증·RLS 전체 (`src/lib/auth.ts`, `src/lib/supabase/*`)
- 학습 루프·검증 파이프라인
- 프롬프트 룰 (`src/prompts/<tool>.md`)
- API 라우트 (`src/app/api/<tool>/route.ts`) — Anthropic 실제 호출 0건
- DB 스키마·마이그레이션 (`supabase/migrations/*`)
- 페르소나·history-server·rate-limit·sanitize·input-limits 라이브러리
- 강의계획서 파싱·OCR 워커
- 위저드 12종 중 발표만 인터랙티브 데모, 나머지 11종은 그리드 카드만

## 의존성 (실재)

- `next@16.2.4`, `react@19.2.4`, `tailwindcss@4` (`@tailwindcss/postcss`)
- `@anthropic-ai/sdk@0.92.0` (설치만, 호출 X)
- `lucide-react`, `clsx`, `tailwind-merge`
