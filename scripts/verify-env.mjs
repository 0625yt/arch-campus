#!/usr/bin/env node
// Read-only health checks. Never print credentials or create AI generations.
import { createClient } from "@supabase/supabase-js";
import { getModelIdFor, getModelVendor } from "../src/lib/claude.ts";

const checks = [];
const env = process.env;
const tools = [
  "summarize",
  "quiz",
  "chat",
  "chat-free",
  "presentation",
  "timetable-extract",
  "syllabus-extract",
  "event-parse",
  "exam-extract",
  "quiz-grade",
  "quiz-verify",
  "report-structure",
];
function record(name, ok, detail = "") {
  checks.push({ name, ok });
  process.stdout.write(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}\n`);
}
const timedFetch = (url, options = {}) =>
  fetch(url, { ...options, signal: AbortSignal.timeout(15000) });

async function main() {
  for (const key of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    record(key, Boolean(env[key]?.trim()), env[key]?.trim() ? "설정됨 (값 비공개)" : "미설정");
  }
  const modelIds = new Set();
  for (const tool of tools) {
    const id = getModelIdFor(tool);
    modelIds.add(id);
    const key =
      getModelVendor(id) === "google" ? "GOOGLE_GENERATIVE_AI_API_KEY" : "ANTHROPIC_API_KEY";
    record(
      `모델 ${tool}`,
      Boolean(env[key]?.trim()),
      `${id} · ${key} ${env[key]?.trim() ? "설정됨" : "미설정"}`,
    );
  }
  process.stdout.write(
    `분산 호출 제한: ${env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN ? "설정됨" : "미설정 — 인스턴스별 메모리 제한 사용"}\n`,
  );
  let base;
  try {
    base = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
  } catch {
    record("Supabase URL 형식", false);
    return;
  }
  if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const response = await timedFetch(new URL("/auth/v1/health", base), {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
    });
    record("Supabase Auth 연결", response.ok, `HTTP ${response.status}`);
  } catch {
    record("Supabase Auth 연결", false, "연결 실패 또는 15초 초과");
  }
  const clientOptions = {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: timedFetch },
  };
  const anon = createClient(base.href, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, clientOptions);
  const admin = createClient(base.href, env.SUPABASE_SERVICE_ROLE_KEY, clientOptions);
  for (const table of ["profiles", "courses", "materials", "generations"]) {
    const { error, count } = await anon.from(table).select("*", { count: "exact", head: true });
    record(
      `비로그인 ${table} 격리`,
      !error && count === 0,
      error ? "조회 실패" : count === 0 ? "공개 행 없음" : "비로그인 조회에 행이 노출됨",
    );
    const { error: adminError } = await admin.from(table).select("*", { head: true }).limit(1);
    record(`서버 ${table} 연결`, !adminError, adminError ? "조회 실패" : "연결됨 (행 내용 미조회)");
  }
  const { data: buckets, error } = await admin.storage.listBuckets();
  record(
    "자료 저장 버킷",
    !error && buckets?.some((bucket) => bucket.id === "materials"),
    error ? "조회 실패" : "materials 버킷 확인",
  );
  if (process.argv.includes("--models")) {
    for (const id of modelIds) {
      const google = getModelVendor(id) === "google";
      const key = google ? env.GOOGLE_GENERATIVE_AI_API_KEY : env.ANTHROPIC_API_KEY;
      if (!key) continue;
      try {
        const endpoint = google
          ? `https://generativelanguage.googleapis.com/v1beta/models/${id}`
          : `https://api.anthropic.com/v1/models/${id}`;
        const headers = google
          ? { "x-goog-api-key": key }
          : { "x-api-key": key, "anthropic-version": "2023-06-01" };
        const response = await timedFetch(endpoint, { headers });
        record(`모델 가용성 ${id}`, response.ok, `HTTP ${response.status} (생성 호출 없음)`);
      } catch {
        record(`모델 가용성 ${id}`, false, "연결 실패 또는 15초 초과");
      }
    }
  }
}
try {
  await main();
} catch {
  record("점검 실행", false, "연결 또는 설정 오류 — 비밀 값은 출력하지 않음");
}
const failed = checks.filter((check) => !check.ok).length;
process.stdout.write(
  `결과: ${checks.length - failed} 통과 / ${failed} 실패. 실사용 생성 품질·로그인 완료 검증은 별도입니다.\n`,
);
process.exitCode = failed ? 1 : 0;
