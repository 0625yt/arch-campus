# 인앱 피드백 수집 + 관리자 화면 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생이 요약/퀴즈에 별점·카테고리·한 줄 피드백을 남기고, 관리자가 /admin/feedback에서 보고 상태 관리 + AI 패턴 묶기까지 한 번에.

**Architecture:** Supabase `feedback` 테이블(사용자가 적용 완료) + Next.js App Router API 라우트 + 클라이언트 모달 + 관리자 layout 가드. AI 묶기는 일회성 Haiku 호출, DB 저장 X.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase(service-role + RLS), Anthropic Haiku 4.5, Zod, Vitest.

**Spec:** [docs/superpowers/specs/2026-05-31-feedback-collection-design.md](../specs/2026-05-31-feedback-collection-design.md)

**중요 운영 결정 (spec 보정):**
- `feedback.target_type`은 spec의 `'summary' | 'quiz_item'`를 그대로 유지하되, quiz는 questionId가 number라 uuid에 못 박는다. **quiz_item의 target_id에는 `quiz_id`(uuid)를 박고, body 앞부분에 자동으로 `[Q{questionId}] ` 프리픽스를 붙여서 어느 문항인지 식별한다.** 1차는 이게 가장 작음.
- summary의 target_id에는 `material_id`(uuid).
- generation_id는 summary는 generations.id (summarize tool), quiz_item은 우선 null (퀴즈 풀이에서 generation 매핑이 1:1 아니라서 1차 생략).

---

## 파일 구조

**신규:**
- `src/lib/schemas/feedback.ts` — Zod 스키마 + 카테고리 enum
- `src/lib/auth/admin.ts` — ADMIN_USER_IDS 화이트리스트 체크
- `src/components/feedback-modal.tsx` — 입력 UI (모달)
- `src/components/feedback-trigger-button.tsx` — 트리거 버튼
- `src/app/api/feedback/route.ts` — POST
- `src/app/admin/layout.tsx` — 관리자 가드
- `src/app/admin/feedback/page.tsx` — 리스트 (서버 컴포넌트)
- `src/app/admin/feedback/feedback-list-client.tsx` — 클라이언트 필터·체크박스
- `src/app/admin/feedback/feedback-detail-sheet.tsx` — 상세
- `src/app/admin/feedback/analyze-button.tsx` — AI 묶기 버튼
- `src/app/admin/feedback/analyze-result-sheet.tsx` — 분석 결과 모달
- `src/app/api/admin/feedback/[id]/route.ts` — PATCH
- `src/app/api/admin/feedback/analyze/route.ts` — POST
- `src/lib/schemas/feedback.test.ts` — Vitest

**수정:**
- `src/app/dashboard/study/[course]/[material]/summary-column.tsx` — 헤더에 피드백 버튼
- `src/app/dashboard/quiz/[quizId]/quiz-solver.tsx` — 문항 카드 하단 버튼 (현재 step 영역)
- `.env.example` — ADMIN_USER_IDS

---

## Task 1: Zod 스키마 + 카테고리 enum

**Files:**
- Create: `src/lib/schemas/feedback.ts`
- Create: `src/lib/schemas/feedback.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/schemas/feedback.test.ts
import { describe, expect, it } from "vitest";
import {
  FeedbackInsertBody,
  SUMMARY_CATEGORIES,
  QUIZ_ITEM_CATEGORIES,
  isValidCategoryFor,
} from "./feedback";

describe("FeedbackInsertBody", () => {
  it("summary 카테고리 정상 통과", () => {
    const out = FeedbackInsertBody.parse({
      targetType: "summary",
      targetId: "11111111-1111-1111-1111-111111111111",
      rating: 4,
      category: "accuracy",
      body: "좋아요",
    });
    expect(out.rating).toBe(4);
  });

  it("rating 0이면 거부", () => {
    expect(() =>
      FeedbackInsertBody.parse({
        targetType: "summary",
        targetId: "11111111-1111-1111-1111-111111111111",
        rating: 0,
        category: "accuracy",
      }),
    ).toThrow();
  });

  it("body 500자 초과 거부", () => {
    expect(() =>
      FeedbackInsertBody.parse({
        targetType: "summary",
        targetId: "11111111-1111-1111-1111-111111111111",
        rating: 3,
        category: "accuracy",
        body: "ㅋ".repeat(501),
      }),
    ).toThrow();
  });

  it("isValidCategoryFor: summary와 quiz_item 카테고리가 섞이면 X", () => {
    expect(isValidCategoryFor("summary", "accuracy")).toBe(true);
    expect(isValidCategoryFor("summary", "answer_wrong")).toBe(false);
    expect(isValidCategoryFor("quiz_item", "answer_wrong")).toBe(true);
    expect(isValidCategoryFor("quiz_item", "accuracy")).toBe(false);
  });

  it("카테고리 목록 노출", () => {
    expect(SUMMARY_CATEGORIES.length).toBeGreaterThan(0);
    expect(QUIZ_ITEM_CATEGORIES.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

Run: `npm run test -- src/lib/schemas/feedback.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 스키마 작성**

```ts
// src/lib/schemas/feedback.ts
import { z } from "zod";

export const TARGET_TYPES = ["summary", "quiz_item"] as const;
export type FeedbackTargetType = (typeof TARGET_TYPES)[number];

export const SUMMARY_CATEGORIES = [
  { value: "accuracy", label: "정확도" },
  { value: "omission", label: "내용 누락" },
  { value: "format", label: "형식" },
  { value: "tone", label: "말투" },
  { value: "other", label: "기타" },
] as const;

export const QUIZ_ITEM_CATEGORIES = [
  { value: "answer_wrong", label: "정답 오류" },
  { value: "explanation_wrong", label: "해설 오류" },
  { value: "distractor_wrong", label: "보기 설명 오류" },
  { value: "unclear", label: "문제 모호함" },
  { value: "other", label: "기타" },
] as const;

const SUMMARY_VALUES = SUMMARY_CATEGORIES.map((c) => c.value) as readonly string[];
const QUIZ_VALUES = QUIZ_ITEM_CATEGORIES.map((c) => c.value) as readonly string[];

export function isValidCategoryFor(
  type: FeedbackTargetType,
  category: string,
): boolean {
  if (type === "summary") return SUMMARY_VALUES.includes(category);
  return QUIZ_VALUES.includes(category);
}

export const FeedbackInsertBody = z.object({
  targetType: z.enum(TARGET_TYPES),
  targetId: z.string().uuid(),
  generationId: z.string().uuid().optional(),
  rating: z.number().int().min(1).max(5),
  category: z.string().min(1).max(50),
  body: z.string().max(500).optional(),
  /** quiz_item일 때만 채워서 body 앞에 [Q{n}] 프리픽스 자동 부착 */
  quizQuestionIndex: z.number().int().min(0).optional(),
});
export type FeedbackInsertBodyT = z.infer<typeof FeedbackInsertBody>;

export const FEEDBACK_STATUSES = ["new", "triaged", "accepted", "wontfix"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FeedbackPatchBody = z.object({
  status: z.enum(FEEDBACK_STATUSES),
  adminNote: z.string().max(500).optional(),
});
export type FeedbackPatchBodyT = z.infer<typeof FeedbackPatchBody>;
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- src/lib/schemas/feedback.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/schemas/feedback.ts src/lib/schemas/feedback.test.ts
git commit -m "feedback: Zod 스키마 + summary/quiz_item 카테고리 enum"
```

---

## Task 2: ADMIN_USER_IDS 가드 헬퍼

**Files:**
- Create: `src/lib/auth/admin.ts`
- Create: `src/lib/auth/admin.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: 실패 테스트**

```ts
// src/lib/auth/admin.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isAdminUserId } from "./admin";

describe("isAdminUserId", () => {
  beforeEach(() => {
    delete process.env.ADMIN_USER_IDS;
  });
  afterEach(() => {
    delete process.env.ADMIN_USER_IDS;
  });

  it("env 비어있으면 누구도 admin X", () => {
    expect(isAdminUserId("11111111-1111-1111-1111-111111111111")).toBe(false);
  });

  it("화이트리스트 포함이면 true", () => {
    process.env.ADMIN_USER_IDS = "11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222";
    expect(isAdminUserId("11111111-1111-1111-1111-111111111111")).toBe(true);
    expect(isAdminUserId("22222222-2222-2222-2222-222222222222")).toBe(true);
  });

  it("포함 안 되면 false", () => {
    process.env.ADMIN_USER_IDS = "11111111-1111-1111-1111-111111111111";
    expect(isAdminUserId("99999999-9999-9999-9999-999999999999")).toBe(false);
  });

  it("공백 있어도 trim", () => {
    process.env.ADMIN_USER_IDS = " 11111111-1111-1111-1111-111111111111 ,  22222222-2222-2222-2222-222222222222";
    expect(isAdminUserId("11111111-1111-1111-1111-111111111111")).toBe(true);
    expect(isAdminUserId("22222222-2222-2222-2222-222222222222")).toBe(true);
  });

  it("null/빈 입력은 false", () => {
    process.env.ADMIN_USER_IDS = "11111111-1111-1111-1111-111111111111";
    expect(isAdminUserId(null)).toBe(false);
    expect(isAdminUserId("")).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- src/lib/auth/admin.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 헬퍼 구현**

```ts
// src/lib/auth/admin.ts
/**
 * /admin/* 라우트와 admin API에서 사용하는 화이트리스트.
 *
 * env ADMIN_USER_IDS는 콤마 구분. 비어있거나 미설정이면 누구도 admin X.
 * 운영 변경: Vercel env에 본인 user_id 추가 후 재배포.
 */
export function isAdminUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const raw = process.env.ADMIN_USER_IDS?.trim();
  if (!raw) return false;
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return ids.includes(userId);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- src/lib/auth/admin.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: .env.example 갱신**

`.env.example` 끝에 추가:

```
# /admin/* 라우트 접근 허용 user_id 콤마 구분 (Supabase auth.users.id)
ADMIN_USER_IDS=
```

- [ ] **Step 6: 커밋**

```bash
git add src/lib/auth/admin.ts src/lib/auth/admin.test.ts .env.example
git commit -m "feedback: ADMIN_USER_IDS 화이트리스트 가드"
```

---

## Task 3: POST /api/feedback

**Files:**
- Create: `src/app/api/feedback/route.ts`

- [ ] **Step 1: 라우트 구현**

```ts
// src/app/api/feedback/route.ts
import { NextResponse } from "next/server";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import {
  FeedbackInsertBody,
  isValidCategoryFor,
} from "@/lib/schemas/feedback";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });
    }
    throw e;
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식" }, { status: 400 });
  }

  const parsed = FeedbackInsertBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력 형식이 맞지 않아요", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // target_type별 카테고리 재검증 — 클라이언트 우회 방지
  if (!isValidCategoryFor(input.targetType, input.category)) {
    return NextResponse.json({ error: "카테고리가 맞지 않아요" }, { status: 400 });
  }

  const admin = getAdminSupabase();

  // 24h 중복 차단
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: dupe } = await admin
    .from("feedback")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("target_type", input.targetType)
    .eq("target_id", input.targetId)
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();

  if (dupe) {
    return NextResponse.json(
      { error: "최근에 이미 피드백을 남기셨어요" },
      { status: 409 },
    );
  }

  // quiz_item이면 body 앞에 [Q{idx}] 자동 부착
  let body = input.body ?? null;
  if (input.targetType === "quiz_item" && typeof input.quizQuestionIndex === "number") {
    const prefix = `[Q${input.quizQuestionIndex + 1}] `;
    body = body ? `${prefix}${body}` : prefix.trim();
  }

  const { data, error } = await admin
    .from("feedback")
    .insert({
      owner_id: ownerId,
      target_type: input.targetType,
      target_id: input.targetId,
      generation_id: input.generationId ?? null,
      rating: input.rating,
      category: input.category,
      body,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "저장에 실패했어요", detail: error?.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
```

- [ ] **Step 2: 타입 체크**

Run: `npm run typecheck`
Expected: 통과. feedback 테이블 타입이 supabase/types에 없으면 admin 클라이언트가 `any`로 떨어질 수 있음 — 그 경우 다음 step 수행, 아니면 skip.

- [ ] **Step 3: (필요 시) supabase 타입 재생성 안내**

`src/lib/supabase/types.ts`에 `feedback` 테이블 타입이 없으면 사용자에게 안내:
```bash
npx supabase gen types typescript --linked > src/lib/supabase/types.ts
```
사용자가 직접 실행. 없어도 admin 클라이언트는 동작 (any로 떨어짐).

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/feedback/route.ts
git commit -m "feedback: POST /api/feedback — 24h 중복 차단 + 카테고리 재검증"
```

---

## Task 4: FeedbackModal + FeedbackTriggerButton 컴포넌트

**Files:**
- Create: `src/components/feedback-modal.tsx`
- Create: `src/components/feedback-trigger-button.tsx`

- [ ] **Step 1: 모달 컴포넌트**

```tsx
// src/components/feedback-modal.tsx
"use client";

import { useState } from "react";
import {
  SUMMARY_CATEGORIES,
  QUIZ_ITEM_CATEGORIES,
  type FeedbackTargetType,
} from "@/lib/schemas/feedback";

interface Props {
  targetType: FeedbackTargetType;
  targetId: string;
  generationId?: string;
  quizQuestionIndex?: number;
  onClose: () => void;
}

export function FeedbackModal({
  targetType,
  targetId,
  generationId,
  quizQuestionIndex,
  onClose,
}: Props) {
  const categories = targetType === "summary" ? SUMMARY_CATEGORIES : QUIZ_ITEM_CATEGORIES;
  const [rating, setRating] = useState<number>(0);
  const [category, setCategory] = useState<string>(categories[0].value);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (rating < 1) {
      setErr("별점을 선택해주세요");
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          generationId,
          rating,
          category,
          body: body.trim() || undefined,
          quizQuestionIndex,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? "저장에 실패했어요");
        setSubmitting(false);
        return;
      }
      onClose();
    } catch (e) {
      setErr("네트워크 오류");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">이 결과 어땠어요?</h2>
        <p className="mt-1 text-sm text-neutral-500">
          별점·분류·한 줄 의견을 남겨주세요. 익명으로 관리자만 봅니다.
        </p>

        <div className="mt-4">
          <div className="text-xs font-medium text-neutral-700">별점</div>
          <div className="mt-1 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n}점`}
                onClick={() => setRating(n)}
                className={`text-2xl transition ${
                  n <= rating ? "text-amber-400" : "text-neutral-300"
                }`}
              >
                ★
              </button>
            ))}
            <span className="ml-2 self-center text-xs text-neutral-500">
              {rating > 0 ? `${rating}점` : "선택"}
            </span>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs font-medium text-neutral-700" htmlFor="fb-cat">
            분류
          </label>
          <select
            id="fb-cat"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          >
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4">
          <label className="text-xs font-medium text-neutral-700" htmlFor="fb-body">
            한 줄 의견 (선택, 500자)
          </label>
          <textarea
            id="fb-body"
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 500))}
            rows={3}
            placeholder="구체적일수록 빠르게 고칠 수 있어요"
            className="mt-1 w-full resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          />
          <div className="mt-1 text-right text-xs text-neutral-400">{body.length}/500</div>
        </div>

        {err && <div className="mt-2 text-sm text-red-600">{err}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            취소
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "보내는 중…" : "보내기"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 트리거 버튼**

```tsx
// src/components/feedback-trigger-button.tsx
"use client";

import { useState } from "react";
import { FeedbackModal } from "./feedback-modal";
import type { FeedbackTargetType } from "@/lib/schemas/feedback";

interface Props {
  targetType: FeedbackTargetType;
  targetId: string;
  generationId?: string;
  quizQuestionIndex?: number;
  label?: string;
  className?: string;
}

export function FeedbackTriggerButton({
  targetType,
  targetId,
  generationId,
  quizQuestionIndex,
  label = "피드백",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-xs text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline ${className}`}
      >
        {label}
      </button>
      {open && (
        <FeedbackModal
          targetType={targetType}
          targetId={targetId}
          generationId={generationId}
          quizQuestionIndex={quizQuestionIndex}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: 타입 체크**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add src/components/feedback-modal.tsx src/components/feedback-trigger-button.tsx
git commit -m "feedback: FeedbackModal + 트리거 버튼 컴포넌트"
```

---

## Task 5: 요약 상세 페이지에 버튼 부착

**Files:**
- Modify: `src/app/dashboard/study/[course]/[material]/summary-column.tsx`

- [ ] **Step 1: 현재 헤더 영역 위치 확인**

Run: `grep -n "SummaryColumn\|<article\|className=\"arch-print-target" src/app/dashboard/study/\[course\]/\[material\]/summary-column.tsx | head -10`

- [ ] **Step 2: props에 materialId·generationId 받고 버튼 렌더링 추가**

`SummaryColumn` props에 `materialId: string`과 `generationId?: string`을 추가하고, `<article>` 직전 또는 헤더 영역에 다음 추가:

```tsx
import { FeedbackTriggerButton } from "@/components/feedback-trigger-button";

// 컴포넌트 안, article 시작 직전에:
<div className="mb-2 flex justify-end print:hidden">
  <FeedbackTriggerButton
    targetType="summary"
    targetId={materialId}
    generationId={generationId}
    label="이 요약 피드백"
  />
</div>
```

호출부(`page.tsx`)에서 materialId·generationId 넘기도록 수정. generationId는 detail에서 가져오면 됨 (없으면 undefined).

- [ ] **Step 3: 빌드 확인**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add src/app/dashboard/study/
git commit -m "feedback: 요약 상세에 피드백 버튼"
```

---

## Task 6: 퀴즈 풀이 화면 문항 카드에 버튼 부착

**Files:**
- Modify: `src/app/dashboard/quiz/[quizId]/quiz-solver.tsx`

- [ ] **Step 1: 현재 step 영역 위치 확인**

Run: `grep -n "currentQuestion\|stepIndex" src/app/dashboard/quiz/\[quizId\]/quiz-solver.tsx | head -10`

- [ ] **Step 2: 단일 step 카드 하단에 버튼 추가**

`quiz-solver.tsx`에서 currentQuestion을 그리는 카드 컴포넌트 하단 (라인 ~405-440 영역)에:

```tsx
import { FeedbackTriggerButton } from "@/components/feedback-trigger-button";

// quiz-solver는 quizId를 props 또는 closure로 가지고 있어야 함 (없으면 부모에서 prop으로 받기)
// 카드 푸터:
<div className="mt-3 flex justify-end print:hidden">
  <FeedbackTriggerButton
    targetType="quiz_item"
    targetId={quizId}
    quizQuestionIndex={stepIndex}
    label="이 문제 이상해요"
  />
</div>
```

`quizId`가 컴포넌트에 없으면 호출부에서 prop으로 추가 전달.

- [ ] **Step 3: 타입체크**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add src/app/dashboard/quiz/
git commit -m "feedback: 퀴즈 풀이 문항마다 '이 문제 이상해요' 버튼"
```

---

## Task 7: /admin/layout.tsx 가드

**Files:**
- Create: `src/app/admin/layout.tsx`

- [ ] **Step 1: layout 작성**

```tsx
// src/app/admin/layout.tsx
import { redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { isAdminUserId } from "@/lib/auth/admin";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ownerId = await tryGetOwnerId();
  if (!ownerId || !isAdminUserId(ownerId)) {
    redirect("/");
  }
  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 text-xs font-medium tracking-widest text-neutral-400">
        ADMIN
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add src/app/admin/layout.tsx
git commit -m "feedback: /admin/* 가드 layout"
```

---

## Task 8: /admin/feedback 리스트 (서버 + 클라이언트 분리)

**Files:**
- Create: `src/app/admin/feedback/page.tsx`
- Create: `src/app/admin/feedback/feedback-list-client.tsx`

- [ ] **Step 1: 서버 페이지 — 쿼리 + 클라이언트로 전달**

```tsx
// src/app/admin/feedback/page.tsx
import { getAdminSupabase } from "@/lib/supabase/admin";
import { FeedbackListClient } from "./feedback-list-client";
import type { FeedbackStatus } from "@/lib/schemas/feedback";

export const dynamic = "force-dynamic";

interface SearchParams {
  status?: string;
  targetType?: string;
  category?: string;
}

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const status = (sp.status as FeedbackStatus) ?? "new";
  const admin = getAdminSupabase();

  let query = admin
    .from("feedback")
    .select(
      "id, owner_id, target_type, target_id, generation_id, rating, category, body, status, admin_note, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);
  if (sp.targetType) query = query.eq("target_type", sp.targetType);
  if (sp.category) query = query.eq("category", sp.category);

  const { data, error } = await query;

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
        조회 실패: {error.message}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">피드백</h1>
      <p className="mt-1 text-sm text-neutral-500">
        학생들이 남긴 피드백을 보고 채택/반려하세요. AI 묶기는 우상단 버튼.
      </p>
      <div className="mt-6">
        <FeedbackListClient items={data ?? []} currentStatus={status} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 클라이언트 — 필터 탭 + 리스트 + 체크박스**

```tsx
// src/app/admin/feedback/feedback-list-client.tsx
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  FEEDBACK_STATUSES,
  type FeedbackStatus,
} from "@/lib/schemas/feedback";
import { FeedbackDetailSheet } from "./feedback-detail-sheet";
import { AnalyzeButton } from "./analyze-button";

interface Item {
  id: string;
  owner_id: string;
  target_type: string;
  target_id: string;
  generation_id: string | null;
  rating: number;
  category: string;
  body: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

export function FeedbackListClient({
  items,
  currentStatus,
}: {
  items: Item[];
  currentStatus: FeedbackStatus;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Item | null>(null);

  function setStatus(s: FeedbackStatus) {
    const params = new URLSearchParams(sp.toString());
    params.set("status", s);
    router.push(`/admin/feedback?${params.toString()}`);
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1">
          {FEEDBACK_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                currentStatus === s
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <AnalyzeButton selectedIds={Array.from(selected)} />
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-200 p-8 text-center text-sm text-neutral-400">
          해당 상태의 피드백이 없어요
        </div>
      ) : (
        <div className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200">
          {items.map((it) => (
            <div
              key={it.id}
              className="flex items-start gap-3 bg-white p-3 hover:bg-neutral-50"
            >
              <input
                type="checkbox"
                checked={selected.has(it.id)}
                onChange={() => toggle(it.id)}
                className="mt-1"
              />
              <button
                type="button"
                onClick={() => setDetail(it)}
                className="flex-1 text-left"
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-amber-500">{"★".repeat(it.rating)}</span>
                  <span className="text-neutral-400">·</span>
                  <span className="font-medium text-neutral-700">{it.target_type}</span>
                  <span className="text-neutral-400">·</span>
                  <span className="text-neutral-500">{it.category}</span>
                </div>
                <div className="mt-1 line-clamp-1 text-sm text-neutral-600">
                  {it.body ?? <span className="text-neutral-300">(본문 없음)</span>}
                </div>
                <div className="mt-1 text-xs text-neutral-400">
                  {new Date(it.created_at).toLocaleString("ko-KR")}
                </div>
              </button>
            </div>
          ))}
        </div>
      )}

      {detail && (
        <FeedbackDetailSheet item={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: 타입체크 (detail-sheet / analyze-button 아직 없어서 실패 OK — Task 9~10에서 채움)**

Skip typecheck until Task 10.

- [ ] **Step 4: 커밋**

```bash
git add src/app/admin/feedback/page.tsx src/app/admin/feedback/feedback-list-client.tsx
git commit -m "feedback: /admin/feedback 리스트 + 필터 탭 + 체크박스"
```

---

## Task 9: FeedbackDetailSheet + PATCH 라우트

**Files:**
- Create: `src/app/admin/feedback/feedback-detail-sheet.tsx`
- Create: `src/app/api/admin/feedback/[id]/route.ts`

- [ ] **Step 1: PATCH 라우트**

```ts
// src/app/api/admin/feedback/[id]/route.ts
import { NextResponse } from "next/server";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { isAdminUserId } from "@/lib/auth/admin";
import { FeedbackPatchBody } from "@/lib/schemas/feedback";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw e;
  }
  if (!isAdminUserId(ownerId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const parsed = FeedbackPatchBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력 오류", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const admin = getAdminSupabase();
  const { error } = await admin
    .from("feedback")
    .update({
      status: parsed.data.status,
      admin_note: parsed.data.adminNote ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: DetailSheet**

```tsx
// src/app/admin/feedback/feedback-detail-sheet.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  FEEDBACK_STATUSES,
  type FeedbackStatus,
} from "@/lib/schemas/feedback";

interface Item {
  id: string;
  owner_id: string;
  target_type: string;
  target_id: string;
  generation_id: string | null;
  rating: number;
  category: string;
  body: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

export function FeedbackDetailSheet({
  item,
  onClose,
}: {
  item: Item;
  onClose: () => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<FeedbackStatus>(item.status as FeedbackStatus);
  const [adminNote, setAdminNote] = useState(item.admin_note ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    const res = await fetch(`/api/admin/feedback/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, adminNote: adminNote.trim() || undefined }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "저장 실패");
      setSaving(false);
      return;
    }
    onClose();
    router.refresh();
  }

  const targetLink =
    item.target_type === "summary"
      ? `/dashboard/study/_/${item.target_id}` // 실제 course 모름 — 일단 _로 갔다가 redirect
      : `/dashboard/quiz/${item.target_id}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-amber-500">{"★".repeat(item.rating)}</span>
          <span className="text-neutral-400">·</span>
          <span className="font-medium">{item.target_type}</span>
          <span className="text-neutral-400">·</span>
          <span className="text-neutral-500">{item.category}</span>
        </div>

        <div className="mt-3 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
          {item.body ?? "(본문 없음)"}
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-500">
          <div>
            <dt>작성자</dt>
            <dd className="font-mono text-neutral-700">{item.owner_id.slice(0, 8)}…</dd>
          </div>
          <div>
            <dt>대상 ID</dt>
            <dd className="font-mono text-neutral-700">{item.target_id.slice(0, 8)}…</dd>
          </div>
          <div>
            <dt>generation</dt>
            <dd className="font-mono text-neutral-700">
              {item.generation_id ? item.generation_id.slice(0, 8) + "…" : "—"}
            </dd>
          </div>
          <div>
            <dt>작성 시간</dt>
            <dd>{new Date(item.created_at).toLocaleString("ko-KR")}</dd>
          </div>
        </dl>

        <a
          href={targetLink}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-xs text-blue-600 underline"
        >
          원본 자료 열기 ↗
        </a>

        <div className="mt-4">
          <div className="text-xs font-medium text-neutral-700">상태</div>
          <div className="mt-1 flex gap-1">
            {FEEDBACK_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded-full px-3 py-1 text-xs ${
                  status === s
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <label className="text-xs font-medium text-neutral-700" htmlFor="admin-note">
            관리자 메모
          </label>
          <textarea
            id="admin-note"
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value.slice(0, 500))}
            rows={2}
            className="mt-1 w-full resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>

        {err && <div className="mt-2 text-sm text-red-600">{err}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">
            닫기
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/admin/feedback/feedback-detail-sheet.tsx src/app/api/admin/feedback/\[id\]/route.ts
git commit -m "feedback: 상세 sheet + PATCH 상태/메모"
```

---

## Task 10: AnalyzeButton + 분석 API

**Files:**
- Create: `src/app/admin/feedback/analyze-button.tsx`
- Create: `src/app/admin/feedback/analyze-result-sheet.tsx`
- Create: `src/app/api/admin/feedback/analyze/route.ts`

- [ ] **Step 1: 분석 API**

```ts
// src/app/api/admin/feedback/analyze/route.ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { isAdminUserId } from "@/lib/auth/admin";
import { MODELS } from "@/lib/claude";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

const PROMPT_FILES: Record<string, string> = {
  summary: "summarize.md",
  quiz_item: "quiz.md",
};

export async function POST(req: Request) {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw e;
  }
  if (!isAdminUserId(ownerId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "ids 필요" }, { status: 400 });
  }

  const admin = getAdminSupabase();
  const { data: rows, error } = await admin
    .from("feedback")
    .select("id, target_type, target_id, rating, category, body, generation_id, created_at")
    .in("id", parsed.data.ids);

  if (error || !rows || rows.length === 0) {
    return NextResponse.json({ error: "피드백 조회 실패" }, { status: 500 });
  }

  // target_type별로 그룹
  const byType = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byType.get(r.target_type) ?? [];
    arr.push(r);
    byType.set(r.target_type, arr);
  }

  const clusters: Array<{
    title: string;
    severity: "high" | "mid" | "low";
    feedbackIds: string[];
    suspectedPromptSection: string;
    suggestedFix: string;
  }> = [];

  for (const [type, group] of byType) {
    const promptFile = PROMPT_FILES[type];
    let promptBody = "";
    if (promptFile) {
      try {
        promptBody = await readFile(
          path.join(process.cwd(), "src/prompts", promptFile),
          "utf-8",
        );
      } catch {
        promptBody = "(프롬프트 파일 없음)";
      }
    }

    const feedbackText = group
      .map(
        (r) =>
          `- id=${r.id} ★${r.rating} category=${r.category}: ${r.body ?? "(본문 없음)"}`,
      )
      .join("\n");

    const userMsg = `다음은 학생들이 ${type}에 남긴 피드백 ${group.length}건입니다.

피드백 목록:
${feedbackText}

현재 프롬프트 (src/prompts/${promptFile}):
\`\`\`
${promptBody.slice(0, 6000)}
\`\`\`

위 피드백을 분석해서 **공통 패턴**을 찾아 클러스터로 묶어주세요. 각 클러스터마다:
- title: 한 줄 요약
- severity: "high" (즉시 고쳐야 함) / "mid" / "low"
- feedbackIds: 묶인 피드백 id 배열
- suspectedPromptSection: 위 프롬프트의 어느 섹션/규칙이 원인인지
- suggestedFix: 한 단락 (참고용)

반드시 JSON으로만 답하세요. 형식:
{
  "clusters": [
    {"title": "...", "severity": "...", "feedbackIds": ["..."], "suspectedPromptSection": "...", "suggestedFix": "..."}
  ]
}`;

    try {
      const result = await generateText({
        model: anthropic(MODELS.haiku),
        messages: [{ role: "user", content: userMsg }],
        maxOutputTokens: 4000,
      });
      // JSON 추출
      const match = result.text.match(/\{[\s\S]*\}/);
      if (match) {
        const obj = JSON.parse(match[0]);
        if (Array.isArray(obj.clusters)) {
          clusters.push(...obj.clusters);
        }
      }
    } catch (err) {
      // 그룹 하나 실패해도 나머지는 진행
      console.error(`[analyze] ${type} 실패`, err);
    }
  }

  return NextResponse.json({ clusters });
}
```

- [ ] **Step 2: AnalyzeButton + 결과 sheet**

```tsx
// src/app/admin/feedback/analyze-result-sheet.tsx
"use client";

interface Cluster {
  title: string;
  severity: "high" | "mid" | "low";
  feedbackIds: string[];
  suspectedPromptSection: string;
  suggestedFix: string;
}

export function AnalyzeResultSheet({
  clusters,
  onClose,
}: {
  clusters: Cluster[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">AI 분석 결과</h2>
          <button onClick={onClose} className="text-sm text-neutral-500">
            닫기
          </button>
        </div>
        <div className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠️ 참고용 제안 — 자동 적용 안 됨. 채택할 패턴은 직접 프롬프트 수정.
        </div>

        {clusters.length === 0 ? (
          <div className="mt-4 text-sm text-neutral-400">묶인 패턴이 없어요</div>
        ) : (
          <div className="mt-4 space-y-3">
            {clusters.map((c, i) => (
              <div
                key={i}
                className="rounded-lg border border-neutral-200 p-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      c.severity === "high"
                        ? "bg-red-100 text-red-700"
                        : c.severity === "mid"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {c.severity.toUpperCase()}
                  </span>
                  <span className="font-medium">{c.title}</span>
                </div>
                <div className="mt-2 text-xs text-neutral-500">
                  묶인 피드백 {c.feedbackIds.length}건
                </div>
                <div className="mt-2 text-xs">
                  <span className="font-medium text-neutral-700">의심 위치: </span>
                  <span className="text-neutral-600">{c.suspectedPromptSection}</span>
                </div>
                <div className="mt-2 text-sm text-neutral-700">{c.suggestedFix}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

```tsx
// src/app/admin/feedback/analyze-button.tsx
"use client";

import { useState } from "react";
import { AnalyzeResultSheet } from "./analyze-result-sheet";

export function AnalyzeButton({ selectedIds }: { selectedIds: string[] }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Parameters<typeof AnalyzeResultSheet>[0]["clusters"] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function analyze() {
    if (selectedIds.length === 0) {
      setErr("먼저 피드백을 선택해주세요");
      return;
    }
    setLoading(true);
    setErr(null);
    const res = await fetch("/api/admin/feedback/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "분석 실패");
      setLoading(false);
      return;
    }
    const j = await res.json();
    setResult(j.clusters ?? []);
    setLoading(false);
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {err && <span className="text-xs text-red-600">{err}</span>}
        <button
          type="button"
          disabled={loading || selectedIds.length === 0}
          onClick={analyze}
          className="rounded-full bg-violet-600 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {loading
            ? "분석 중…"
            : `AI로 묶기 (${selectedIds.length})`}
        </button>
      </div>
      {result !== null && (
        <AnalyzeResultSheet clusters={result} onClose={() => setResult(null)} />
      )}
    </>
  );
}
```

- [ ] **Step 3: 타입체크**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add src/app/admin/feedback/analyze-button.tsx src/app/admin/feedback/analyze-result-sheet.tsx src/app/api/admin/feedback/analyze/route.ts
git commit -m "feedback: AI 클러스터링 — Haiku로 패턴 묶기 (일회성, DB 저장 X)"
```

---

## Task 11: 빌드 + 수동 검증

- [ ] **Step 1: 빌드**

Run: `npm run build`
Expected: PASS

- [ ] **Step 2: 로컬 dev 서버**

Run: `npm run dev`
브라우저로:
1. 학생 계정 로그인 → 요약 페이지에서 "이 요약 피드백" 클릭 → 모달 → 별점·분류·텍스트 → 보내기 → DB에 row 생긴 것 확인
2. 같은 자료에 다시 시도 → 409 "최근에 이미 피드백을 남기셨어요"
3. 퀴즈 풀이 화면 → 문항마다 "이 문제 이상해요" → 보내기
4. ADMIN_USER_IDS=본인_user_id 추가 후 재시작 → `/admin/feedback` 진입 가능
5. 비admin 계정 → `/admin/feedback` 진입 시 `/`로 redirect
6. 리스트에서 행 클릭 → 상세 → 상태 변경 + 메모 → 저장 → 리스트 갱신
7. 체크박스로 N개 선택 → "AI로 묶기" → 결과 카드 표시

- [ ] **Step 3: 최종 커밋 (필요 시) + 푸시**

```bash
git status
# 정리할 게 있으면 추가 커밋
git push origin main
```

---

## Self-Review

**Spec 커버리지:**
- 데이터 모델 → Task 0 (이미 사용자가 적용) + 모든 task가 컬럼 사용
- 학생 피드백 모달 → Task 4
- 트리거 버튼 위치 (요약·퀴즈) → Task 5, 6
- POST /api/feedback (zod·24h 중복·카테고리 재검증) → Task 3
- 관리자 가드 (env 화이트리스트) → Task 2, 7
- /admin/feedback 리스트 + 필터 → Task 8
- 상세 + 상태 변경 → Task 9
- AI 묶기 (Haiku, 일회성) → Task 10
- 비용·보안·테스트 → Task 1, 2 (vitest) + Task 11 (수동)

**플레이스홀더:** 없음.

**타입 일관성:** `FeedbackTargetType`, `FeedbackStatus`, `Item` 인터페이스 page → list → sheet 모두 동일 컬럼.

**스펙 보정:** quiz_item의 target_id는 quiz_id, body 앞에 `[Q{n}]` 자동 부착 — Task 3에서 처리됨.

---

## 실행 옵션

Plan 완성. 두 가지 방식:

1. **Subagent-Driven (추천)** — task당 fresh subagent, 사이마다 리뷰
2. **Inline Execution** — 이 세션에서 batch 실행, 체크포인트로 리뷰

어느 쪽?
