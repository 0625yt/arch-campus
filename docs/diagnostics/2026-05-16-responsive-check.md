# 반응형 검증 노트 (2026-05-16)

> 스프린트 #6 — Today / Study / Calendar 3화면 + layout/sidebar/command-palette 정적 분석 결과 + 실측 가이드.

---

## 정적 분석 — 통과 (예상)

### 1. 글로벌 분기 ([src/app/dashboard/layout.tsx](../../src/app/dashboard/layout.tsx))

| 컴포넌트 | 적용 클래스 | 동작 |
|---|---|---|
| `Sidebar` | `hidden md:flex` | <768px 숨김, ≥768px 표시 |
| `MobileTopbar` | `md:hidden` | 모바일 전용 상단바 (햄버거 + 로고 + 검색 아이콘) |
| `MobileTabBar` | `md:hidden` | 모바일 전용 하단 5탭 (홈/지금/공부/일정/도구), `min-h-[44px]`, `safe-area-inset-bottom` |
| `CommandPalette` | `fixed inset-0 ... max-w-[600px]` | 모든 viewport 풀스크린 오버레이, 데스크톱은 600px 캡 |

→ Tailwind 기본 breakpoint상 **iPad 820px = md** → sidebar 보이고 mobile-nav 숨김. 의도된 분기일 가능성 높음 (사용자 확인 필요).

### 2. Today ([src/app/dashboard/today/page.tsx](../../src/app/dashboard/today/page.tsx))

- 컨테이너: `max-w-[1080px] px-6 sm:px-10 md:px-12` — 단계적 padding
- 카드 그리드: `grid-cols-1 sm:grid-cols-2` (82, 304행)
- 헤로 typography: `text-[28px] sm:text-[36px] md:text-[44px]` (3단계 스케일링)
- 활동 카드: `grid-cols-[60px_1fr_auto] sm:grid-cols-[72px_1fr_auto]` (446행)

### 3. Study ([src/app/dashboard/study/page.tsx](../../src/app/dashboard/study/page.tsx))

- 동일 컨테이너 패턴
- 카드 그리드: `sm:grid-cols-2 sm:gap-5` (155, 216행)
- 헤로: `text-[34px] sm:text-[48px] md:text-[56px]` (76행, 더 큰 단계)
- 카드 min-height: `min-h-[200px]` (모바일·데스크톱 공통)

### 4. Calendar ([src/app/dashboard/calendar/calendar-board.tsx](../../src/app/dashboard/calendar/calendar-board.tsx))

- 메인 그리드: `md:grid-cols-[1fr_280px] lg:grid-cols-[1fr_320px]` (243행) — md 미만 1열
- 캘린더 셀: `min-h-[88px] sm:min-h-[110px]` (566행) — 모바일 컴팩트
- 이벤트 표시: `sm:hidden` (dot 가로 wrap) vs `hidden sm:flex` (text list) — **명확한 모바일/데스크톱 분기**

### 5. Command Palette ([src/components/command-palette.tsx](../../src/components/command-palette.tsx))

- 오버레이: `fixed inset-0 ... px-4 pt-[10vh] sm:pt-[12vh]` (256행)
- 컨테이너: `w-full max-w-[600px]` (269행)
- 리스트: `max-h-[60vh] overflow-y-auto overscroll-contain` (287행)
- 트리거: 모바일은 `MobileTopbar`의 `SearchTrigger variant="icon"`이 합성 ⌘K KeyboardEvent 디스패치 → 키보드 없는 환경 대응

**진단 리포트의 "차단 의심"은 정적 분석으로는 안 잡힘.** 실측 필요.

---

## 실측 체크리스트

`npm run dev` 띄운 상태에서 Chrome DevTools (`Cmd+Option+I` → 좌상단 device toolbar `Cmd+Shift+M`):

### Viewport별 확인

| Viewport | 디바이스 프리셋 | 핵심 확인 |
|---|---|---|
| **390 × 844** | iPhone 14 | MobileTopbar/TabBar 표시, Sidebar 숨김, 본문 1열 |
| **820 × 1180** | iPad Air | Sidebar 표시(228px), 본문 좁아짐 → **iPad에서 sidebar 적정한가?** |
| **1280 × 800** | (Custom) | 데스크톱 풀 레이아웃, Calendar 옆 패널 280px |

### 페이지별 골든패스

**Today** (`/dashboard/today`)
- [ ] iPhone: 헤로 typography 안 짤림, 카드 1열
- [ ] iPad: 헤로 sm 단계, 카드 2열, sidebar와 본문 비율
- [ ] Desktop: md 단계 헤로, 카드 2열, 활동 리스트 72px 좌 컬럼

**Study** (`/dashboard/study`)
- [ ] iPhone: 코스 카드 1열, min-h 200px 카드 잘림 없음
- [ ] iPad: 코스 카드 2열, "자료 더 올리기" 버튼 표시
- [ ] Desktop: 헤로 56px, 카드 2열 정렬

**Calendar** (`/dashboard/calendar`)
- [ ] iPhone: 캘린더 7열 셀 ~44px씩 (좁지만 dot 표시), 메인 1열(사이드 패널 아래로), 셀 클릭 → day-detail 동작
- [ ] iPad: 셀 좀 더 커짐(`sm:min-h-[110px]`), 사이드 패널 280px 옆에 표시
- [ ] Desktop: 사이드 패널 320px, 이벤트 text list로 셀에 표시

**Command Palette** (`⌘K` 또는 모바일 상단바 검색 아이콘)
- [ ] iPhone: 풀스크린 오버레이, 입력창 포커스, 키보드 위로 안 가려짐
- [ ] iPad/Desktop: max-w 600px 중앙 정렬

**MobileDrawer** (iPhone에서 햄버거 메뉴)
- [ ] 드로어 열림, sidebar 내용 표시, 외부 클릭 시 닫힘

---

## 깨질 가능성 있는 지점 (실측에서 확인)

1. **iPad sidebar 적정성** — 820px 화면의 28% 차지. 본문 ~592px. 의도된 디자인인지 확인. 만약 iPad에서 sidebar 숨기길 원하면 `hidden md:flex` → `hidden lg:flex`로 변경 필요 (Phase 2 작업).
2. **iPhone Calendar 7열** — 320px(SE) viewport에서 셀이 ~36px씩. dot 표시는 OK지만 셀 클릭 영역이 좁을 수 있음.
3. **Study 카드 min-h-[200px]** — 모바일 1열에서 카드 4개면 800px 세로. 스크롤 양 많음 (intentional?).
4. **헤로 text-[34px] / 28px** — iPhone SE (320px) 같은 좁은 viewport에서 단어 끊김 가능성.

---

## 다음 액션

- 정적 분석 결과: **3화면 모두 반응형 1급 패턴 통과**. 실측 가이드 위 표 진행.
- 사용자 실측 후 깨짐 발견되면 별도 항목으로 기록 → 우선순위 재평가.
- iPad sidebar 정책은 사용자 의사결정 사항 (Phase 1 영향 X).
