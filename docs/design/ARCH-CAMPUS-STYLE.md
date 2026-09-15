# Arch Campus Style Command

> **2026-09-15 공부 공간 갱신:** 공부 인덱스는 그래파이트 배경과 코발트 포인트, CSS 3D 문서 레이어를 사용한다. 과목·교수·강의실 검색과 분류 필터, 최근 공부 이어가기를 제공한다. 시간표는 강의실을 표시하고 요일별 목록 보기를 지원한다. `/dashboard/today`에서 실제 우선순위와 다음 일정을 확인한다. 자료함은 제목 검색·요약 필터·선택 삭제를 유지하며 모바일·다크 모드·동작 줄이기를 함께 검증한다. 진입 애니메이션은 완료 후 호버 transform을 덮지 않도록 구성한다.

> **2026-09-10 갱신 — 현재 구현 우선 사항:** 랜딩은 큰 한국어 타이포와 종이 메모를 닮은 직접 조작 가능한 체험으로 표현한다. 제품 내부는 따뜻한 중립색 캔버스와 코발트 액션을 사용한다. 시간표가 있는 홈은 시간표 중심으로, 첫 방문은 시간표 등록·자료 학습·복습의 세 진입점으로 구성한다. 데스크톱 메뉴는 밑줄로 현재 위치를 표시하고, 검색과 계정 메뉴는 모든 기기에서 접근할 수 있다. 아래 초기 가이드와 다를 경우 이 갱신 사항 및 실제 공통 컴포넌트를 우선한다.
>
> 모션은 짧은 순차 등장·탭 전환·호버 반응에 사용하고 자동 재생 체험은 넣지 않는다. `prefers-reduced-motion`에서는 지연까지 제거한다. 강조색 위 글자는 `--color-on-accent`로 테마별 대비를 유지한다. 빈 화면을 고정 높이로 잘라내거나, 동작하지 않는 홈 링크를 상태 카드에 연결하지 않는다.

---
version: alpha
name: Arch Campus
description: A quiet campus operating tool for Korean college students. The interface is dense enough to show schedule, assignments, study flow, and source intake at a glance, but calm enough to feel usable every day. It favors thin separators, warm neutral surfaces, precise Korean typography, small status signals, and a single cobalt action color. The product is not a marketing gallery; it is a working desk.

colors:
  canvas: "#ffffff"
  surface: "#fafaf8"
  surface-strong: "#f4f3ef"
  line: "#ececea"
  line-strong: "#d8d6d2"
  ink: "#1c1c1a"
  ink-strong: "#0c0c0b"
  ink-muted: "#6f6e6a"
  ink-subtle: "#a3a19c"
  ink-disabled: "#c8c6c1"
  primary: "#1d4ed8"
  primary-strong: "#1e40af"
  primary-soft: "#ebf1ff"
  urgent: "#e0445e"
  urgent-strong: "#c2364c"
  urgent-soft: "#ffeef1"
  warn: "#b45309"
  warn-soft: "#fef3c7"
  success: "#047857"
  highlight: "#e8efff"
  on-primary: "#ffffff"

typography:
  family: "Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Segoe UI, sans-serif"
  page-title:
    fontSize: 30px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.022em
  page-title-mobile:
    fontSize: 26px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.022em
  section-label:
    fontSize: 10.5px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: 0.08em
    textTransform: uppercase
  card-title:
    fontSize: 15px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.022em
  row-title:
    fontSize: 14px
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: -0.022em
  body:
    fontSize: 13.5px
    fontWeight: 450
    lineHeight: 1.6
    letterSpacing: -0.011em
  meta:
    fontSize: 11.5px
    fontWeight: 450
    lineHeight: 1.4
    letterSpacing: -0.022em
  micro:
    fontSize: 10.5px
    fontWeight: 560
    lineHeight: 1.2
    letterSpacing: -0.011em
  number-md:
    fontSize: 24px
    fontWeight: 560
    lineHeight: 1
    letterSpacing: -0.022em
    fontVariantNumeric: tabular-nums

rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 10px
  xl: 12px
  panel: 8px
  pill: 9999px
  full: 9999px

spacing:
  hairline: 1px
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 24px
  xxl: 32px
  page-x-mobile: 20px
  page-x-tablet: 28px
  page-x-desktop: 48px
  section-gap: 32px

shadows:
  soft: "0 1px 2px rgba(20, 20, 20, 0.04)"
  lift: "0 1px 2px rgba(20, 20, 20, 0.04), 0 8px 24px -8px rgba(20, 20, 20, 0.08)"

components:
  # 페이지 컨테이너 = AppleShell (2026-07-16 통일). PageShell은 dead.
  app-shell:
    maxWidthNarrow: 820px
    maxWidthDefault: 1080px
    maxWidthWide: 1200px
    maxWidthHero: 1440px
    padding: "px-6 pt-8 sm:px-10 sm:pt-12 md:px-12"
    paddingBottom: "pb-24 sm:pb-28 (default) / pb-32 sm:pb-40 (tall)"
  # 좌측 사이드바는 2026-05-31 제거 → 상단바(GlobalTopbar)로 대체.
  topbar:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.line}"
    breakpoint: "md:block (md 미만은 MobileTopbar + MobileTabBar 4탭)"
  panel:
    backgroundColor: "{colors.canvas}"
    borderColor: "{colors.line}"
    rounded: "{rounded.panel}"
    shadow: "{shadows.soft}"
    padding: 16px
  quiet-section:
    backgroundColor: transparent
    borderTop: "1px solid {colors.line}"
    paddingTop: 16px
  task-row:
    backgroundColor: transparent
    borderBottom: "1px solid {colors.line}"
    minHeight: 58px
    padding: 14px 0
  event-chip:
    backgroundColor: "color mixed from course/event color at 10-14%"
    borderColor: "same color at 20-24%"
    rounded: "{rounded.sm}"
    typography: "{typography.micro}"
    height: 22px
  button-primary:
    backgroundColor: "{colors.ink-strong}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    minHeight: 40px
    padding: 10px 14px
  button-accent:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    minHeight: 40px
    padding: 10px 14px
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    minHeight: 36px
    padding: 8px 10px
  upload-intake:
    backgroundColor: "{colors.canvas}"
    borderColor: "{colors.line-strong}"
    rounded: "{rounded.md}"
    shadow: "{shadows.soft}"
  command-palette:
    backgroundColor: "{colors.canvas}"
    borderColor: "{colors.line-strong}"
    rounded: "{rounded.xl}"
    shadow: "{shadows.lift}"
  empty-state:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.line-strong}"
    borderStyle: dashed
    rounded: "{rounded.xl}"
---

## Overview

Arch Campus is a working surface, not a landing page. A student should open the dashboard and immediately understand three things: what is due, what is scheduled, and what source material can be turned into action.

The visual language is quiet and slightly warm. It uses off-white surfaces, soft ink, thin dividers, and compact rows. The page should feel like a well-kept study desk: everything has a place, nothing performs for attention, and the urgent items are visible without shouting.

## Design Principles

### 1. Show The Flow First

Every primary screen should expose a path through the student's day:

- Source material enters through upload or chat.
- Extracted tasks become today items.
- Dated tasks become calendar events.
- Study work links back to a course and deadline.

Avoid isolated widgets that look useful but do not answer "what should I do next?"

### 2. Dense, Not Cramped

Use compact typography and row layouts, but keep enough vertical rhythm for scanning. A dashboard section should usually fit 3-6 useful rows before the fold. If a card needs more than 4 facts, split it or convert it into a list.

Default rhythm:

- Page header to first surface: 28-32px.
- Section to section: 32-40px.
- Row height: 56-64px.
- Panel padding: 16-20px.
- Metadata gap: 4-8px.

### 3. One Action Color, Small Status Colors

Cobalt is the only interaction color. It marks selected state, primary links, upload focus, and critical navigation affordances. Urgent, warn, success, and course colors are allowed only as small status signals: dots, thin bars, event chips, short badges, and tiny text.

Never paint a large surface urgent red or course green. Large colored panels make the app feel like a toy dashboard instead of a campus tool.

### 4. Separation Comes From Lines

Prefer hairlines and surface changes over shadows. Shadows are allowed for modal/palette elevation and the occasional important intake panel, but they must remain almost invisible. Regular cards should not look like floating tiles.

### 5. Korean Text Leads The System

Pretendard Variable is the canonical face. Use the local `wght-*` utilities instead of arbitrary font weights when working in code. Korean UI copy should be compact, concrete, and calm.

Good:

- "자료에서 뽑힌 할 일"
- "제출 조건 확인"
- "오늘 자정"
- "확인이 필요해요"

Avoid:

- "지금 바로 시작하기!"
- "완벽한 대학 생활을 위한 AI"
- "주의! 마감 임박!"

## Layout

### Page Widths

Use `AppleShell` widths (PageShell is dead — do not use):

- `narrow` (820): wizards, focused reading.
- `default` (1080): study, quiz, history, review, tools hub.
- `wide` (1200): course detail, multi-panel.
- `hero` (1440): dashboard hero.

Special layouts (calendar full-bleed, dashboard home flex, material 920→1400) stay hand-rolled — see DESIGN.md §13-3. Do not create full-bleed marketing sections inside the app shell.

### Composition Recipes

Dashboard:

1. Short page header.
2. Intake surface.
3. Extracted task list.
4. Schedule or course flow.

Calendar:

1. Month/week controls.
2. Calendar grid.
3. Extracted candidate list.
4. Event detail or source confirmation.

Study:

1. Course overview.
2. Next study block.
3. Recent source/history.
4. Practice or review queue.

Today:

1. Current priority.
2. Short action list.
3. Deadline context.
4. Recovery/empty state if no tasks.

## Components

### Panels

Use panels for real grouped tools: upload intake, command palette, settings-like controls, and repeated item cards. Do not put a panel inside another panel. If content needs hierarchy inside a panel, use a divider, label, or row grouping.

### Rows

Rows are the main grammar for academic work. A row should usually contain:

- Small status dot or course color.
- Title.
- One metadata line.
- Optional right action revealed on hover.

Rows should be easy to scan vertically. Avoid putting paragraph-length text inside rows.

### Buttons

Primary button is dark ink, not blue. This keeps the interface calm. Blue is reserved for accent actions and selection. Use icon-only buttons for tool actions when a clear lucide icon exists.

Button rules:

- Minimum touch target: 40px visually, 44px when isolated.
- One primary action per local surface.
- Avoid three same-weight buttons in one row.
- Use `rounded-lg` or 8px unless the control is a pill by nature.

### Event Chips

Calendar chips may use course/event color, but only as tint. Text must remain readable and subdued. Chipped events should not resize the calendar cell on hover.

### Upload Intake

Upload is a primary workflow, not a decorative hero. It may be the largest surface on the dashboard, but it should stay operational: file target, type, course, goal, and action must all be visible without explanatory marketing copy.

## Do

- Use current CSS variables in `src/app/globals.css` before adding new tokens.
- Keep information above the fold useful, not theatrical.
- Use dividers and row alignment for hierarchy.
- Keep urgent signals short and specific.
- Make empty states suggest the next input.
- Test desktop and mobile because students move between laptop and phone.

## Don't

- Do not make a landing page inside the dashboard.
- Do not use decorative gradients, orbs, bokeh, or oversized illustrative heroes.
- Do not add card shadows for ordinary hierarchy.
- Do not create nested cards.
- Do not use pure black `#000000`.
- Do not let more than one accent color compete for actions.
- Do not use large red/orange/green backgrounds for status.
- Do not make the UI dominated by one hue family.
- Do not let Korean button text overflow or squeeze.

## Responsive Behavior

Breakpoints:

- Phone: <= 640px. Single column, bottom navigation, dense rows, no sidebar.
- Tablet: 641-1023px. One primary column with selective two-column panels.
- Desktop: >= 1024px. Sidebar plus centered content shell.
- Wide desktop: >= 1440px. Content remains locked; margins absorb space.

Mobile rules:

- Keep the first actionable item visible without scrolling when possible.
- Avoid two-column controls below 640px unless each label is very short.
- Horizontal overflow is a bug except for intentional tab strips.

## Implementation Notes

Use these existing primitives first:

- `AppleShell` (컨테이너), `PageTitle`, `SectionLabel`, `MetaLine`, `EmptyState`
- `Numeral`, `Dot`, `ProgressLine`, `Divider`, `HighlightText`
- `cn` for stateful class composition

Use these existing token classes:

- `wght-380`, `wght-450`, `wght-560`, `wght-700`
- `kerning-tight`, `kerning-normal`, `kerning-mono`
- `tabular-nums`

When a page feels visually weak, improve information structure before adding decoration.
