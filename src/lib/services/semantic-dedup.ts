import { google } from "@ai-sdk/google";
import { cosineSimilarity, embedMany } from "ai";

/**
 * 의미 기반 중복 제거 — 표면 문자열(fingerprint·n-gram)로 못 잡는 "글자는 다른데 뜻이 같은" 문제를 거른다.
 *
 * 배경: validate-quiz.ts의 dedup은 3-gram Jaccard(문자 겹침)만 본다. 그래서
 *   "제안을 뜻하는 단어는?" vs "suggestion의 의미로 옳은 것은?" 처럼
 *   글자 겹침은 낮지만 사실상 같은 문제를 통과시킨다. 이걸 임베딩 코사인 유사도로 잡는다.
 *
 * 구현: 이미 있는 도구만 사용(새 의존성 0).
 *   - @ai-sdk/google의 gemini-embedding-001 ($0.15/1M, 배치 $0.075). stem이 짧아 퀴즈당 ~$0.0001.
 *   - ai SDK의 embedMany(배치 1회 호출)로 속도·비용 최소화. cosineSimilarity 헬퍼 내장.
 *   - 768차원으로 truncate(Matryoshka) — 품질 손실 거의 없이 계산·전송 절감.
 *
 * Vercel serverless(icn1) 적합: 네이티브 바이너리·모델 파일 없이 순수 HTTP 임베딩 호출.
 * 키(GOOGLE_GENERATIVE_AI_API_KEY) 없으면 호출부에서 skip해 표면 dedup만으로 동작(폴백).
 */

const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIM = 768;

/**
 * 이 값 이상이면 의미 중복으로 판정. 실측(gemini-embedding-001, 768dim, 한국어 퀴즈 stem):
 *   - 의미 같은 쌍: 78~88% / 무관한 쌍: 45~52%.
 * 0.85는 "거의 같은 질문"(88%)은 잡고 무관(52%)은 확실히 통과시키는 보수적 컷.
 * 낮추면 애매한 중복(78%)도 잡지만 오탐 위험↑ — 실데이터로 재튜닝 대상.
 */
export const SEMANTIC_DUP_THRESHOLD = 0.85;

export interface SemanticDedupItem {
  /** 중복 판정 대상 텍스트 (보통 stem, 필요시 stem+정답 결합) */
  text: string;
}

export interface SemanticDedupResult<T> {
  kept: T[];
  /** 제거된 항목과 어떤 항목의 중복이었는지 */
  dropped: Array<{ item: T; duplicateOfIndex: number; similarity: number }>;
}

/**
 * items를 순서대로 훑으며, 앞서 kept된 것과 코사인 유사도가 임계 이상이면 중복으로 drop.
 * threshold를 낮추면 더 공격적으로 제거(오탐 위험↑).
 *
 * 임베딩 실패(키 없음·API 오류)면 전량 kept로 반환 — 표면 dedup은 이미 통과한 상태라 안전.
 */
export async function dedupeBySemantics<T extends SemanticDedupItem>(
  items: T[],
  threshold = SEMANTIC_DUP_THRESHOLD,
): Promise<SemanticDedupResult<T>> {
  if (items.length <= 1) return { kept: items, dropped: [] };
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return { kept: items, dropped: [] };
  }

  let embeddings: number[][];
  try {
    const res = await embedMany({
      model: google.embedding(EMBED_MODEL),
      values: items.map((i) => i.text),
      providerOptions: { google: { outputDimensionality: EMBED_DIM } },
    });
    embeddings = res.embeddings;
  } catch {
    // 임베딩 실패 시 표면 dedup 결과를 그대로 통과(의미 dedup만 skip).
    return { kept: items, dropped: [] };
  }

  const kept: T[] = [];
  const keptEmb: number[][] = [];
  const dropped: SemanticDedupResult<T>["dropped"] = [];

  for (let i = 0; i < items.length; i++) {
    let dupOf = -1;
    let maxSim = 0;
    for (let j = 0; j < keptEmb.length; j++) {
      const sim = cosineSimilarity(embeddings[i], keptEmb[j]);
      if (sim > maxSim) {
        maxSim = sim;
        dupOf = j;
      }
    }
    if (maxSim >= threshold && dupOf >= 0) {
      dropped.push({ item: items[i], duplicateOfIndex: dupOf, similarity: maxSim });
    } else {
      kept.push(items[i]);
      keptEmb.push(embeddings[i]);
    }
  }

  return { kept, dropped };
}

/**
 * 증분 의미 dedup — 이미 임베딩한 항목을 캐시로 재사용해 반복 파이프라인(청크·topup)에서
 * 같은 stem을 다시 임베딩하지 않는다. 캐시는 호출자가 소유(Map<text, number[]>).
 *
 * 새 항목만 embedMany로 1회 임베딩 → 캐시된 kept 벡터와 비교. 속도·비용 대폭 절감.
 * 반환된 keptEmbeddings로 다음 라운드에 다시 넘겨 누적한다.
 */
export async function dedupeBySemanticsCached<T extends SemanticDedupItem>(
  existing: Array<{ item: T; embedding: number[] }>,
  incoming: T[],
  threshold = SEMANTIC_DUP_THRESHOLD,
): Promise<{ kept: Array<{ item: T; embedding: number[] }>; dropped: T[] }> {
  if (incoming.length === 0) return { kept: existing, dropped: [] };
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return {
      kept: [...existing, ...incoming.map((item) => ({ item, embedding: [] }))],
      dropped: [],
    };
  }

  let newEmb: number[][];
  try {
    const res = await embedMany({
      model: google.embedding(EMBED_MODEL),
      values: incoming.map((i) => i.text),
      providerOptions: { google: { outputDimensionality: EMBED_DIM } },
    });
    newEmb = res.embeddings;
  } catch {
    return {
      kept: [...existing, ...incoming.map((item) => ({ item, embedding: [] }))],
      dropped: [],
    };
  }

  const kept = [...existing];
  const dropped: T[] = [];
  for (let i = 0; i < incoming.length; i++) {
    let maxSim = 0;
    for (const k of kept) {
      if (k.embedding.length === 0) continue;
      const sim = cosineSimilarity(newEmb[i], k.embedding);
      if (sim > maxSim) maxSim = sim;
    }
    if (maxSim >= threshold) dropped.push(incoming[i]);
    else kept.push({ item: incoming[i], embedding: newEmb[i] });
  }
  return { kept, dropped };
}
