// Opt-in actual AI evaluation. Synthetic source and disposable user only.
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const base = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3010");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const quizMode = process.argv.includes("--quiz");
const admin = createClient(url, serverKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let userId;
try {
  const email = `arch-summary-${randomUUID()}@example.invalid`;
  const password = randomBytes(24).toString("base64url");
  const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error) throw made.error;
  userId = made.data.user.id;
  const jar = new Map();
  const client = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [...jar.values()],
      setAll: (items) => {
        for (const item of items) jar.set(item.name, item);
      },
    },
  });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  const cookie = [...jar.values()].map(({ name, value }) => `${name}=${value}`).join("; ");
  const chapters = [
    [
      "원본 접수",
      "문서 식별자는 각 원본을 구분하기 위해 기록한다.",
      "접수 기록에는 접수일과 담당자를 함께 적는다.",
      "검토 담당자는 접수 담당자와 다른 사람이어야 한다.",
    ],
    [
      "정정과 보관",
      "정정은 원본을 지우지 않고 새 행과 연결해서 남긴다.",
      "증빙이 없는 항목은 확인 필요로 표시한다.",
      "보관 기간이 끝나도 미결 항목이 있으면 담당자가 확인한 뒤 처리한다.",
    ],
  ];
  const source = chapters
    .map(([title, ...facts], index) => {
      const paragraph = `${title}\n${facts.join("\n")}\n`;
      return `=== Page ${index + 1} ===\n${paragraph.repeat(Math.ceil(34_000 / paragraph.length)).slice(0, 34_000)}`;
    })
    .join("\n\n");
  const material = await admin
    .from("materials")
    .insert({
      owner_id: userId,
      title: "가상 문서 관리 수업 — 장문 회귀 자료",
      type: "lecture",
      full_text: source,
      page_count: 2,
    })
    .select("id")
    .single();
  if (material.error) throw material.error;
  const response = await fetch(
    new URL(`/api/materials/${material.data.id}/${quizMode ? "quiz" : "summarize"}`, base),
    {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(quizMode ? { difficulty: "보통", count: 3 } : { styles: [] }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  assert.equal(response.status, 200);
  const queued = await response.json();
  assert.equal(queued.ok, true);
  let job;
  for (let attempt = 0; attempt < 240; attempt++) {
    const result = await admin
      .from("jobs")
      .select("status, cost_usd, input_tokens, output_tokens, result, generation_id, error_message")
      .eq("id", queued.jobId)
      .eq("owner_id", userId)
      .single();
    if (result.error) throw result.error;
    job = result.data;
    if (["done", "error", "cancelled"].includes(job.status)) break;
    await delay(1000);
  }
  assert.equal(job.status, "done", "material job must complete");
  process.stdout.write(`PASS actual ${quizMode ? "quiz" : "two-chunk summary"} job completes\n`);
  const logged = await admin
    .from("generations")
    .select("tool, status, input_tokens, output_tokens, cost_usd")
    .eq("owner_id", userId)
    .eq("material_id", material.data.id);
  if (logged.error) throw logged.error;
  const calls = logged.data.filter((row) => row.tool === (quizMode ? "quiz" : "summarize"));
  assert.equal(calls.length, quizMode ? 1 : 2);
  const successful = calls.filter((row) => row.status === "ok").length;
  assert.ok(successful >= 1);
  assert.equal(
    calls.reduce((sum, row) => sum + row.input_tokens, 0),
    job.input_tokens,
  );
  assert.equal(
    calls.reduce((sum, row) => sum + row.output_tokens, 0),
    job.output_tokens,
  );
  const recordedCost = calls.reduce((sum, row) => sum + Number(row.cost_usd), 0);
  assert.ok(Math.abs(recordedCost - Number(job.cost_usd)) < 0.000002);
  process.stdout.write("PASS usage and costs are recorded once per generation record\n");
  if (quizMode) {
    const saved = await admin
      .from("quizzes")
      .select("id, generation_id, questions")
      .eq("owner_id", userId)
      .eq("material_id", material.data.id);
    if (saved.error) throw saved.error;
    assert.equal(saved.data.length, 1);
    assert.equal(saved.data[0].id, job.result.quizId);
    assert.equal(saved.data[0].generation_id, job.generation_id);
    assert.ok(saved.data[0].questions.length >= 1 && saved.data[0].questions.length <= 3);
    process.stdout.write("PASS job, quiz and generation link point to one committed result\n");
  } else {
    const cached = await admin
      .from("materials")
      .select("summary_payload")
      .eq("id", material.data.id)
      .eq("owner_id", userId)
      .single();
    if (cached.error) throw cached.error;
    assert.deepEqual(cached.data.summary_payload, job.result.summary);
    const headings = cached.data.summary_payload.blocks.filter((block) => block.type === "h2");
    assert.equal(headings.filter((block) => /부분 [12]\/2/.test(block.content)).length, successful);
    const partialWarning = cached.data.summary_payload.reviewSpots.some(
      (spot) => spot.title === "일부 구간을 정리하지 못했어요",
    );
    assert.equal(partialWarning, successful < 2);
    process.stdout.write(`PASS cached summary reports actual coverage (${successful}/2 parts)\n`);
  }
  const totalCost = logged.data.reduce((sum, row) => sum + Number(row.cost_usd), 0);
  process.stdout.write(
    `3 actual ${quizMode ? "quiz-job" : "chunk-summary"} checks passed; recorded estimated AI cost $${totalCost.toFixed(6)} (includes classification; not provider billing).\n`,
  );
} catch (error) {
  if (userId) {
    const failed = await admin
      .from("jobs")
      .select("error_message")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);
    const message = failed.data?.[0]?.error_message;
    if (message) process.stderr.write(`DETAIL ${message.slice(0, 300)}\n`);
    const billed = await admin
      .from("generations")
      .select("tool,status,cost_usd,error_message")
      .eq("owner_id", userId);
    if (!billed.error) {
      process.stderr.write(
        `Recorded estimated cost before cleanup: $${billed.data.reduce((sum, row) => sum + Number(row.cost_usd), 0).toFixed(6)}; failed summary stages: ${billed.data
          .filter((row) => row.tool === "summarize" && row.status === "error")
          .map((row) =>
            row.error_message?.includes("실제 원문")
              ? "citation"
              : row.error_message?.startsWith("Zod")
                ? "schema"
                : "provider",
          )
          .join(",")}\n`,
      );
    }
  }
  process.stderr.write(
    `FAIL actual chunk summary (${error instanceof assert.AssertionError ? error.message : (error.code ?? error.name)})\n`,
  );
  process.exitCode = 1;
} finally {
  if (userId) {
    const hash = createHmac("sha256", serverKey)
      .update(`arch-campus:rate-limit:${userId}`)
      .digest("hex");
    const bucket = await admin.from("rate_limit_buckets").delete().eq("identifier_hash", hash);
    const user = await admin.auth.admin.deleteUser(userId);
    if (bucket.error || user.error) {
      process.stderr.write("FAIL temporary summary account or bucket cleanup\n");
      process.exitCode = 1;
    } else process.stdout.write("CLEAN temporary summary account, data and bucket removed\n");
  }
}
