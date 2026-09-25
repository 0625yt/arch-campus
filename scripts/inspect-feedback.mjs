// 최근 피드백 조회 — 사용자가 남긴 피드백을 본다. (읽기 전용)

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await supabase
  .from("feedback")
  .select("id, owner_id, target_type, target_id, generation_id, rating, category, body, created_at")
  .order("created_at", { ascending: false })
  .limit(50);

if (error) {
  console.error("조회 실패:", error.message);
  process.exit(1);
}

console.log(`\n=== 최근 피드백 ${data.length}개 ===\n`);
const now = Date.now();
for (const f of data) {
  const ageMin = Math.round((now - new Date(f.created_at).getTime()) / 60000);
  const age =
    ageMin < 60
      ? `${ageMin}분 전`
      : ageMin < 1440
        ? `${Math.round(ageMin / 60)}시간 전`
        : `${Math.round(ageMin / 1440)}일 전`;
  const rate = f.rating === 1 ? "👍" : f.rating === -1 ? "👎" : `(${f.rating})`;
  console.log(`${rate} [${f.target_type}/${f.category}] ${age}`);
  if (f.body) console.log(`   "${f.body}"`);
  console.log(
    `   target=${f.target_id} owner=${f.owner_id?.slice(0, 8)} gen=${f.generation_id?.slice(0, 8) ?? "-"}`,
  );
  console.log("");
}

// 카테고리별 집계
const byCat = {};
for (const f of data) {
  const k = `${f.target_type}/${f.category}`;
  byCat[k] = (byCat[k] ?? 0) + 1;
}
console.log("=== 카테고리별 집계 ===");
for (const [k, n] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n.toString().padStart(3)}  ${k}`);
}
