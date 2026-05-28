/**
 * 가벼운 풀텍스트 RAG — 임베딩·DB 없이 sub-second로 동작.
 *
 * 동기:
 *   - 자료 본문은 이미 thread.material_full_text로 캐시되어 LLM에 전달됨.
 *   - 본문이 길면(20K+ 토큰) 모델이 정답 부분을 놓치는 경우가 보고됨.
 *   - 사용자 질문에 가장 관련 깊은 청크 1~3개를 "관련 발췌"로 명시 노출하면
 *     모델 attention을 그쪽으로 끌어 정답 인용률·정확도가 올라간다.
 *   - 캐시 안 깨짐: materialBlock(전체 본문)은 그대로 두고 dynamicContext에 hint만 추가.
 *
 * 방법:
 *   1) 본문을 chunk(약 800~1200자, 자연 단락 우선)로 자름.
 *   2) 사용자 질문에서 핵심 토큰 추출 (한국어 어절·영어 단어 길이 2+).
 *   3) 각 chunk를 핵심 토큰 매칭으로 점수 매김 (TF: 빈도 + 길이 가중 + 인접 보너스).
 *   4) 상위 N개를 자르지 않고 그대로 반환.
 *
 * 한계:
 *   - 임베딩이 아니라 어휘 매칭이라 동의어·paraphrase를 놓침. 그래도 한국어 자료에서
 *     키워드 매칭은 의외로 강함 (강의자료는 같은 용어가 반복됨).
 *   - 페이지 메타가 없어 "p.N" 인용 못 함 — 우리는 어차피 페이지 단위 추출이 아닌 자유 chunk.
 *
 * 비용: 모두 클라이언트 메모리 연산. O(chunks × tokens). 50쪽 자료 기준 ~10ms.
 */

export interface RelevantChunk {
  /** 청크 텍스트 — 자르지 않음 */
  text: string;
  /** 본문 전체에서의 시작 인덱스 (char) — 디버깅용 */
  startIndex: number;
  /** 매칭 점수 — 정렬 후 디버깅용 */
  score: number;
}

const MIN_TOKEN_LEN = 2;
const MAX_TOKENS_FROM_QUESTION = 12;
const TARGET_CHUNK_CHARS = 1000;
const MIN_CHUNK_CHARS = 200;

/**
 * 한국어 조사 접미사 — 어절 끝에서 한 번만 제거하면 substring 매칭률이 크게 오른다.
 * "경사하강법이" → "경사하강법", "활성화함수는" → "활성화함수".
 *
 * 형태소 분석기 없이는 모호한 케이스도 있지만(예: "회의"는 그 자체로 명사) 그건 점수 단계에서
 * chunk에 더 적합한 매칭이 빈도로 우위를 잡으니 큰 문제 아님.
 *
 * 긴 접미사부터 매칭 시도 (예: "에서는" → "에는" 같은 case에서 잘못 자르지 않게).
 */
const KOREAN_PARTICLES = [
  "에서는",
  "에서도",
  "으로도",
  "이라고",
  "라고도",
  "에게서",
  "한테서",
  "께서는",
  "이라는",
  "처럼은",
  "마다는",
  "에게는",
  "께서",
  "에게",
  "한테",
  "에서",
  "으로",
  "라고",
  "이나",
  "이며",
  "이다",
  "이고",
  "에는",
  "에도",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "의",
  "도",
  "만",
  "에",
  "와",
  "과",
  "께",
  "야",
];

function stripKoreanParticles(token: string): string {
  for (const p of KOREAN_PARTICLES) {
    if (token.length > p.length + 1 && token.endsWith(p)) {
      return token.slice(0, -p.length);
    }
  }
  return token;
}

/**
 * 질문에서 핵심 토큰 추출.
 * - 한국어 어절(공백 단위) + 영어 단어
 * - 한국어 조사 접미사 제거 ("경사하강법이" → "경사하강법")
 * - 너무 짧은 토큰(<2자) 제외 — "가" "는" 같은 조사 매칭 노이즈
 * - 최대 N개 — 너무 많으면 무관한 chunk가 점수 받음
 */
export function tokenizeQuestion(question: string): string[] {
  const cleaned = question
    .replace(/[?!.,;:()[\]{}"'`~。·、…—–-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  const raw = cleaned.split(" ");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rawToken of raw) {
    if (rawToken.length < MIN_TOKEN_LEN) continue;
    // 1) 한국어 조사 떼어내기 (substring 매칭률 ↑)
    // 2) 소문자화 (영어 대소문자 정규화)
    const normalized = stripKoreanParticles(rawToken).toLowerCase();
    if (normalized.length < MIN_TOKEN_LEN) continue;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
    if (out.length >= MAX_TOKENS_FROM_QUESTION) break;
  }
  return out;
}

/**
 * 본문을 청크로 분할. 단락 경계 우선(\n\n), 부족하면 문장 경계(. 또는 다.), 그래도 부족하면 글자 수.
 * 청크가 너무 짧으면 다음 청크와 합침.
 */
export function chunkMaterial(material: string): { text: string; startIndex: number }[] {
  if (material.length === 0) return [];

  // 1차: 빈 줄 기준 분할 (단락)
  const paragraphs: { text: string; startIndex: number }[] = [];
  const paraRe = /\n\s*\n/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  paraRe.lastIndex = 0;
  while (true) {
    m = paraRe.exec(material);
    if (!m) break;
    const end = m.index;
    const text = material.slice(lastIdx, end);
    if (text.trim().length > 0) paragraphs.push({ text, startIndex: lastIdx });
    lastIdx = end + m[0].length;
  }
  const tail = material.slice(lastIdx);
  if (tail.trim().length > 0) paragraphs.push({ text: tail, startIndex: lastIdx });

  // 2차: 너무 큰 단락은 ~1000자 단위로 더 쪼개고, 너무 작은 단락은 다음과 합침.
  const chunks: { text: string; startIndex: number }[] = [];
  for (const p of paragraphs) {
    if (p.text.length <= TARGET_CHUNK_CHARS) {
      chunks.push(p);
      continue;
    }
    // 긴 단락 — 문장 경계로 다시 자름. ko: "다." "요." "음." en: ". "
    const sentRe = /(?<=[.。!?]|다\.\s|요\.\s|음\.\s|니다\.\s)\s+/;
    const sentences = p.text.split(sentRe);
    let cursor = p.startIndex;
    let buf = "";
    let bufStart = cursor;
    for (const s of sentences) {
      if (!s) continue;
      if (buf.length + s.length > TARGET_CHUNK_CHARS && buf.length > 0) {
        chunks.push({ text: buf, startIndex: bufStart });
        buf = s;
        bufStart = cursor;
      } else {
        buf = buf ? `${buf} ${s}` : s;
      }
      cursor += s.length + 1;
    }
    if (buf.length > 0) chunks.push({ text: buf, startIndex: bufStart });
  }

  // 3차: 짧은 청크 병합 — 자료 전체가 한 청크 미만이면 의미 없이 합쳐버려
  // 단락 단위 발췌가 무력해진다. 단락 그대로 둠 (extractRelevantChunks가 빈 배열 반환).
  if (material.length < TARGET_CHUNK_CHARS) {
    return chunks;
  }
  const merged: { text: string; startIndex: number }[] = [];
  for (const c of chunks) {
    const last = merged[merged.length - 1];
    if (last && last.text.length < MIN_CHUNK_CHARS) {
      last.text = `${last.text}\n\n${c.text}`;
    } else {
      merged.push({ ...c });
    }
  }
  return merged;
}

/**
 * chunk 점수 — 단순 TF 기반.
 *   - 한 토큰이 chunk에 N번 등장하면 +N
 *   - 긴 토큰(4자+)은 가중치 1.5 — 더 의미 있는 키워드
 *   - 인접 매칭 보너스: 두 토큰이 같은 chunk 내 20자 이내면 +0.5
 *
 * chunk가 너무 길면 분모로 정규화 X — 자료에 따라 길고 의미 깊은 청크가 정답일 수 있음.
 * 대신 TARGET_CHUNK_CHARS로 청크 크기 미리 정해 길이 분산을 줄임.
 */
export function scoreChunk(chunkText: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const lower = chunkText.toLowerCase();
  let score = 0;
  const positions = new Map<string, number[]>();
  for (const token of tokens) {
    // 한국어는 3자 정도면 충분히 의미 있는 키워드 ("활성화", "신경망", "회귀"). 영어는 보통 더 김.
    const weight = token.length >= 3 ? 1.5 : 1;
    let from = 0;
    const found: number[] = [];
    while (true) {
      const idx = lower.indexOf(token, from);
      if (idx === -1) break;
      found.push(idx);
      from = idx + token.length;
    }
    if (found.length > 0) {
      score += found.length * weight;
      positions.set(token, found);
    }
  }
  // 인접 보너스
  const all = Array.from(positions.values())
    .flat()
    .sort((a, b) => a - b);
  for (let i = 1; i < all.length; i++) {
    if (all[i] - all[i - 1] <= 20) score += 0.5;
  }
  return score;
}

export interface ExtractOptions {
  /** 반환할 최대 청크 수 (기본 3) */
  topN?: number;
  /** 점수 0인 청크는 무조건 제외 (기본 true) */
  excludeZero?: boolean;
}

/**
 * 사용자 질문 → 본문에서 가장 관련 깊은 청크 N개.
 *
 * 빈 결과 케이스:
 *   - 본문이 짧으면 ([] 반환, 호출자가 hint 생략)
 *   - 토큰 0개거나 어떤 청크도 매칭 안 되면 ([])
 *
 * 호출자는 결과가 비어있으면 dynamicContext에 hint 섹션 자체를 추가하지 않으면 됨.
 */
export function extractRelevantChunks(
  material: string,
  question: string,
  opts: ExtractOptions = {},
): RelevantChunk[] {
  const topN = opts.topN ?? 3;
  const excludeZero = opts.excludeZero ?? true;

  // 자료가 한 청크보다도 짧으면 발췌가 무의미 — 전체가 어차피 모델 컨텍스트에 있음.
  if (material.length < TARGET_CHUNK_CHARS) return [];

  const tokens = tokenizeQuestion(question);
  if (tokens.length === 0) return [];

  const chunks = chunkMaterial(material);
  const scored: RelevantChunk[] = chunks.map((c) => ({
    text: c.text,
    startIndex: c.startIndex,
    score: scoreChunk(c.text, tokens),
  }));

  let ranked = scored.sort((a, b) => b.score - a.score);
  if (excludeZero) ranked = ranked.filter((r) => r.score > 0);
  return ranked.slice(0, topN);
}

/**
 * 청크들을 prompt에 박을 텍스트 블록으로 포맷.
 * "## 관련 발췌" 헤더 + 각 청크 사이 구분선.
 */
export function formatChunksAsHint(chunks: RelevantChunk[]): string {
  if (chunks.length === 0) return "";
  const blocks = chunks.map((c, i) => `### 발췌 ${i + 1}\n${c.text.trim()}`);
  return [
    "## 관련 발췌 (자료에서 사용자 질문에 가까운 부분)",
    "위에 자료 본문 전체가 있지만, 다음 부분이 특히 사용자 질문과 관련 깊다. 답할 때 이 부분을 우선 인용.",
    "",
    blocks.join("\n\n---\n\n"),
  ].join("\n");
}
