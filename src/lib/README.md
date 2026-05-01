# src/lib

## claude.ts — Anthropic SDK + Prompt Caching

새 위저드·생성기를 만들 때 **반드시** 이 모듈을 통해 호출한다 (CLAUDE.md §4-2, 4-Layer 패턴 layer 2).

### 사용 예시

```ts
// src/app/api/wizard/presentation/route.ts
import { NextResponse } from "next/server";
import { generate, estimateCost } from "@/lib/claude";
import { readFile } from "fs/promises";
import { join } from "path";

export async function POST(req: Request) {
  // 1. 세션 검증
  // const session = await getSession(); if (!session) return ... 401
  // 2. sanitize + 길이 제한
  // 3. rate-limit
  // 4. 페르소나·과목 로드 → dynamicContext

  const body = await req.json();
  const { topic, audience, duration } = body;

  // 정적 룰 (캐시되는 부분) — src/prompts/<tool>.md 에서 로드
  const rulePrompt = await readFile(
    join(process.cwd(), "src/prompts/wizard-presentation.md"),
    "utf-8"
  );

  // 동적 컨텍스트 (캐시 안 됨)
  const dynamicContext = `학생: 컴퓨터공학과 3학년
이번 학기: 운영체제, 자료구조, 데이터베이스
발표 시간: ${duration}분
청중: ${audience}`;

  // 사용자 자유 입력 — 자동으로 <user_input> 태그로 감싸짐
  const userInput = `발표 주제: ${topic}`;

  const result = await generate({ rulePrompt, dynamicContext, userInput });

  // 5. logUsage(result.usage)
  // 6. saveGeneration(...)

  return NextResponse.json({
    text: result.text,
    cost: estimateCost(result.usage),
  });
}
```

### 캐싱 동작

- 첫 호출: `rulePrompt`가 cache write로 들어가고 비용 1.25배 (3.75/3.0). 이후 1시간 동안 재사용.
- 재호출: `rulePrompt`가 cache read로 들어가고 비용 0.1배 (0.3/3.0).
- 손익분기점: 1시간 안에 같은 도구가 **2번 이상** 호출되면 무조건 이득.

### 제약

- `rulePrompt`는 1024 토큰 이상이어야 캐싱 효과 있음 (Anthropic 최소 단위).
- `dynamicContext`는 절대 캐싱하지 말 것 — 학생마다 다르므로 캐시 미스 100%.
- `userInput`은 시스템 프롬프트에 직접 concat 금지 (CLAUDE.md §4-6 prompt injection 방어). 항상 `<user_input>` 태그.
