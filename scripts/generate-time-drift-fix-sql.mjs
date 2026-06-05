// 오염 이벤트 교정 SQL 생성 — 읽기 전용 조회 후 SQL 파일만 출력. DB 변경 X.
//
// 진단(diagnose-event-time-drift.mjs)과 동일한 판별로 오염 id를 모으고,
// 그 id들만 -9시간 하는 UPDATE SQL을 만든다. schedule 대조로 판별하므로
// 정상 데이터(00:00Z)는 대상에서 제외된다.
//
// 안전장치:
//   - WHERE id IN (...) 으로 정확한 오염 id만. 패턴 기반 일괄 X.
//   - 사전 검증 SELECT + BEGIN/COMMIT 주석으로 사용자가 단계 실행 가능.
//   - 출력 SQL을 사용자가 Supabase SQL Editor에서 직접 실행 (CLAUDE.md §6).

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

function kstHHMM(iso) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  let h = "00";
  let m = "00";
  for (const p of parts) {
    if (p.type === "hour") h = String(Number(p.value) % 24).padStart(2, "0");
    else if (p.type === "minute") m = p.value;
  }
  return `${h}:${m}`;
}

function parseScheduleStarts(schedule) {
  const items = Array.isArray(schedule) ? schedule : typeof schedule === "string" ? [schedule] : [];
  const out = [];
  for (const item of items) {
    if (typeof item !== "string") continue;
    const first = item.match(/\d{1,2}:\d{2}/);
    if (first) {
      const [h, m] = first[0].split(":");
      out.push(`${h.padStart(2, "0")}:${m}`);
    }
  }
  return out;
}

const { data: events, error } = await sb
  .from("events")
  .select("id, starts_at, courses(schedule)")
  .eq("kind", "class");
if (error) {
  console.error("조회 실패:", error.message);
  process.exit(1);
}

const pollutedIds = [];
for (const e of events) {
  const kst = kstHHMM(e.starts_at);
  const starts = parseScheduleStarts(e.courses?.schedule);
  if (starts.length === 0) continue;
  if (starts.includes(kst)) continue; // 정상
  const [kh, km] = kst.split(":").map(Number);
  const shifted = `${String((kh - 9 + 24) % 24).padStart(2, "0")}:${String(km).padStart(2, "0")}`;
  if (starts.includes(shifted)) pollutedIds.push(e.id); // 오염
}

const idList = pollutedIds.map((id) => `  '${id}'`).join(",\n");
const sql = `-- 일정 시각 9시간 밀림(naive 저장) 교정 — class 이벤트 ${pollutedIds.length}건
-- 생성: 진단 스크립트(schedule 대조)로 판별한 오염 id만 대상. 정상 데이터는 미포함.
-- 실행: Supabase SQL Editor에서 단계별로. (CLAUDE.md §6 — DB 변경은 사용자가 직접)

-- 1) 교정 전 확인 — 이 id들의 현재 시각 (KST로 18:00류여야 정상)
SELECT id, title, starts_at, (starts_at AT TIME ZONE 'Asia/Seoul') AS kst_now
FROM events
WHERE id IN (
${idList}
)
ORDER BY starts_at
LIMIT 20;

-- 2) 교정 실행 — starts_at·ends_at에서 9시간 빼기. 트랜잭션으로 감싸 안전하게.
BEGIN;

UPDATE events
SET starts_at = starts_at - interval '9 hours',
    ends_at   = CASE WHEN ends_at IS NOT NULL THEN ends_at - interval '9 hours' ELSE NULL END
WHERE id IN (
${idList}
);

-- 3) 교정 후 확인 — kst_now가 강의 실제 시각(09:00류)이면 성공. 틀리면 ROLLBACK.
SELECT id, title, starts_at, (starts_at AT TIME ZONE 'Asia/Seoul') AS kst_now
FROM events
WHERE id IN (
${idList}
)
ORDER BY starts_at
LIMIT 20;

-- 결과가 맞으면 COMMIT; 아니면 ROLLBACK;
-- COMMIT;
`;

const outPath = "scripts/fix-time-drift.sql";
writeFileSync(outPath, sql);
console.log(`오염 ${pollutedIds.length}건 → 교정 SQL 작성: ${outPath}`);
console.log("Supabase SQL Editor에서 1)확인 → 2)BEGIN+UPDATE → 3)확인 → COMMIT 순으로 실행.");
