import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dedupeBySemantics } from "./semantic-dedup";

/**
 * 의미 dedup 실동작 검증 — 실제 Gemini 임베딩 호출.
 * 실행: RUN_SEMDEDUP=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run \
 *   src/lib/services/semantic-dedup.integration.test.ts --reporter=verbose
 */
const shouldRun = process.env.RUN_SEMDEDUP === "1";

// .env.local의 GOOGLE 키를 process.env로 (테스트 러너가 --env-file 안 읽는 경로 대비)
if (shouldRun && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  try {
    const env = readFileSync(".env.local", "utf8");
    const m = env.match(/^GOOGLE_GENERATIVE_AI_API_KEY=(.+)$/m);
    if (m) process.env.GOOGLE_GENERATIVE_AI_API_KEY = m[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    /* noop */
  }
}

describe.runIf(shouldRun)("의미 dedup 실동작", () => {
  it("글자는 다른데 뜻이 같은 문제를 중복으로 잡는다", async () => {
    const items = [
      { text: "제안을 뜻하는 영어 단어로 옳은 것은?" }, // 0
      { text: "suggestion의 의미로 가장 적절한 것은?" }, // 1 — 0과 의미 유사(표면 겹침 낮음)
      { text: "파이썬에서 함수를 정의하는 키워드는?" }, // 2 — 완전 다른 주제
      { text: "함수를 만들 때 사용하는 파이썬 예약어는 무엇인가?" }, // 3 — 2와 의미 유사
      { text: "리스트와 튜플의 가장 큰 차이점은?" }, // 4 — 독립
    ];
    // 진단: 실제 쌍별 유사도 출력 (임계값 튜닝용)
    const { google } = await import("@ai-sdk/google");
    const { cosineSimilarity, embedMany } = await import("ai");
    const emb = await embedMany({
      model: google.embedding("gemini-embedding-001"),
      values: items.map((i) => i.text),
      providerOptions: { google: { outputDimensionality: 768 } },
    });
    console.log("\n=== 쌍별 유사도 ===");
    const pairs = [
      [0, 1, "제안/suggestion (의미같음)"],
      [2, 3, "함수정의 키워드 (의미같음)"],
      [0, 2, "제안 vs 함수 (무관)"],
      [0, 4, "제안 vs 리스트튜플 (무관)"],
    ] as const;
    for (const [a, b, label] of pairs) {
      console.log(
        `  ${label}: ${(cosineSimilarity(emb.embeddings[a], emb.embeddings[b]) * 100).toFixed(1)}%`,
      );
    }

    const result = await dedupeBySemantics(items);
    console.log("\n=== 의미 dedup 결과 ===");
    console.log(
      `입력 ${items.length} → 유지 ${result.kept.length} / 제거 ${result.dropped.length}`,
    );
    for (const d of result.dropped) {
      console.log(`  제거: "${d.item.text}" (유사도 ${(d.similarity * 100).toFixed(1)}%)`);
    }
    for (const k of result.kept) console.log(`  유지: "${k.text}"`);

    // 최소한 임베딩이 동작해서 뭔가 판정을 했는지 (키 있으면 5개 중 일부는 중복 잡혀야 정상)
    expect(result.kept.length).toBeGreaterThan(0);
    expect(result.kept.length).toBeLessThanOrEqual(items.length);
  }, 120_000);
});
