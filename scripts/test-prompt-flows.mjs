// Opt-in: real API/DB and billed AI calls, disposable user and synthetic notes only.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { getModelIdFor } from "../src/lib/claude.ts";
import { PROMPT_QUALITY_FIXTURES } from "../src/lib/eval/fixtures/prompt-quality.ts";

const base = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3010");
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const fixture = PROMPT_QUALITY_FIXTURES[0];
let userId;
try {
  const email = `arch-prompts-${randomUUID()}@example.invalid`;
  const password = randomBytes(24).toString("base64url");
  const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error) throw made.error;
  userId = made.data.user.id;
  const profile = await admin
    .from("profiles")
    .update({
      display_name: "가상 학습 검증",
      university: "검증 대학교",
      department: "검증 학과",
      year: 1,
    })
    .eq("id", userId);
  if (profile.error) throw profile.error;
  const material = await admin
    .from("materials")
    .insert({
      owner_id: userId,
      title: fixture.title,
      type: "lecture",
      full_text: fixture.source,
      page_count: 2,
      mime_type: "text/plain",
    })
    .select("id")
    .single();
  if (material.error) throw material.error;
  const jar = new Map();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => [...jar.values()],
        setAll: (items) => {
          for (const item of items) jar.set(item.name, item);
        },
      },
    },
  );
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  const cookie = [...jar.values()].map(({ name, value }) => `${name}=${value}`).join("; ");
  async function request(path, data) {
    const response = await fetch(new URL(path, base), {
      method: data ? "POST" : "GET",
      headers: { cookie, "content-type": "application/json" },
      body: data ? JSON.stringify(data) : undefined,
    });
    assert.equal(response.status, 200, `HTTP ${response.status} at ${path}`);
    return response.json();
  }
  async function job(tool, body) {
    const started = await request(`/api/materials/${material.data.id}/${tool}`, body);
    assert.equal(started.ok, true);
    for (let attempt = 0; attempt < 60; attempt++) {
      const response = await request(`/api/jobs/${started.jobId}`);
      assert.notEqual(
        response.job.status,
        "error",
        `${tool} job failed: ${response.job.errorMessage}`,
      );
      if (response.job.status === "done") return response.job;
      await delay(3000);
    }
    throw new Error(`${tool} job timed out`);
  }
  const summarized = await job("summarize", {});
  const loaded = await admin
    .from("materials")
    .select("summary_payload")
    .eq("id", material.data.id)
    .eq("owner_id", userId)
    .single();
  if (loaded.error) throw loaded.error;
  const summary = loaded.data.summary_payload;
  assert.ok(summary.blocks.length >= 5);
  assert.ok(summary.blocks.some((block) => block.sourceQuote));
  const compact = (value) => value.replace(/[\s\p{P}\p{S}]/gu, "");
  for (const block of summary.blocks) {
    if (block.sourceQuote) assert.ok(compact(fixture.source).includes(compact(block.sourceQuote)));
    else assert.equal(block.sourcePage, null);
  }
  process.stdout.write(
    `PASS API summary job → persisted source citations ($${Number(summarized.cost).toFixed(5)})\n`,
  );
  const generated = await job("quiz", {
    count: 3,
    difficulty: "보통",
    kinds: ["multiple-choice", "short-answer"],
  });
  const quiz = await admin
    .from("quizzes")
    .select("questions")
    .eq("id", generated.result.quizId)
    .eq("owner_id", userId)
    .single();
  if (quiz.error) throw quiz.error;
  assert.ok(quiz.data.questions.length >= 2 && quiz.data.questions.length <= 3);
  for (const question of quiz.data.questions) {
    assert.ok(compact(fixture.source).includes(compact(question.evidence)));
    assert.ok([1, 2, null].includes(question.evidencePage));
    if (question.kind === "multiple-choice") {
      assert.equal(question.choices.length, 4);
      assert.equal(question.choices.filter((choice) => choice.key === question.answer).length, 1);
    }
  }
  process.stdout.write(
    `PASS API quiz job → ${quiz.data.questions.length} verified saved questions ($${Number(generated.cost).toFixed(5)})\n`,
  );
  const classified = await admin
    .from("generations")
    .select("status,model_id,input_tokens,output_tokens,cost_usd")
    .eq("owner_id", userId)
    .eq("material_id", material.data.id)
    .eq("tool", "classify-material");
  if (classified.error) throw classified.error;
  assert.equal(classified.data.length, 2);
  for (const row of classified.data) {
    assert.equal(row.status, "ok");
    assert.equal(row.model_id, getModelIdFor("classify-material"));
    assert.ok(row.input_tokens > 0 && row.output_tokens > 0 && Number(row.cost_usd) > 0);
  }
  const classificationCost = classified.data.reduce(
    (total, row) => total + Number(row.cost_usd),
    0,
  );
  process.stdout.write(
    `PASS API classification → 2 successful metered records ($${classificationCost.toFixed(5)})\n`,
  );
  const draft = await request("/api/events/draft", {
    text: "곧 동아리 회식. 2026년 10월 8일 오후 6시 과제 마감, 배점 30점.",
  });
  assert.equal(draft.events.length, 1);
  assert.equal(draft.events[0].weight_percent, null);
  assert.equal(new Date(draft.events[0].starts_at).toISOString(), "2026-10-08T09:00:00.000Z");
  process.stdout.write("PASS API ambiguous date and score weight\n");
} catch (error) {
  process.stderr.write(
    `FAIL prompt flows: ${error instanceof assert.AssertionError ? error.message : error.name}\n`,
  );
  process.exitCode = 1;
} finally {
  if (userId) {
    const cleaned = await admin.auth.admin.deleteUser(userId);
    if (cleaned.error) {
      process.stderr.write("FAIL temporary prompt account cleanup\n");
      process.exitCode = 1;
    } else process.stdout.write("CLEAN temporary prompt account and generated fixtures removed\n");
  }
}
