import { readFile } from "node:fs/promises";
import path from "node:path";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { isAdminUserId } from "@/lib/auth/admin";
import { MODELS, modelInstance } from "@/lib/claude";
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

interface Cluster {
  title: string;
  severity: "high" | "mid" | "low";
  feedbackIds: string[];
  suspectedPromptSection: string;
  suggestedFix: string;
}

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

  const admin = getAdminSupabase() as unknown as {
    from: (table: string) => any;
  };
  const { data: rows, error } = await admin
    .from("feedback")
    .select("id, target_type, target_id, rating, category, body, generation_id, created_at")
    .in("id", parsed.data.ids);

  if (error || !rows || rows.length === 0) {
    return NextResponse.json({ error: "피드백 조회 실패" }, { status: 500 });
  }

  type Row = {
    id: string;
    target_type: string;
    target_id: string;
    rating: number;
    category: string;
    body: string | null;
    generation_id: string | null;
    created_at: string;
  };
  const typedRows = rows as Row[];

  const byType = new Map<string, Row[]>();
  for (const r of typedRows) {
    const arr = byType.get(r.target_type) ?? [];
    arr.push(r);
    byType.set(r.target_type, arr);
  }

  const clusters: Cluster[] = [];

  for (const [type, group] of byType) {
    const promptFile = PROMPT_FILES[type];
    let promptBody = "";
    if (promptFile) {
      try {
        promptBody = await readFile(path.join(process.cwd(), "src/prompts", promptFile), "utf-8");
      } catch {
        promptBody = "(프롬프트 파일 없음)";
      }
    }

    const feedbackText = group
      .map((r) => `- id=${r.id} ★${r.rating} category=${r.category}: ${r.body ?? "(본문 없음)"}`)
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

반드시 JSON으로만 답하세요. 다른 텍스트 X. 형식:
{
  "clusters": [
    {"title": "...", "severity": "high", "feedbackIds": ["..."], "suspectedPromptSection": "...", "suggestedFix": "..."}
  ]
}`;

    try {
      const result = await generateText({
        model: modelInstance(MODELS.haiku),
        messages: [{ role: "user", content: userMsg }],
        maxOutputTokens: 4000,
      });
      const match = result.text.match(/\{[\s\S]*\}/);
      if (match) {
        const obj = JSON.parse(match[0]);
        if (Array.isArray(obj.clusters)) {
          clusters.push(...obj.clusters);
        }
      }
    } catch (err) {
      console.error(`[analyze] ${type} 실패`, err);
    }
  }

  return NextResponse.json({ clusters });
}
