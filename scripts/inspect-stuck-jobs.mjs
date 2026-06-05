// stuck job 진단 — pending/running으로 오래 멈춘 job을 찾는다. (읽기 전용)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// .env.local 직접 파싱 (dotenv 의존성 없이)
const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: active, error } = await supabase
  .from("jobs")
  .select("id, owner_id, material_id, tool, status, error_message, created_at, started_at, finished_at")
  .in("status", ["pending", "running"])
  .order("created_at", { ascending: false });

if (error) {
  console.error("조회 실패:", error.message);
  process.exit(1);
}

console.log(`\n=== active(pending/running) job ${active.length}개 ===`);
const now = Date.now();
for (const j of active) {
  const ageMin = Math.round((now - new Date(j.created_at).getTime()) / 60000);
  const stuck = ageMin > 10 ? "  ⚠️ STUCK" : "";
  console.log(
    `[${j.status}] tool=${j.tool} mat=${j.material_id?.slice(0, 8) ?? "NULL"} age=${ageMin}분${stuck}  (${j.id.slice(0, 8)})`,
  );
}

// 9과 관련 자료 찾기
const { data: mats } = await supabase
  .from("materials")
  .select("id, title, full_text")
  .ilike("title", "%9과%");
console.log(`\n=== 제목에 "9과" 들어간 자료 ${mats?.length ?? 0}개 ===`);
for (const m of mats ?? []) {
  console.log(`mat=${m.id.slice(0, 8)} "${m.title}" full_text=${m.full_text?.length ?? 0}자`);
  // 이 자료의 모든 job
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, tool, status, error_message, created_at")
    .eq("material_id", m.id)
    .order("created_at", { ascending: false });
  for (const j of jobs ?? []) {
    const ageMin = Math.round((now - new Date(j.created_at).getTime()) / 60000);
    console.log(
      `    └ [${j.status}] ${j.tool} age=${ageMin}분 ${j.error_message ? `err="${j.error_message.slice(0, 60)}"` : ""}`,
    );
  }
}
