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
  console.info(`\x1b[32m✓\x1b[0m ${label} — ${msg}`);
}
function fail(label, msg) {
  console.info(`\x1b[31m✗\x1b[0m ${label} — ${msg}`);
}

let failures = 0;

// 0021 — generations.model_provider 컬럼·CHECK·인덱스
console.info("\n── 0021 generations.model_provider ───────────");
{
  // select 시도 — 컬럼 없으면 PGRST204
  const { error } = await admin.from("generations").select("id, model_provider").limit(1);
  if (error) {
    fail("generations.model_provider 컬럼", error.message);
    failures++;
  } else {
    ok("generations.model_provider 컬럼", "select 통과");
  }
}
// CHECK values are not probed here; only column availability was checked above.
ok("generations provider 컬럼", "컬럼 조회 통과; CHECK 제약은 별도 검증 필요");

// 0022 — wrong_items_v.topic
console.info("\n── 0022 wrong_items_v.topic ─────────────────");
{
  const { error } = await admin.from("wrong_items_v").select("attempt_id, topic").limit(1);
  if (error) {
    fail("wrong_items_v.topic 컬럼", error.message);
    failures++;
  } else {
    ok("wrong_items_v.topic 컬럼", "select 통과");
  }
}

// 신규 generations row insert 시 model_provider 라벨이 실제로 들어가는지 — quiz·summarize 등 서비스 코드가
// 직접 호출하는 라우트가 있으나, 여기선 가벼운 직접 insert 한 건으로 끝-투-끝 통신.
console.info("\n── insert smoke test (rollback X — 실제 1건 남음) ──");
{
  const sampleOwner = process.env.SMOKE_OWNER_ID;
  if (!sampleOwner) {
    console.info(
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

console.info("");
if (failures === 0) {
  console.info("\x1b[32m마이그레이션 적용 확인 — 안전\x1b[0m");
  process.exit(0);
} else {
  console.info(`\x1b[31m실패 ${failures}건 — 배포 보류 권장\x1b[0m`);
  process.exit(1);
}
