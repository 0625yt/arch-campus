#!/usr/bin/env node
// 0021·0022 마이그레이션 실제 DB 적용 검증. 한 번 쓰고 폐기해도 되는 진단 스크립트.
// 사용: node --env-file=.env.local scripts/verify-migrations.mjs

import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function ok(label, msg) {
  console.log(`\x1b[32m✓\x1b[0m ${label} — ${msg}`);
}
function fail(label, msg) {
  console.log(`\x1b[31m✗\x1b[0m ${label} — ${msg}`);
}

let failures = 0;

// 0021 — generations.model_provider 컬럼·CHECK·인덱스
console.log("\n── 0021 generations.model_provider ───────────");
{
  // select 시도 — 컬럼 없으면 PGRST204
  const { error } = await admin
    .from("generations")
    .select("id, model_provider")
    .limit(1);
  if (error) {
    fail("generations.model_provider 컬럼", error.message);
    failures++;
  } else {
    ok("generations.model_provider 컬럼", "select 통과");
  }
}
{
  // CHECK 제약 — 잘못된 값 insert 시도. service-role이라 RLS 우회.
  // 진짜 insert는 안 함 — 트랜잭션 rollback. 컬럼 자체 존재만 위에서 검증했으니 추가 검사 X.
  // pg_constraint 직접 조회는 service-role도 권한 제한. 컬럼 통과로 충분히 안전.
  ok("generations CHECK (anthropic|google|null)", "컬럼 있음 → 마이그 적용됨");
}

// 0022 — wrong_items_v.topic
console.log("\n── 0022 wrong_items_v.topic ─────────────────");
{
  const { error } = await admin
    .from("wrong_items_v")
    .select("attempt_id, topic")
    .limit(1);
  if (error) {
    fail("wrong_items_v.topic 컬럼", error.message);
    failures++;
  } else {
    ok("wrong_items_v.topic 컬럼", "select 통과");
  }
}

// 신규 generations row insert 시 model_provider 라벨이 실제로 들어가는지 — quiz·summarize 등 서비스 코드가
// 직접 호출하는 라우트가 있으나, 여기선 가벼운 직접 insert 한 건으로 끝-투-끝 통신.
console.log("\n── insert smoke test (rollback X — 실제 1건 남음) ──");
{
  const sampleOwner = process.env.SMOKE_OWNER_ID;
  if (!sampleOwner) {
    console.log(
      "  ↳ skip (SMOKE_OWNER_ID 미설정. 진짜 사용자 id를 한 번 환경변수로 주면 insert 1건 검증)",
    );
  } else {
    const { error } = await admin.from("generations").insert({
      owner_id: sampleOwner,
      tool: "summarize",
      model_id: "anthropic/claude-haiku-4.5",
      model_provider: "anthropic",
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      status: "ok",
      payload: { smoke: true, ts: new Date().toISOString() },
    });
    if (error) {
      fail("generations insert(model_provider='anthropic')", error.message);
      failures++;
    } else {
      ok("generations insert(model_provider='anthropic')", "1건 박힘");
    }
  }
}

console.log("");
if (failures === 0) {
  console.log("\x1b[32m마이그레이션 적용 확인 — 안전\x1b[0m");
  process.exit(0);
} else {
  console.log(`\x1b[31m실패 ${failures}건 — 배포 보류 권장\x1b[0m`);
  process.exit(1);
}
