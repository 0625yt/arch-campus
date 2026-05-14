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
  for (const key of [
    "ANTHROPIC_API_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_PROJECT_REF",
  ]) {
    record(key, Boolean(env[key]), env[key] ? `${env[key].slice(0, 8)}…` : "비어있음");
  }

  console.log("\n── Anthropic ─────────────────────────────────────");
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
      record("API 호출", true, `응답 "${json.content[0].text.trim().slice(0, 30)}"`);
    } else {
      record("API 호출", false, `HTTP ${res.status} ${JSON.stringify(json).slice(0, 120)}`);
    }
  } catch (err) {
    record("API 호출", false, err.message);
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
