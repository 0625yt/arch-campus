// Opt-in production HTTP regression. Only disposable accounts and a synthetic fixture.
import assert from "node:assert/strict";
import { createECDH, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const base = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3010");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const users = [],
  cookies = [],
  paths = [];
let checks = 0;
const pass = (message) => {
  checks++;
  process.stdout.write(`PASS ${message}\n`);
};
async function request(path, { owner = 0, status = 200, method = "GET", body, origin } = {}) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: {
      cookie: cookies[owner] ?? "",
      "content-type": "application/json",
      origin: origin ?? base.origin,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.status, status, `${method} ${path}: unexpected HTTP status`);
  return response.json();
}
try {
  for (let i = 0; i < 2; i++) {
    const email = `arch-release-${randomUUID()}@example.invalid`,
      password = randomBytes(24).toString("base64url");
    const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (made.error) throw made.error;
    users.push(made.data.user.id);
    const jar = new Map();
    const client = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => [...jar.values()],
        setAll: (items) => {
          for (const item of items) jar.set(item.name, item);
        },
      },
    });
    const session = await client.auth.signInWithPassword({ email, password });
    if (session.error) throw session.error;
    cookies.push([...jar.values()].map(({ name, value }) => `${name}=${value}`).join("; "));
  }
  for (const path of ["/api/study-plans", "/api/push/subscriptions"])
    await request(path, { owner: -1, status: 401 });
  pass("production requires login for study plans and push settings");
  const course = await admin
    .from("courses")
    .insert({ owner_id: users[0], name: "가상 배포 검증", category: "personal" })
    .select("id")
    .single();
  if (course.error) throw course.error;
  const material = await admin
    .from("materials")
    .insert({
      owner_id: users[0],
      course_id: course.data.id,
      title: "가상 학습 자료",
      type: "lecture",
      full_text: "스택은 후입선출 방식이다.",
    })
    .select("id")
    .single();
  if (material.error) throw material.error;
  const create = {
    action: "create",
    revision: 0,
    courseId: course.data.id,
    title: "가상 시험 준비",
    targetDate: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10),
    scope: "스택과 큐",
    materialIds: [material.data.id],
  };
  let workspace = (await request("/api/study-plans", { method: "POST", body: create })).workspace;
  assert.equal(workspace.plans[0].tasks.length, 3);
  assert.equal((await request("/api/study-plans")).workspace.revision, workspace.revision);
  pass("study plan creation persists its scope and three tasks");
  await request("/api/study-plans", {
    method: "POST",
    body: { action: "budget", revision: 0, dailyMinutes: 60 },
    status: 409,
  });
  await request("/api/study-plans", { owner: 1, method: "POST", body: create, status: 404 });
  await request("/api/study-plans", {
    method: "POST",
    body: create,
    origin: "https://example.invalid",
    status: 403,
  });
  pass("stale revisions, foreign materials and foreign origins are rejected");
  const plan = workspace.plans[0],
    task = plan.tasks[0];
  for (const action of ["complete", "undo"]) {
    workspace = (
      await request("/api/study-plans", {
        method: "POST",
        body: {
          action,
          revision: workspace.revision,
          planId: plan.id,
          taskId: task.id,
          reflection: "원문 확인 완료",
        },
      })
    ).workspace;
    assert.equal(workspace.plans[0].tasks[0].status, action === "complete" ? "done" : "pending");
  }
  for (const action of ["archive", "remove"])
    workspace = (
      await request("/api/study-plans", {
        method: "POST",
        body: { action, revision: workspace.revision, planId: plan.id },
      })
    ).workspace;
  assert.equal(workspace.plans.length, 0);
  pass("task completion, undo, archive and removal round-trip through the database");
  const push = await request("/api/push/subscriptions");
  assert.equal(push.configured, true);
  assert.equal(push.publicKey.length, 87);
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const subscription = {
    endpoint: `https://fcm.googleapis.com/fcm/send/synthetic-${randomUUID()}`,
    keys: {
      p256dh: ecdh.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
  for (let i = 0; i < 2; i++)
    await request("/api/push/subscriptions", { method: "POST", body: subscription });
  await request("/api/push/subscriptions", {
    owner: 1,
    method: "POST",
    body: subscription,
    status: 409,
  });
  await request("/api/push/subscriptions", {
    owner: 1,
    method: "DELETE",
    body: { endpoint: subscription.endpoint },
  });
  assert.equal((await request("/api/push/subscriptions")).endpointHashes.length, 1);
  await request("/api/push/subscriptions", {
    method: "DELETE",
    body: { endpoint: subscription.endpoint },
  });
  assert.equal((await request("/api/push/subscriptions")).endpointHashes.length, 0);
  pass(
    "push configuration, idempotent registration, owner isolation and opt-out work without sending notifications",
  );
  if (process.argv.includes("--upload")) {
    const filename = "study-example.pptx",
      mimeType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    const target = await request("/api/materials/upload-url", {
      method: "POST",
      body: { filename },
    });
    paths.push(target.storagePath);
    const uploaded = await fetch(target.signedUrl, {
      method: "PUT",
      headers: { "content-type": mimeType, authorization: `Bearer ${target.token}` },
      body: await readFile(new URL("../src/test/fixtures/study-example.pptx", import.meta.url)),
    });
    assert.ok(uploaded.ok, "signed direct upload must succeed");
    const finalized = await request("/api/materials/finalize", {
      method: "POST",
      body: {
        storagePath: target.storagePath,
        materialId: target.materialId,
        courseId: course.data.id,
        filename,
        mimeType,
        count: 2,
        intentNote: "스택과 큐의 차이를 비교표로 정리해 주세요.",
      },
    });
    assert.equal(finalized.ok, true);
    let jobs;
    for (let i = 0; i < 120; i++) {
      const loaded = await admin
        .from("material_jobs")
        .select("tool,status,error_message")
        .eq("owner_id", users[0])
        .eq("material_id", target.materialId);
      if (loaded.error) throw loaded.error;
      jobs = loaded.data;
      if (
        jobs.length === 2 &&
        jobs.every((job) => ["done", "error", "cancelled"].includes(job.status))
      )
        break;
      await delay(1500);
    }
    assert.equal(jobs?.length, 2);
    for (const job of jobs)
      assert.equal(
        job.status,
        "done",
        `${job.tool} job must complete (${job.error_message ?? "pending"})`,
      );
    const saved = await admin
      .from("materials")
      .select("full_text,summary_payload")
      .eq("id", target.materialId)
      .single();
    if (saved.error) throw saved.error;
    assert.ok(saved.data.full_text.includes("후입선출"));
    assert.ok(saved.data.summary_payload.blocks.some((block) => block.type === "table"));
    const generated = await admin
      .from("generations")
      .select("tool,model_id,status")
      .eq("owner_id", users[0]);
    if (generated.error) throw generated.error;
    for (const tool of ["summarize", "quiz"])
      assert.ok(
        generated.data.some(
          (row) => row.tool === tool && row.model_id === "claude-haiku-5-5" && row.status === "ok",
        ),
      );
    assert.ok(
      generated.data.some(
        (row) =>
          row.tool === "summary-verify" &&
          row.model_id === "gemini-3.8-flash" &&
          row.status === "ok",
      ),
    );
    pass(
      "PPTX direct upload, deployed parser, requested comparison table, quiz and independent audit complete with the intended models",
    );
  }
  process.stdout.write(`${checks} production release checks passed\n`);
} catch (error) {
  process.stderr.write(
    `FAIL release verification: ${error instanceof assert.AssertionError ? error.message : (error.code ?? error.name)}\n`,
  );
  process.exitCode = 1;
} finally {
  if (paths.length) {
    const removed = await admin.storage.from("materials").remove(paths);
    if (removed.error) {
      process.stderr.write("FAIL temporary uploaded file cleanup\n");
      process.exitCode = 1;
    }
  }
  for (const id of users) {
    const removed = await admin.auth.admin.deleteUser(id);
    if (removed.error) {
      process.stderr.write("FAIL temporary release account cleanup\n");
      process.exitCode = 1;
    }
  }
  process.stdout.write("CLEAN temporary release accounts and uploads removed\n");
}
