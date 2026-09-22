// 한 퀴즈 안의 중복 문제 탐지 — stem 정규화 후 그룹핑. (읽기 전용)

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const quizId = process.argv[2];
const { data, error } = await sb
  .from("quizzes")
  .select("title, mode, question_count, created_at, questions")
  .eq("id", quizId)
  .maybeSingle();
if (error || !data) {
  console.error("조회 실패:", error?.message);
  process.exit(1);
}
const qs = Array.isArray(data.questions) ? data.questions : [];
console.log(
  `${data.title} — mode=${data.mode} count=${data.question_count} 실제=${qs.length} created=${data.created_at}\n`,
);

const norm = (s) =>
  (s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[「」『』(){}[\]（）【】.,!?~。、・·…：:;；]/g, "");
// stem 기준 그룹 + answer 라벨 같이
const byStem = new Map();
for (const q of qs) {
  const k = norm(q.stem);
  if (!byStem.has(k)) byStem.set(k, []);
  byStem.get(k).push(q);
}
let dupeGroups = 0,
  dupeItems = 0;
console.log("=== stem 완전 동일 그룹 ===");
for (const [, group] of byStem) {
  if (group.length > 1) {
    dupeGroups++;
    dupeItems += group.length;
    console.log(
      `  [${group.length}회] Q${group.map((g) => g.id).join(",")}  "${group[0].stem.slice(0, 50)}"  답=${group.map((g) => JSON.stringify(g.answer)).join("/")}`,
    );
  }
}
console.log(
  `\n완전중복: ${dupeGroups}그룹 ${dupeItems}문항 (유니크 stem ${byStem.size}/${qs.length})`,
);

// 유사(같은 단어를 묻는) — answer 기준 그룹핑도
const byAns = new Map();
for (const q of qs) {
  const k = norm(typeof q.answer === "string" ? q.answer : JSON.stringify(q.answer));
  if (!byAns.has(k)) byAns.set(k, []);
  byAns.get(k).push(q);
}
console.log("\n=== answer 동일 그룹 (다른 stem이라도 같은 답 반복) ===");
for (const [, group] of byAns) {
  if (group.length > 1)
    console.log(
      `  [${group.length}회] 답="${JSON.stringify(group[0].answer)}"  Q${group.map((g) => g.id).join(",")}`,
    );
}
