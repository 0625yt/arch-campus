import { NextResponse } from "next/server";
import { z } from "zod";
import { tryGetOwnerId } from "@/lib/auth";
import { generate, estimateCost } from "@/lib/claude";
import { loadPrompt } from "@/lib/prompts";

export const runtime = "nodejs";

const ReqBody = z
  .object({
    text: z.string().min(1).max(2000),
  })
  .strict();

const DraftSchema = z.object({
  events: z
    .array(
      z.object({
        title: z.string().min(1).max(80),
        kind: z.enum(["exam", "assignment", "presentation", "etc"]),
        starts_at: z.string().datetime({ offset: true }),
        ends_at: z.string().datetime({ offset: true }).nullable(),
        all_day: z.boolean(),
        weight_percent: z.number().min(0).max(100).nullable(),
        notes: z.string().max(2000).nullable(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(20),
});

type DraftEvent = z.infer<typeof DraftSchema>["events"][number];

interface OkResponse {
  ok: true;
  events: DraftEvent[];
  modelId: string;
}

interface ErrResponse {
  ok: false;
  error: string;
}

export async function POST(req: Request): Promise<NextResponse<OkResponse | ErrResponse>> {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) {
    return NextResponse.json({ ok: false, error: "로그인이 필요해요" }, { status: 401 });
  }

  let body: z.infer<typeof ReqBody>;
  try {
    body = ReqBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `입력 검증 실패: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 400 },
    );
  }

  // today를 모델에 명시. "내일·다음 주" 같은 상대 표현 절대화에 필요.
  const today = new Date();
  const todayKst = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  }).format(today);

  let result;
  try {
    result = await generate({
      tool: "event-parse",
      rulePrompt: loadPrompt("event-parse"),
      dynamicContext: `오늘은 ${todayKst} (KST, UTC+09:00).`,
      userInput: body.text,
      maxTokens: 1500,
      temperature: 0.2,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `AI 호출 실패: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 502 },
    );
  }

  // 모델이 ```json 펜스를 가끔 붙임. 떼고 파싱.
  const cleaned = result.text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  let parsed: z.infer<typeof DraftSchema>;
  try {
    const json = JSON.parse(cleaned);
    parsed = DraftSchema.parse(json);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: `AI 응답 해석 실패: ${e instanceof Error ? e.message : "unknown"}`,
      },
      { status: 502 },
    );
  }

  // 비용 로깅. 적자 추적용 — 실패해도 응답엔 영향 X.
  try {
    const cost = estimateCost(result.usage, result.modelId);
    console.log(
      `[event-parse] owner=${ownerId.slice(0, 8)} events=${parsed.events.length} cost=$${cost.toFixed(5)} model=${result.modelId}`,
    );
  } catch {
    /* noop */
  }

  return NextResponse.json({ ok: true, events: parsed.events, modelId: result.modelId });
}
