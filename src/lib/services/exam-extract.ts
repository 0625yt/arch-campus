import "server-only";
import { estimateCost, generate, getModelVendor } from "@/lib/claude";
import { loadPrompt } from "@/lib/prompts";
import {
  type ExamExtractedQuestionT,
  ExamExtractOutput,
  type ExamExtractOutputT,
  hasWatermark,
  parseModelJson,
} from "@/lib/schemas";
import { detectSubject, SUBJECT_LABEL } from "@/lib/subject-detector";
import { buildPlaybookSection } from "@/lib/subject-playbook";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { breakdown } from "@/lib/tokens";

type Json = Database["public"]["Tables"]["quizzes"]["Row"]["questions"];

/**
 * 기출문제 추출 서비스 — type=exam 자료에서 본문에 이미 있는 문제·정답·해설을 그대로 가져온다.
 *
 * 책임:
 *   - 자료 본문 → exam-extract 프롬프트 → Haiku 호출 → Zod 검증 → quizzes 저장
 *     (mode='extracted'로 박아 생성된 문제와 구분)
 *   - generations 기록 (tool='exam-extract')
 * 라우트의 책임:
 *   - 인증, 입력 파싱, 응답 매핑
 *
 * 비용 가드:
 *   - maxTokens 32000 (최대 100문제까지 잘리지 않게)
 *   - PDF 50쪽 초과 자료는 라우트에서 사전 거부 (Vision 토큰 폭주 방지)
 *
 * 치팅 라인 (CLAUDE.md §4):
 *   - "새 문제 생성" 절대 X — 프롬프트가 강하게 가드
 *   - 정답·해설은 본문에 있는 경우만 채움. 없으면 null
 *   - UI 게이트(B-6)가 사용자 답 입력 전까지 정답 노출 차단
 *   - 워터마크 필수 검증
 */

export type ExamExtractResult =
  | {
      ok: true;
      result: ExamExtractOutputT;
      modelId: string;
      usage: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheCreationTokens: number;
      };
      costUsd: number;
      tokenBudget: ReturnType<typeof breakdown>;
      /** 생성된 quizzes 행 id (extracted 모드). 풀이 페이지로 redirect할 때 사용. */
      quizId: string | null;
    }
  | {
      ok: false;
      stage: "ai" | "validation" | "db";
      error: string;
    };

export interface ExamExtractInput {
  ownerId: string;
  materialId: string;
  title: string;
  fullText: string;
  sanitizedText: string;
  pageCount: number | null;
}

export async function runExamExtract(input: ExamExtractInput): Promise<ExamExtractResult> {
  const rulePrompt = loadPrompt("exam-extract");
  const dynamicContext = buildDynamicContext({
    title: input.title,
    pageCount: input.pageCount ?? undefined,
    textLength: input.sanitizedText.length,
  });
  const tokenBudget = breakdown({
    rule: rulePrompt,
    dynamic: dynamicContext,
    user: input.sanitizedText,
  });

  // 본문이 너무 짧으면 거절 (기출이면 최소 몇 백자는 있어야 함)
  if (input.sanitizedText.trim().length < 100) {
    return {
      ok: false,
      stage: "validation",
      error:
        "자료 본문이 너무 짧아 기출 추출을 시작할 수 없어요. PDF가 이미지 위주라 텍스트 추출이 실패했을 수 있어요. 다른 자료를 올려주세요.",
    };
  }

  let result: Awaited<ReturnType<typeof generate>>;
  try {
    result = await generate({
      tool: "exam-extract",
      rulePrompt,
      dynamicContext,
      // 본문 cap — 2~3쪽에 100문제 박힌 기출도 본문 전체를 봐야 끝번호까지 안 빠진다.
      // 80K → 160K로 (Haiku·Gemini Flash 컨텍스트 여유 안). 입력이 잘려 뒷문제를 못 보던 문제 차단.
      userInput: input.sanitizedText.slice(0, 160_000),
      // 100문제 × (stem+보기+정답+해설+sourceQuote) ≈ 300~350토큰 → 최대 ~35K 출력.
      // 6144는 50문제도 못 담아 뒤가 잘렸음 → 32000으로. (Haiku 4.5·Gemini Flash 모두 수용)
      maxTokens: 32_000,
      temperature: 0.1, // 추출은 결정적이어야. 창의성 최소
      // 자료 본문 캐시 — 재시도·1h 내 재실행 시 cache read. Anthropic(Haiku) 경로에서 큰 입력 절감.
      cacheUserInput: true,
    });
  } catch (e) {
    await logGeneration({
      ownerId: input.ownerId,
      materialId: input.materialId,
      modelId: "claude-haiku-4-5",
      status: "error",
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return {
      ok: false,
      stage: "ai",
      error: "기출문제를 읽지 못했어요. 잠시 후 다시 시도해주세요.",
    };
  }

  // Zod 검증
  let extracted: ExamExtractOutputT;
  try {
    extracted = parseModelJson(ExamExtractOutput, result.text);
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
    return {
      ok: false,
      stage: "validation",
      error: "기출문제 형식이 맞지 않았어요. 다시 시도해주세요.",
    };
  }

  // 워터마크 정확성 검증 (CLAUDE.md §4 — 모델이 문구 변형/누락하면 검증 실패로 봄)
  if (!hasWatermark(extracted)) {
    await logGeneration({
      ownerId: input.ownerId,
      materialId: input.materialId,
      modelId: result.modelId,
      usage: result.usage,
      cost: estimateCost(result.usage, result.modelId),
      status: "error",
      errorMessage: "워터마크 누락 또는 변형",
      payload: { watermark: extracted.watermark },
    });
    return {
      ok: false,
      stage: "validation",
      error: "출력에 학습 보조 워터마크가 빠졌어요. 다시 시도해주세요.",
    };
  }

  // 거절된 경우 — quizzes 저장 X. 로그만 남기고 결과 반환.
  if ("rejected" in extracted && extracted.rejected === true) {
    await logGeneration({
      ownerId: input.ownerId,
      materialId: input.materialId,
      modelId: result.modelId,
      usage: result.usage,
      cost: estimateCost(result.usage, result.modelId),
      status: "rejected",
      errorMessage: extracted.reason,
      payload: { extracted },
    });
    return {
      ok: true,
      result: extracted,
      modelId: result.modelId,
      usage: result.usage,
      costUsd: estimateCost(result.usage, result.modelId),
      tokenBudget,
      quizId: null,
    };
  }

  // ✅ 추출 성공 — quizzes 테이블에 mode='extracted'로 저장
  // sourceQuote가 자료 full_text에 substring 매칭되는지 검증 (옵션·경고만 로그)
  const verifiedQuestions = verifyEvidence(extracted.questions, input.fullText);

  const admin = getAdminSupabase();
  const quizInsert = await admin
    .from("quizzes")
    .insert({
      owner_id: input.ownerId,
      material_id: input.materialId,
      title: `${input.title} — 기출 추출`,
      // mode 컬럼은 마이그레이션 0013에서 추가됨. 'extracted'로 박아 생성된 문제와 구분.
      // 마이그레이션 안 돌리면 column 없어 23502 발생 → 사용자에게 안내 필요.
      mode: "extracted",
      question_count: verifiedQuestions.length,
      questions: verifiedQuestions as unknown as Json,
      watermark: extracted.watermark,
      model_id: result.modelId,
    })
    .select("id")
    .single();

  if (quizInsert.error || !quizInsert.data) {
    await logGeneration({
      ownerId: input.ownerId,
      materialId: input.materialId,
      modelId: result.modelId,
      usage: result.usage,
      cost: estimateCost(result.usage, result.modelId),
      status: "error",
      errorMessage: `quizzes insert 실패: ${quizInsert.error?.message ?? "unknown"}`,
      payload: { extracted },
    });
    return {
      ok: false,
      stage: "db",
      error: `추출 결과 저장 실패: ${quizInsert.error?.message ?? "unknown"}`,
    };
  }

  const costUsd = estimateCost(result.usage, result.modelId);
  await logGeneration({
    ownerId: input.ownerId,
    materialId: input.materialId,
    modelId: result.modelId,
    usage: result.usage,
    cost: costUsd,
    status: "ok",
    payload: { questionCount: verifiedQuestions.length, quizId: quizInsert.data.id },
  });

  return {
    ok: true,
    result: extracted,
    modelId: result.modelId,
    usage: result.usage,
    costUsd,
    tokenBudget,
    quizId: quizInsert.data.id,
  };
}

/**
 * sourceQuote가 본문에 실제로 substring 매칭되는지 검증.
 * 매칭 안 되는 문제는 needsManualCheck=true로 표시 (AI가 본문에 없는 걸 가져왔을 가능성).
 */
function verifyEvidence(
  questions: ExamExtractedQuestionT[],
  fullText: string,
): ExamExtractedQuestionT[] {
  // full_text에서 공백·줄바꿈 정규화
  const haystack = fullText.replace(/\s+/g, " ");
  return questions.map((q) => {
    const needle = q.sourceQuote.replace(/\s+/g, " ").slice(0, 100); // 앞 100자만 검증
    const found = haystack.includes(needle);
    if (!found) {
      return { ...q, needsManualCheck: true };
    }
    return q;
  });
}

function buildDynamicContext(meta: {
  title: string;
  pageCount?: number;
  textLength: number;
}): string {
  const lines: string[] = ["자료 메타:", `- 제목: ${meta.title}`, `- 종류: exam (기출문제)`];
  if (meta.pageCount) lines.push(`- 분량: ${meta.pageCount}쪽`);
  lines.push(`- 본문 길이: ${meta.textLength}자`);
  lines.push(
    "",
    "이 자료는 학생이 type=exam으로 분류한 기출문제 PDF입니다.",
    "본문에서 문제·정답·해설을 그대로 추출하세요. 새로 만들지 마세요.",
  );

  // 과목 영역 — 자료 제목 기준 (exam은 classification을 안 돌림. 비용 절약)
  const subject = detectSubject({ materialTitle: meta.title });
  if (subject !== "default") {
    const section = buildPlaybookSection(subject, "examExtract");
    if (section) {
      lines.push("", `(영역: ${SUBJECT_LABEL[subject]})`, section);
    }
  }

  return lines.join("\n");
}

async function logGeneration(opts: {
  ownerId: string;
  materialId: string;
  modelId: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
  cost?: number;
  status: "ok" | "rejected" | "error";
  errorMessage?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const admin = getAdminSupabase();
  const { error } = await admin.from("generations").insert({
    owner_id: opts.ownerId,
    material_id: opts.materialId,
    tool: "exam-extract",
    model_id: opts.modelId,
    model_provider: getModelVendor(opts.modelId),
    input_tokens: opts.usage?.inputTokens ?? 0,
    output_tokens: opts.usage?.outputTokens ?? 0,
    cache_read_tokens: opts.usage?.cacheReadTokens ?? 0,
    cache_creation_tokens: opts.usage?.cacheCreationTokens ?? 0,
    cost_usd: opts.cost ?? 0,
    status: opts.status,
    error_message: opts.errorMessage ?? null,
    payload: opts.payload ?? {},
  });
  if (error) {
    console.error("generations 기록 실패:", error.message);
  }
}
