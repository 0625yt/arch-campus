// 일정 시각 오염(9시간 밀림) 진단 — 읽기 전용. 데이터 변경 없음.
//
// 배경: class 이벤트 starts_at이 두 종류로 섞여 있다.
//   정상: KST 09:00 → UTC 00:00Z (올바른 변환)
//   오염: KST 09:00 → UTC 09:00Z (KST 벽시계를 UTC 자리에 박은 naive)
// 오염 이벤트는 화면에서 KST 18:00으로 9시간 밀려 보인다.
//
// 판별 기준 (확실): course.schedule 원본 문자열("월 09:00~11:50")의 시각과,
//   event.starts_at을 KST로 변환한 시각을 비교.
//   - 일치 → 정상
//   - KST 변환값이 schedule보다 +9h → 오염(naive 저장)
//
// 출력: 오염/정상/판별불가 건수 + 오염 샘플 + owner·course 분포. SQL은 출력만, 실행 X.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

/** ISO → KST "HH:MM" (Intl part 직접, 환경 비의존). */
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

/**
 * course.schedule에서 시작 "HH:MM" 추출.
 * 실제 형식: JSON 배열 ["월 09:00-11:50", "수 13:00-14:50"]. (문자열일 수도 있어 양쪽 대응)
 * 각 항목의 첫 시각이 시작 시각.
 */
function parseScheduleStarts(schedule) {
  const items = Array.isArray(schedule)
    ? schedule
    : typeof schedule === "string"
      ? [schedule]
      : [];
  const out = [];
  for (const item of items) {
    if (typeof item !== "string") continue;
    const first = item.match(/\d{1,2}:\d{2}/); // 항목의 첫 시각 = 시작
    if (first) {
      const [h, m] = first[0].split(":");
      out.push(`${h.padStart(2, "0")}:${m}`);
    }
  }
  return out;
}

const { data: events, error } = await sb
  .from("events")
  .select("id, owner_id, course_id, title, starts_at, courses(name, schedule)")
  .eq("kind", "class");

if (error) {
  console.error("조회 실패:", error.message);
  process.exit(1);
}

let polluted = 0;
let normal = 0;
let unknown = 0;
const pollutedByOwner = {};
const pollutedSamples = [];

for (const e of events) {
  const kst = kstHHMM(e.starts_at); // 화면에 보이는 시각
  const scheduleStarts = parseScheduleStarts(e.courses?.schedule);
  if (scheduleStarts.length === 0) {
    unknown++;
    continue;
  }
  // schedule의 어떤 시작 시각과도 일치하면 정상.
  if (scheduleStarts.includes(kst)) {
    normal++;
    continue;
  }
  // KST에서 9시간 빼면 schedule과 일치하나? → 오염(naive로 +9h된 것)
  const [kh, km] = kst.split(":").map(Number);
  const shifted = `${String((kh - 9 + 24) % 24).padStart(2, "0")}:${String(km).padStart(2, "0")}`;
  if (scheduleStarts.includes(shifted)) {
    polluted++;
    const k = e.owner_id.slice(0, 8);
    pollutedByOwner[k] = (pollutedByOwner[k] ?? 0) + 1;
    if (pollutedSamples.length < 8) {
      pollutedSamples.push({
        title: e.title,
        starts_at: e.starts_at,
        보이는시각: kst,
        실제강의: shifted,
        schedule: e.courses?.schedule?.slice(0, 40),
      });
    }
  } else {
    unknown++;
  }
}

console.log("=== class 이벤트 시각 진단 ===");
console.log(`전체: ${events.length}건`);
console.log(`정상(schedule과 일치): ${normal}건`);
console.log(`오염(9시간 밀림): ${polluted}건  ⚠️`);
console.log(`판별불가(schedule 없음/패턴 안맞음): ${unknown}건`);
console.log("\n=== 오염 owner별 분포 (앞 8자) ===");
console.log(JSON.stringify(pollutedByOwner, null, 2));
console.log("\n=== 오염 샘플 ===");
for (const s of pollutedSamples) console.log(JSON.stringify(s));
console.log("\n=== 제안 교정 (실행 X — 검토용) ===");
console.log("오염 이벤트의 starts_at·ends_at에서 9시간(interval '9 hours')을 빼면 정상.");
console.log("단, 위 '오염' 판별을 통과한 id만 대상으로 해야 정상 데이터를 안 건드림.");
