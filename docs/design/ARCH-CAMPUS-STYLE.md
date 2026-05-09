# Arch Campus Style Command

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
  page-shell:
    maxWidthNarrow: 680px
    maxWidthDefault: 760px
    maxWidthWide: 920px
    padding: "{spacing.page-x-mobile} / {spacing.page-x-tablet} / {spacing.page-x-desktop}"
  sidebar:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.line}"
    activeColor: "{colors.ink-strong}"
    activeBackground: "{colors.canvas}"
    width: 248px
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

Use the existing `PageShell` widths:

- `narrow`: focused reading and today work.
- `md`: study, history, and calendar default pages.
- `wide`: dashboard, tools, and multi-panel workflows.

Do not create full-bleed marketing sections inside the app shell. Full width is reserved for structural navigation, not page content.

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

- `PageShell`, `PageTitle`, `SectionLabel`, `MetaLine`, `EmptyState`
- `Numeral`, `Dot`, `ProgressLine`, `Divider`, `HighlightText`
- `cn` for stateful class composition

Use these existing token classes:

- `wght-380`, `wght-450`, `wght-560`, `wght-700`
- `kerning-tight`, `kerning-normal`, `kerning-mono`
- `tabular-nums`

When a page feels visually weak, improve information structure before adding decoration.

