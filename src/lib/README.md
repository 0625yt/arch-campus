# src/lib

## claude.ts — AI SDK v6 (Anthropic) + Prompt Caching

새 위저드·생성기를 만들 때 **반드시** 이 모듈을 통해 호출한다 (4-Layer 패턴 layer 2, [ARCHITECTURE.md](../../docs/ARCHITECTURE.md)).

- `generate({ tool, rulePrompt, dynamicContext, userInput })` — JSON/텍스트 1회 생성. 모델은 `tool`로 자동 라우팅(`TOOL_MODEL`).
- `streamChatReply({ tool, ... })` — SSE 스트리밍 (챗 전용).
- `loadPrompt(name)` ([prompts.ts](prompts.ts)) — `_shared/persona-schema.md` + `_shared/master-rules.md` + `src/prompts/<name>.md` 조합. **이걸 rulePrompt로 쓴다.**
- `estimateCost(usage)` · `getModelIdFor(tool)` 보조.

### 사용 예시

```ts
// src/app/api/wizards/presentation/route.ts (실제 패턴 요약)
import { generate, estimateCost } from "@/lib/claude";
import { loadPrompt } from "@/lib/prompts";
import { tryGetOwnerId } from "@/lib/auth";

export async function POST(req: Request) {
  // 1. 세션 검증 (owner_id)
  const ownerId = await tryGetOwnerId();
  if (!ownerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  // 2. Zod 입력 검증 + 길이 제한
  // 3. guardRateLimit("ai", ownerId)
  // 4. (비동기 위저드면) enqueueJob → after()로 백그라운드 실행

  const body = await req.json();
  const { topic, audience, durationMin } = body;

  // 정적 룰 (캐시되는 부분) — persona + master-rules + 도구 프롬프트
  const rulePrompt = loadPrompt("presentation");

  // 동적 컨텍스트 (캐시 안 됨) — 학생·과목·자료 메타
  const dynamicContext = `발표 시간: ${durationMin}분\n청중: ${audience}`;

  // 사용자 자유 입력 — generate()가 자동으로 <user_input> 태그로 감쌈
  const userInput = `발표 주제: ${topic}`;

  const result = await generate({
    tool: "presentation",         // ← 모델 라우팅 키 (필수)
    rulePrompt,
    dynamicContext,
    userInput,
  });

  // 5. estimateCost(result.usage) 로깅 / generations 테이블 저장
  return Response.json({ text: result.text, cost: estimateCost(result.usage) });
}
```

### 캐싱 동작

- 첫 호출: `rulePrompt`가 cache write로 들어가고 비용 1.25배 (3.75/3.0). 이후 1시간 동안 재사용.
- 재호출: `rulePrompt`가 cache read로 들어가고 비용 0.1배 (0.3/3.0).
- 손익분기점: 1시간 안에 같은 도구가 **2번 이상** 호출되면 무조건 이득.

### 제약

- 캐싱 최소 토큰: **Sonnet/Opus 1024**, **Haiku 4096** 미만이면 `cache_control` 무시됨. `generate()`가 미달 시 dev 경고(`warnIfBelowCacheMin`).
- `dynamicContext`는 절대 캐싱하지 말 것 — 학생마다 다르므로 캐시 미스 100%.
- `userInput`은 시스템 프롬프트에 직접 concat 금지 (prompt injection 방어). `generate()`가 자동으로 `<user_input>` 태그로 감싸고, 모든 system 앞에 `INJECTION_GUARD`를 prepend한다.
- 새 도구 프롬프트는 `src/prompts/<tool>.md`로 두고 `loadPrompt("<tool>")`로 로드. `ToolKind`(claude.ts)와 `PromptName`(prompts.ts) 양쪽에 키를 추가해야 한다.
- 새 ToolKind를 비동기 `jobs`로 돌리려면 `jobs.tool` CHECK 제약을 확장하는 마이그레이션이 필요(예: 0020).
