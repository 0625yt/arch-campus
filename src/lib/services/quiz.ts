import "server-only";
import { generate, estimateCost } from "@/lib/claude";
import { classifyMaterial, classificationToContext, type Classification } from "@/lib/classify-material";
import { loadPrompt } from "@/lib/prompts";
import { parseModelJson, QuizOutput, type QuizOutputT } from "@/lib/schemas";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { breakdown } from "@/lib/tokens";

/**
 * Quiz 서비스 — 신규 업로드와 기존 자료 재실행 라우트가 공유.
 *
 * 책임 (4-Layer 청사진):
 *   Storage (호출자 담당) → Parse (호출자 담당)
 *   → Classify (이 모듈)
 *   → Generate (이 모듈)
 *   → Validate (Zod, 이 모듈)
 *   → Persist (quizzes·generations, 이 모듈)
 *
 * 비용 가드:
 *   - Sonnet 4.6 호출 1회 (~$0.03/문제5개). maxTokens 8192 (10문제 가정)
 *   - 분류기 Haiku 호출 1회 (~$0.0001)
 *   - 본문 60자 미만이면 분류기 스킵
 */

export type Difficulty = "쉬움" | "보통" | "어려움";

export interface QuizGenerateInput {
  ownerId: string;
  materialId: string;
  courseId: string | null;
  title: string;
  type: string;
  fullText: string;
  sanitizedText: string;
  pageCount: number | null;
  parserWarnings: string[];
  difficulty: Difficulty;
  requestedCount: number;
}

export type QuizGenerateResult =
  | {
      ok: true;
      quizId: string;
      quiz: Extract<QuizOutputT, { rejected?: false | undefined; questions: unknown }>;
      modelId: string;
      usage: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheCreationTokens: number;
      };
      costUsd: number;
      tokenBudget: ReturnType<typeof breakdown>;
    }
  | { ok: false; status: 422 | 502 | 500; error: string };

export async function runQuizGeneration(input: QuizGenerateInput): Promise<QuizGenerateResult> {
  const isMetadataOnly = !input.sanitizedText || input.sanitizedText.trim().length < 60;

  let classification: Classification | null = null;
  if (!isMetadataOnly) {
    classification = await classifyMaterial({
      title: input.title,
      type: input.type,
      fullText: input.sanitizedText,
      pageCount: input.pageCount ?? undefined,
      difficulty: input.difficulty,
    });
  }

  const rulePrompt = loadPrompt("quiz");
  const dynamicContext = buildDynamicContext({
    title: input.title,
    type: input.type,
    difficulty: input.difficulty,
    requestedCount: input.requestedCount,
    pageCount: input.pageCount ?? undefined,
    isMetadataOnly,
    parserWarnings: input.parserWarnings,
    classification,
    fullText: input.sanitizedText,
  });
  if (process.env.NODE_ENV !== "production") {
    console.log("[quiz] dynamicContext 첫 1500자:\n" + dynamicContext.slice(0, 1500));
  }

  const tokenBudget = breakdown({
    rule: rulePrompt,
    dynamic: dynamicContext,
    user: input.sanitizedText,
  });

  let result: Awaited<ReturnType<typeof generate>>;
  try {
    result = await generate({
      tool: "quiz",
      rulePrompt,
      dynamicContext,
      userInput:
        input.sanitizedText.trim().length > 0
          ? input.sanitizedText.slice(0, 60_000)
          : `[본문 자동 추출 실패 — 파일명 ${input.title} · 종류 ${input.type}]`,
      maxTokens: 8192,
      temperature: 0.4,
    });
  } catch (e) {
    await logGeneration({
      ownerId: input.ownerId,
      materialId: input.materialId,
      modelId: "claude-sonnet-4-6",
      status: "error",
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, status: 502, error: "AI 호출 실패" };
  }

  let parsedQuiz: QuizOutputT;
  try {
    parsedQuiz = parseModelJson(QuizOutput, result.text);
  } catch (e) {
    await logGeneration({
      ownerId: input.ownerId,
      materialId: input.materialId,
      modelId: result.modelId,
      usage: result.usage,
      cost: estimateCost(result.usage, result.modelId),
      status: "error",
      errorMessage: `Zod 검증 실패: ${e instanceof Error ? e.message : String(e)}`,
      payload: { rawText: result.text.slice(0, 4000) },
    });
    return { ok: false, status: 502, error: "AI 출력이 형식에 안 맞아요. 다시 시도해주세요." };
  }

  if (parsedQuiz.rejected) {
    return { ok: false, status: 422, error: parsedQuiz.reason };
  }

  // quizzes 저장 — owner_id 강제, RLS 정책과 같은 키
  const admin = getAdminSupabase();
  const costUsd = estimateCost(result.usage, result.modelId);
  const { data: quizRow, error: quizErr } = await admin
    .from("quizzes")
    .insert({
      owner_id: input.ownerId,
      material_id: input.materialId,
      course_id: input.courseId,
      title: input.title,
      difficulty: input.difficulty,
      question_count: parsedQuiz.questions.length,
      questions: parsedQuiz.questions,
      watermark: parsedQuiz.watermark,
      model_id: result.modelId,
    })
    .select("id")
    .single();

  if (quizErr || !quizRow) {
    return {
      ok: false,
      status: 500,
      error: `quizzes 저장 실패: ${quizErr?.message ?? "unknown"}`,
    };
  }

  await logGeneration({
    ownerId: input.ownerId,
    materialId: input.materialId,
    modelId: result.modelId,
    usage: result.usage,
    cost: costUsd,
    status: "ok",
    payload: { quizId: quizRow.id, questionCount: parsedQuiz.questions.length },
  });

  return {
    ok: true,
    quizId: quizRow.id,
    quiz: parsedQuiz,
    modelId: result.modelId,
    usage: result.usage,
    costUsd,
    tokenBudget,
  };
}

function buildDynamicContext(meta: {
  title: string;
  type: string;
  difficulty: Difficulty;
  requestedCount: number;
  pageCount?: number;
  isMetadataOnly: boolean;
  parserWarnings: string[];
  classification: Classification | null;
  fullText: string;
}): string {
  const detected = detectForeignLanguage(meta.fullText);

  const lines: string[] = [];

  if (detected && meta.difficulty === "쉬움") {
    lines.push(
      "═══ 언어 강제 (최우선 — 어김 X) ═══",
      `자료가 ${detected} 어학 자료이고 사용자가 "쉬움"을 선택했어요. 한국 대학생 1학년이 단어 의미 파악하는 수준으로 출제해요.`,
      "",
      "- stem(문제 본문): **반드시 한국어**. 예: \"다음 중 'Suggestion(제안)'을 의미하는 것은?\"",
      `- choices(보기 4개): 자료의 ${detected} 단어·정의·예문 그대로. 번역 X.`,
      "- explanation: **한국어**. 왜 정답인지 + 왜 다른 보기가 오답인지 짧게.",
      `- evidence: 자료 ${detected} 원문 그대로 substring.`,
      `- ⚠ stem을 ${detected}로 쓰면 즉시 검증 실패. 어떤 이유로도 stem 영어 X.`,
      "",
    );
  } else if (detected && meta.difficulty === "보통") {
    lines.push(
      "═══ 언어 강제 ═══",
      `자료가 ${detected} 어학 자료, 난이도 "보통".`,
      `- stem: 자료 ${detected} 문장·예문 그대로. 빈칸·문법 비교.`,
      `- choices: ${detected} 4개. 한국어 보조 설명 괄호로 짧게만.`,
      "- explanation: 한국어 위주 + 원어 키워드.",
      "",
    );
  } else if (detected && meta.difficulty === "어려움") {
    lines.push(
      "═══ 언어 강제 ═══",
      `자료가 ${detected} 어학 자료, 난이도 "어려움". 100% ${detected} (stem·choices·explanation 전부).`,
      "",
    );
  }

  lines.push(
    `자료 메타:`,
    `- 제목: ${meta.title}`,
    `- 종류: ${meta.type}`,
    `- 요청 난이도: ${meta.difficulty}`,
    `- 요청 문제 개수: ${meta.requestedCount}`,
  );
  if (meta.pageCount) lines.push(`- 분량: ${meta.pageCount}쪽`);
  if (meta.parserWarnings.length) lines.push(`- 파서 경고: ${meta.parserWarnings.join(", ")}`);
  if (meta.classification) {
    lines.push("", classificationToContext(meta.classification));
  }

  if (meta.isMetadataOnly) {
    lines.push(
      "",
      "⚠ 본문 텍스트가 충분하지 않아요. 그래도 거절하지 말고:",
      "- 자료 종류·제목 기준으로 일반적인 학습 점검 문제 만들어주세요",
      "- evidence는 비울 수 있음 (메타만이라 substring 불가)",
      "- reason 없이 questions 채워서 응답",
    );
  }

  return lines.join("\n");
}

function detectForeignLanguage(text: string): "영어" | "중국어" | "일본어" | null {
  if (!text || text.length < 100) return null;
  const sample = text.slice(0, 5000);

  const hangul = sample.match(/[ㄱ-ㆎ가-힣]/g)?.length ?? 0;
  const hiragana = sample.match(/[぀-ゟ]/g)?.length ?? 0;
  const katakana = sample.match(/[゠-ヿ]/g)?.length ?? 0;
  const hanzi = sample.match(/[一-鿿]/g)?.length ?? 0;
  const ascii = sample.match(/[A-Za-z]/g)?.length ?? 0;
  const total = hangul + hiragana + katakana + hanzi + ascii;
  if (total < 50) return null;
  if (hangul / total > 0.3) return null;
  if (hiragana + katakana > total * 0.1) return "일본어";
  if (hanzi > total * 0.3 && hiragana + katakana < total * 0.05) return "중국어";
  if (ascii > total * 0.5) return "영어";
  return null;
}

async function logGeneration(opts: {
  ownerId: string;
  materialId: string;
  modelId: string;
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number };
  cost?: number;
  status: "ok" | "rejected" | "error";
  errorMessage?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const admin = getAdminSupabase();
  const { error } = await admin.from("generations").insert({
    owner_id: opts.ownerId,
    material_id: opts.materialId,
    tool: "quiz",
    model_id: opts.modelId,
    input_tokens: opts.usage?.inputTokens ?? 0,
    output_tokens: opts.usage?.outputTokens ?? 0,
    cache_read_tokens: opts.usage?.cacheReadTokens ?? 0,
    cache_creation_tokens: opts.usage?.cacheCreationTokens ?? 0,
    cost_usd: opts.cost ?? 0,
    status: opts.status,
    error_message: opts.errorMessage ?? null,
    payload: opts.payload ?? {},
  });
  if (error) console.error("generations 기록 실패:", error.message);
}
