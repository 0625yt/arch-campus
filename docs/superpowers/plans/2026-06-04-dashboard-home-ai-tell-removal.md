# 대시보드 홈 AI티 제거 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/dashboard` 홈에서 AI티 나는 4개 디테일(친절한 설명 카피·반복 화살표·균일한 3카드·generic 진척바)을 Apple 순정 톤으로 교정한다. 구조·데이터·로직 변경 없이 프레젠테이션만.

**Architecture:** 전용 브랜치 `redesign/dashboard-home`에서 작업. 두 파일만 수정(`bottom-cards.tsx`, `timetable-side-rail.tsx`). 검증은 TDD가 아니라 **Playwright 실측(픽셀/텍스트) + typecheck + biome**. 항목별 커밋 분리로 부분 롤백 가능.

**Tech Stack:** Next.js 16 App Router · React 19 · Tailwind v4 (`@theme` 토큰) · 기존 디자인 시스템(`apple-*` 토큰, `elev-*`, `spring-press`).

**참고 — 진단에서 제외된 항목:** spec 항목 4(시간표 "지금" 강조)는 코드 재확인 결과 `timetable-hero.tsx`에 **이미 완전 구현됨**(now-glow·현재시각 라인·과거 dim·pulse dot). 빈 초기 렌더만 보고 오진했던 것. 본 plan에서 제외.

---

## File Structure

- `src/app/dashboard/bottom-cards.tsx` — 하단 3카드. Task 2(화살표)·3(차별화)·4(도넛) 대상.
- `src/app/dashboard/timetable-side-rail.tsx` — 우측 사이드. Task 1(카피) 일부 대상.
- 새 파일 없음. 새 디자인 토큰 없음. 기존 `apple-*` 토큰 재사용.

---

## Task 1: 친절한 설명 카피 제거 [spec 항목 2]

**Files:**
- Modify: `src/app/dashboard/bottom-cards.tsx`
- Modify: `src/app/dashboard/timetable-side-rail.tsx`

원칙: 빈 상태/정상 상태에 부연 설명을 붙이지 않는다. 느낌표 0, "~요" 설명체 최소화. 단, 빈 상태에서 **다음 행동을 모르면 안 되는 곳**은 명사형 한 줄은 유지(완전 침묵은 길 잃음).

- [ ] **Step 1: bottom-cards.tsx — UrgentCard 빈 상태 부제 제거**

`bottom-cards.tsx:37-48`의 `UrgentCard` 빈 상태 `meta`를 빈 문자열로. "지금 위험 신호 없음"만 남기고 "자료 정리하기 좋은 날" 삭제.

`bottom-cards.tsx:39-47` 교체:
```tsx
    return (
      <BaseCard
        href="/dashboard/today"
        label="긴급 신호"
        tone="muted"
        title="이상 없음"
        meta=""
      />
    );
```
(title도 "지금 위험 신호 없음"→"이상 없음"으로 단축 — Apple은 짧은 상태어를 쓴다.)

- [ ] **Step 2: bottom-cards.tsx — NextEventCard 빈 상태 카피 명사형으로**

`bottom-cards.tsx:64-74`의 빈 상태 `meta` "강의계획서 올리면 자동으로 채워져요" → "강의계획서로 자동 등록"(기능 설명체 → 명사형). title "등록된 일정 없음"→"일정 없음".

`bottom-cards.tsx:66-73` 교체:
```tsx
      <BaseCard
        href="/dashboard/calendar"
        label="다음 일정"
        tone="muted"
        title="일정 없음"
        meta="강의계획서로 자동 등록"
      />
```

- [ ] **Step 3: bottom-cards.tsx — CoursesCard 빈 상태 카피 명사형으로**

`bottom-cards.tsx:107-116`의 빈 상태 meta "강의계획서 한 장이면 시작돼요" → "강의계획서 한 장으로 시작". title "아직 강의 없음"→"강의 없음".

`bottom-cards.tsx:108-115` 교체:
```tsx
      <BaseCard
        href="/dashboard/study"
        label="강의"
        tone="muted"
        title="강의 없음"
        meta="강의계획서 한 장으로 시작"
      />
```

- [ ] **Step 4: side-rail.tsx — nextDayFirst 설명문 삭제**

`timetable-side-rail.tsx:252-257`의 마침표 설명문 `<p>오늘은 강의가 없어요. 자료 정리 좋은 시간이에요.</p>` 전체 삭제. "내일 첫 강의" 카드는 강의명·시각만 보여주면 충분.

`timetable-side-rail.tsx:252-257` (해당 `<p>` 블록) 삭제.

- [ ] **Step 5: side-rail.tsx — SectionNow 빈 상태 부제 삭제**

`timetable-side-rail.tsx:261-277` 빈 상태("지금"+"오늘 남은 강의가 없어요"+"자료 정리하기 좋은 시간이에요")에서 마지막 부제 `<p>자료 정리하기 좋은 시간이에요</p>`(line 270-275) 삭제. "오늘 남은 강의가 없어요"만 유지.

`timetable-side-rail.tsx:270-275` (해당 `<p>` 블록) 삭제.

- [ ] **Step 6: 검증 — typecheck + biome**

Run: `npm run typecheck && npm run check`
Expected: 에러 0. (텍스트만 바꿨으니 통과해야 함)

- [ ] **Step 7: 검증 — 실제 렌더 확인**

dev 서버(`npm run dev`) 떠 있는 상태에서 Playwright로 `/dashboard` snapshot. 위 4개 카피가 사라졌는지 텍스트 확인. (느낌표·"~요 설명체" grep으로 잔존 확인)

- [ ] **Step 8: 커밋**

```bash
git add src/app/dashboard/bottom-cards.tsx src/app/dashboard/timetable-side-rail.tsx
git commit -m "dashboard: 친절한 설명 카피 제거 — Apple 순정 톤 (AI티 #2)"
```

---

## Task 2: 반복 "›" 화살표 — 상시 제거 + hover fade-in [spec 항목 5]

**Files:**
- Modify: `src/app/dashboard/bottom-cards.tsx:200-206`

현재 `BaseCard`는 우상단에 "›"를 상시 노출 + hover 0.5px 밀림. 카드 전체가 탭 타깃이므로 상시 제거, hover에만 fade-in.

- [ ] **Step 1: BaseCard의 "›" span을 hover-only로 변경**

`bottom-cards.tsx:201-206` 교체:
```tsx
        <span
          aria-hidden
          className="text-[12px] text-[var(--color-apple-muted)] opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
        >
          ›
        </span>
```
(추가: `opacity-0` 기본 + `group-hover:opacity-100`. 기존 `group-hover:translate-x-0.5`·`group-hover:text-...`는 색 전환 대신 opacity로 단순화.)

- [ ] **Step 2: 검증 — typecheck + biome**

Run: `npm run typecheck && npm run check`
Expected: 에러 0.

- [ ] **Step 3: 검증 — 실제 렌더 확인**

Playwright `evaluate`로 BaseCard의 "›" span computed `opacity`가 기본 `0`인지 확인:
```js
() => { const a=document.querySelector('main a[href="/dashboard/today"] span[aria-hidden]'); return a ? getComputedStyle(a).opacity : 'not found'; }
```
Expected: `"0"`

- [ ] **Step 4: 커밋**

```bash
git add src/app/dashboard/bottom-cards.tsx
git commit -m "dashboard: 카드 화살표 상시노출 제거 → hover fade-in (AI티 #5)"
```

---

## Task 3: 하단 3카드 차별화 — 신호등 점 + 큰 D-day [spec 항목 1]

**Files:**
- Modify: `src/app/dashboard/bottom-cards.tsx`

같은 grid·높이는 유지하되 내용물 형태를 성격별로 차별화. 긴급=좌측 신호등 점, 다음일정=큰 D-day 숫자. (강의=Task 4 도넛.)

- [ ] **Step 1: BaseCard에 신호등 점 옵션(`statusDot`) 추가**

`bottom-cards.tsx`의 `BaseCard` 시그니처(168-182)에 `statusDot?: boolean` 추가. label 행 좌측에 점을 그린다. tone 색을 점에 사용. muted tone이면 점 없음.

`BaseCard` props 타입(176-182)에 추가:
```tsx
  progress?: number;
  statusDot?: boolean;
```

label 행(194-207)을 교체 — label 앞에 점:
```tsx
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`flex items-center gap-1.5 text-[10px] uppercase wght-620 ${s.label}`}
          style={{ letterSpacing: "0.08em" }}
        >
          {statusDot && tone !== "muted" && (
            <span
              aria-hidden
              className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                tone === "urgent"
                  ? "bg-[var(--color-urgent)]"
                  : tone === "warn"
                    ? "bg-[#cc7a30]"
                    : "bg-[var(--color-apple-action)]"
              }`}
            />
          )}
          {label}
        </span>
        <span
          aria-hidden
          className="text-[12px] text-[var(--color-apple-muted)] opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
        >
          ›
        </span>
      </div>
```

- [ ] **Step 2: UrgentCard에 statusDot 전달**

`bottom-cards.tsx`의 `UrgentCard` 신호 있는 분기(51-59) `BaseCard`에 `statusDot` 추가:
```tsx
  return (
    <BaseCard
      href={signal.href}
      label={signal.label}
      tone={tone}
      title={signal.title}
      meta={signal.reason}
      statusDot
    />
  );
```

- [ ] **Step 3: NextEventCard — D-day를 큰 숫자로 분리**

`NextEventCard`(64-90)에서 현재 `meta={`${dDay} · ${시각}`}`로 합쳐 작게 표시 중. D-day를 카드의 주인공으로 끌어올린다. `BaseCard`에 `bigStat?: string`(우측 큰 수치) 옵션 추가.

`BaseCard` props에 추가:
```tsx
  statusDot?: boolean;
  bigStat?: string;
```

`BaseCard` 본문(208-221 사이, title/meta 블록)을 교체 — bigStat 있으면 우측 큰 숫자 + 좌측 title:
```tsx
      <div className="mt-1.5 flex min-w-0 items-end justify-between gap-2">
        <div className="min-w-0">
          <p
            className="line-clamp-1 text-[14px] wght-620 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {title}
          </p>
          <p
            className="mt-0.5 line-clamp-1 text-[11.5px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {meta}
          </p>
        </div>
        {bigStat && (
          <span
            className={`shrink-0 text-[22px] leading-none wght-700 tabular-nums ${s.label}`}
            style={{ letterSpacing: "-0.022em" }}
          >
            {bigStat}
          </span>
        )}
      </div>
```

- [ ] **Step 4: NextEventCard에서 bigStat=dDay, meta=시각만**

`NextEventCard`(81-89) 교체:
```tsx
  return (
    <BaseCard
      href="/dashboard/calendar"
      label="다음 일정"
      tone={tone}
      title={formatEventLabel(event)}
      meta={formatTime(event)}
      bigStat={dDay}
    />
  );
```

- [ ] **Step 5: 검증 — typecheck + biome**

Run: `npm run typecheck && npm run check`
Expected: 에러 0.

- [ ] **Step 6: 검증 — 실제 렌더 확인**

Playwright snapshot으로 `/dashboard` 확인:
- 다음 일정 카드에 "D-4"가 큰 숫자로 우측에 보이는지
- 긴급 신호 카드(신호 있을 때) 좌측 점 — 현재 데이터는 "이상 없음"(muted)이라 점 없음이 정상

- [ ] **Step 7: 커밋**

```bash
git add src/app/dashboard/bottom-cards.tsx
git commit -m "dashboard: 하단 3카드 차별화 — 신호등 점 + 큰 D-day (AI티 #1)"
```

---

## Task 4: 진척 바 → 작은 도넛 링 [spec 항목 3]

**Files:**
- Modify: `src/app/dashboard/bottom-cards.tsx`

generic 풀폭 파란 막대를 작은 도넛 링(Fitness 톤)으로. CoursesCard 전용. 낮은 진척이 "텅 빔"으로 안 보이게.

- [ ] **Step 1: DonutRing 컴포넌트 추가**

`bottom-cards.tsx` 파일 하단(BaseCard 아래)에 SVG 도넛 추가. 28px, track + progress 2겹. 코발트 accent.
```tsx
function DonutRing({ pct }: { pct: number }) {
  const r = 11;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden className="shrink-0 -rotate-90">
      <circle cx="14" cy="14" r={r} fill="none" stroke="var(--color-apple-pearl)" strokeWidth="3" />
      <circle
        cx="14"
        cy="14"
        r={r}
        fill="none"
        stroke="var(--color-apple-action)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
      />
    </svg>
  );
}
```

- [ ] **Step 2: BaseCard에 donut 옵션 추가, progress 막대 대체**

`BaseCard` props에 `donut?: number` 추가. 기존 `progress` 막대 블록(222-229)을 제거하고, donut이 있으면 우측 하단에 링 + 수치를 보여준다.

`BaseCard` props 타입에 추가:
```tsx
  bigStat?: string;
  donut?: number;
```

기존 progress 막대 JSX(222-229) 제거. title/meta 블록의 우측(bigStat 자리)에 donut도 들어갈 수 있게 — Step 3 NextEventCard의 우측 영역을 bigStat **또는** donut 둘 다 받도록 통합:

bigStat span 아래에 donut 분기 추가 (같은 우측 슬롯):
```tsx
        {bigStat && (
          <span
            className={`shrink-0 text-[22px] leading-none wght-700 tabular-nums ${s.label}`}
            style={{ letterSpacing: "-0.022em" }}
          >
            {bigStat}
          </span>
        )}
        {donut !== undefined && <DonutRing pct={donut} />}
```

- [ ] **Step 3: CoursesCard — progress 대신 donut, meta는 "다음 행동" 프레이밍**

`CoursesCard`(120-129) 교체. `progress={pct}` → `donut={pct}`. meta를 "텅 빔" 대신 행동형으로: `${withMaterials}/${total} 자료 등록` (퍼센트는 도넛이 말하므로 텍스트에서 % 제거).
```tsx
  return (
    <BaseCard
      href="/dashboard/study"
      label="강의"
      tone="calm"
      title={`${total}개 강의 진행`}
      meta={`${withMaterials}/${total} 자료 등록`}
      donut={pct}
    />
  );
```

- [ ] **Step 4: 검증 — typecheck + biome**

Run: `npm run typecheck && npm run check`
Expected: 에러 0.

- [ ] **Step 5: 검증 — 실제 렌더 확인**

Playwright로 `/dashboard` 강의 카드에 SVG 도넛이 렌더되는지 확인:
```js
() => { const svg=document.querySelector('main a[href="/dashboard/study"] svg'); return svg ? 'donut rendered' : 'no donut'; }
```
Expected: `"donut rendered"`. 그리고 풀폭 progress 막대(기존)가 사라졌는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add src/app/dashboard/bottom-cards.tsx
git commit -m "dashboard: 진척 막대 → 작은 도넛 링 (AI티 #3)"
```

---

## Task 5: 최종 통합 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 typecheck + biome + 빌드**

Run: `npm run typecheck && npm run check && npm run build`
Expected: 전부 통과.

- [ ] **Step 2: 다크모드·모바일 깨짐 확인**

Playwright로 `/dashboard`를 (a) 다크모드(`html[data-theme="dark"]`) (b) 375px 모바일 폭에서 snapshot. 신호등 점·도넛·hover 화살표가 양쪽에서 깨지지 않는지. 특히 도넛 SVG stroke가 다크에서 보이는지.

- [ ] **Step 3: DESIGN §10 잔존 확인**

`bottom-cards.tsx`·`timetable-side-rail.tsx`에서 grep: 느낌표(`!`)·"~요" 설명체·좌측 동그라미 점(좌측 ribbon) 잔존 없는지. (신호등 점은 "상태 표시"라 §10의 "장식용 좌측 점"과 다름 — 의미 있는 점은 허용.)

- [ ] **Step 4: 사용자 리뷰 대기**

dev 서버에서 `/dashboard`를 사용자가 직접 보고 승인. 승인 전 main 머지·다음 화면 진행 X.

---

## Self-Review 메모

- **Spec 커버리지:** 항목 1(Task 3)·2(Task 1)·3(Task 4)·5(Task 2) 모두 태스크 있음. 항목 4는 이미 구현돼 의도적 제외(상단 명시).
- **타입 일관성:** `BaseCard` props는 Task 3에서 `statusDot`·`bigStat`, Task 4에서 `donut` 추가 — 누적 확장. Task 4 Step 2가 Task 3 Step 3의 우측 슬롯을 재사용(같은 flex 컨테이너)하므로 순서 의존: **Task 3 → Task 4 순서 필수.**
- **롤백:** 항목별 커밋 5개 분리. 브랜치 폐기 또는 개별 revert 가능.
