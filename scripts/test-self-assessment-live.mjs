// Disposable accounts only; no AI calls or emails, all created data is removed in finally.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const base = process.env.E2E_BASE_URL ?? "http://localhost:3010";
const users = [];
try {
  const sessions = [];
  for (let i = 0; i < 2; i++) {
    const email = `arch-grade-${randomUUID()}@example.invalid`,
      password = randomBytes(24).toString("base64url");
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    users.push(created.data.user.id);
    const jar = new Map();
    const client = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (items) => {
          for (const { name, value } of items) jar.set(name, value);
        },
      },
    });
    const session = await client.auth.signInWithPassword({ email, password });
    if (session.error) throw session.error;
    sessions.push([...jar].map(([name, value]) => `${name}=${value}`).join("; "));
  }
  const question = {
    id: 7,
    kind: "short-answer",
    difficulty: "보통",
    topic: "무결성",
    stem: "기본키의 NULL을 금지하는 무결성 제약의 명칭을 쓰시오.",
    answer: "개체 무결성",
    choices: null,
    explanation: "개체 무결성은 기본키의 유일성과 NULL 불허를 요구합니다.",
    evidence: "개체 무결성은 기본키가 NULL이 아님을 요구한다.",
    evidencePage: 1,
  };
  const { data: quiz, error: qerror } = await admin
    .from("quizzes")
    .insert({
      owner_id: users[0],
      title: "정답 인정 검증",
      question_count: 1,
      difficulty: "보통",
      questions: [question],
      watermark: "원문을 확인하는 학습 보조 자료입니다.",
      model_id: "synthetic",
    })
    .select("id")
    .single();
  if (qerror) throw qerror;
  const result = {
    questionId: 7,
    kind: "short-answer",
    correct: false,
    answer: question.answer,
    submitted: "무결성",
    explanation: question.explanation,
    evidence: question.evidence,
    evidencePage: 1,
    whyWrong: "어떤 무결성인지 구분해 주세요.",
  };
  const { data: attempt, error: aerror } = await admin
    .from("quiz_attempts")
    .insert({
      owner_id: users[0],
      quiz_id: quiz.id,
      answers: [],
      results: [result],
      score: 0,
      total: 1,
      status: "completed",
    })
    .select("id")
    .single();
  if (aerror) throw aerror;
  const call = async (cookie, accepted) =>
    fetch(`${base}/api/quiz/${quiz.id}/self-assess`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify({ attemptId: attempt.id, questionId: 7, accepted }),
    });
  assert.equal((await call(null, true)).status, 401);
  process.stdout.write("PASS unauthenticated request rejected" + "\n");
  assert.equal((await call(sessions[1], true)).status, 404);
  process.stdout.write("PASS other owner cannot change the grade" + "\n");
  const accepted = await call(sessions[0], true);
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).score, 1);
  let stored = await admin
    .from("quiz_attempts")
    .select("score,results")
    .eq("id", attempt.id)
    .eq("owner_id", users[0])
    .single();
  assert.equal(stored.data.score, 1);
  assert.equal(stored.data.results[0].selfAssessment.originalCorrect, false);
  process.stdout.write("PASS correction and original automatic verdict persisted" + "\n");
  const queue = await admin
    .from("wrong_items_v")
    .select("question_id")
    .eq("owner_id", users[0])
    .eq("quiz_id", quiz.id);
  if (queue.error) throw queue.error;
  assert.equal(queue.data.length, 0);
  process.stdout.write("PASS corrected answer removed from wrong-answer view\n");
  const restored = await call(sessions[0], false);
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).score, 0);
  stored = await admin
    .from("quiz_attempts")
    .select("score,results")
    .eq("id", attempt.id)
    .eq("owner_id", users[0])
    .single();
  assert.equal(stored.data.results[0].correct, false);
  assert.equal(stored.data.results[0].whyWrong, result.whyWrong);
  process.stdout.write("PASS original verdict and score restored" + "\n");
} finally {
  for (const id of users) {
    const deleted = await admin.auth.admin.deleteUser(id);
    if (deleted.error) {
      process.stderr.write("Disposable test account cleanup failed\n");
      process.exitCode = 1;
    }
  }
  process.stdout.write("PASS disposable accounts cleaned up" + "\n");
}
