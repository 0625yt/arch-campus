#!/usr/bin/env node
// 임시 검증 스크립트: .env.local 키들이 전부 살아있는지 확인.
// 사용: node --env-file=.env.local scripts/verify-env.mjs

import { createClient } from "@supabase/supabase-js";

const checks = [];

function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  const mark = ok ? "✓" : "✗";
  const color = ok ? "\x1b[32m" : "\x1b[31m";
  console.log(`${color}${mark}\x1b[0m ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log("\n── 환경변수 ──────────────────────────────────────");
  const env = process.env;
  // 필수 키
  for (const key of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_PROJECT_REF",
  ]) {
    record(key, Boolean(env[key]), env[key] ? `${env[key].slice(0, 8)}…` : "비어있음");
  }
  // LLM 라우팅 — 둘 중 하나는 있어야 모델 호출이 가능.
  // - AI_GATEWAY_API_KEY (권장, Vercel AI Gateway 경유)
  // - ANTHROPIC_API_KEY (fallback, Anthropic SDK 직접 호출)
  const hasGateway = Boolean(env.AI_GATEWAY_API_KEY) || Boolean(env.VERCEL_OIDC_TOKEN);
  const hasAnthropic = Boolean(env.ANTHROPIC_API_KEY);
  record(
    "AI_GATEWAY_API_KEY 또는 VERCEL_OIDC_TOKEN",
    hasGateway,
    hasGateway ? "있음" : "비어있음 — Gateway 라우팅 비활성",
  );
  record(
    "ANTHROPIC_API_KEY (Gateway 없을 때 fallback)",
    hasAnthropic,
    hasAnthropic ? `${env.ANTHROPIC_API_KEY.slice(0, 8)}…` : "비어있음",
  );
  if (!hasGateway && !hasAnthropic) {
    record("LLM 라우팅", false, "Gateway·Anthropic 둘 다 없음 — 모든 AI 호출 실패");
  }
  // vendor 라우팅 플래그 — 비어있어도 정상(기본은 Anthropic)
  if (env.QUIZ_MODEL_VENDOR || env.SUMMARY_MODEL_VENDOR) {
    console.log(
      `  ↳ vendor 플래그: quiz=${env.QUIZ_MODEL_VENDOR ?? "anthropic"} ` +
        `summary=${env.SUMMARY_MODEL_VENDOR ?? "anthropic"}`,
    );
  }

  // Anthropic 직접 ping은 ANTHROPIC_API_KEY가 있을 때만 (fallback 동작 확인용).
  // Gateway 자체 ping은 OIDC 토큰 만료 등 false-positive가 흔해 생략.
  if (env.ANTHROPIC_API_KEY) {
    console.log("\n── Anthropic 직접 호출 (fallback 경로) ───────────");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 30,
          messages: [{ role: "user", content: "한 단어로만 답해: 안녕" }],
        }),
      });
      const json = await res.json();
      if (res.ok && json.content?.[0]?.text) {
        record("Anthropic API 호출", true, `응답 "${json.content[0].text.trim().slice(0, 30)}"`);
      } else {
        record(
          "Anthropic API 호출",
          false,
          `HTTP ${res.status} ${JSON.stringify(json).slice(0, 120)}`,
        );
      }
    } catch (err) {
      record("Anthropic API 호출", false, err.message);
    }
  } else {
    console.log("\n── Anthropic 직접 호출 — skip (Gateway 단독 운영) ─");
  }

  console.log("\n── Supabase (anon, RLS 적용) ─────────────────────");
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  try {
    const { data: anonUser, error: anonErr } = await anon.auth.getUser();
    record(
      "auth.getUser (로그인 안 된 상태)",
      !anonErr || anonErr.message.includes("session"),
      anonUser?.user ? "user 있음(이상)" : "session 없음(정상)",
    );
  } catch (e) {
    record("auth.getUser", false, e.message);
  }

  for (const table of ["profiles", "courses", "materials", "generations"]) {
    try {
      const { error, count } = await anon
        .from(table)
        .select("*", { count: "exact", head: true });
      if (error) {
        record(`SELECT ${table}`, false, error.message);
      } else {
        record(`SELECT ${table}`, true, `RLS로 ${count ?? 0}행 (anon은 행 0개여야 정상)`);
      }
    } catch (e) {
      record(`SELECT ${table}`, false, e.message);
    }
  }

  console.log("\n── Supabase (service_role, RLS 우회) ─────────────");
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const table of ["profiles", "courses", "materials", "generations"]) {
    try {
      const { error, count } = await admin
        .from(table)
        .select("*", { count: "exact", head: true });
      if (error) {
        record(`admin SELECT ${table}`, false, error.message);
      } else {
        record(`admin SELECT ${table}`, true, `${count ?? 0}행`);
      }
    } catch (e) {
      record(`admin SELECT ${table}`, false, e.message);
    }
  }

  // Storage 버킷 존재 확인
  try {
    const { data: buckets, error } = await admin.storage.listBuckets();
    if (error) record("Storage listBuckets", false, error.message);
    else {
      const hasMaterials = buckets.some((b) => b.id === "materials");
      record(
        "Storage 'materials' 버킷",
        hasMaterials,
        hasMaterials ? "존재" : `없음 (확인된 버킷: ${buckets.map((b) => b.id).join(", ")})`,
      );
    }
  } catch (e) {
    record("Storage listBuckets", false, e.message);
  }

  console.log("\n── 결과 ──────────────────────────────────────────");
  const failed = checks.filter((c) => !c.ok);
  if (failed.length === 0) {
    console.log("\x1b[32m전체 통과\x1b[0m");
    process.exit(0);
  } else {
    console.log(`\x1b[31m실패 ${failed.length}건\x1b[0m`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("스크립트 자체 오류:", err);
  process.exit(2);
});
