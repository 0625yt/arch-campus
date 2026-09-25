// 특정 퀴즈의 실제 questions JSON 조회 — 피드백 대조용. (읽기 전용)

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// argv: quizId들 + 보고 싶은 Q번호(옵션). 없으면 피드백에서 나온 target들 기본.
const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error("usage: node inspect-quiz-questions.mjs <quizId>[:Q번호] ...");
  process.exit(1);
}

for (const t of targets) {
  const [quizId, qNumRaw] = t.split(":");
  const { data, error } = await supabase
    .from("quizzes")
    .select("id, title, mode, difficulty, question_count, questions")
    .eq("id", quizId)
    .maybeSingle();
  if (error || !data) {
    console.log(`\n### ${quizId} — 조회 실패: ${error?.message ?? "없음"}`);
    continue;
  }
  console.log(`\n\n══════════ ${data.title} ══════════`);
  console.log(
    `mode=${data.mode} difficulty=${data.difficulty} count=${data.question_count} id=${quizId}`,
  );
  const qs = Array.isArray(data.questions) ? data.questions : [];
  const wanted = qNumRaw ? Number(qNumRaw) : null; // 1-based
  for (const q of qs) {
    if (wanted && q.id !== wanted) continue;
    console.log(
      `\n── Q${q.id} [${q.kind ?? "multiple-choice"}] (${q.difficulty ?? "?"}) topic=${q.topic ?? "-"}`,
    );
    console.log(`stem: ${q.stem}`);
    if (q.choices) {
      for (const c of q.choices) console.log(`   ${c.key}. ${c.text}`);
    }
    console.log(`answer: ${JSON.stringify(q.answer)}`);
    if (q.explanation) console.log(`explanation: ${q.explanation}`);
    if (q.evidence) console.log(`evidence: ${q.evidence?.slice(0, 200)}`);
  }
}
