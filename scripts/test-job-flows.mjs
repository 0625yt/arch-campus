// Opt-in API/DB recovery smoke. Empty synthetic sources avoid all AI calls and cost reservations.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const base = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3010");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let userId;
try {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) {
    assert.equal((await fetch(new URL("/api/jobs/active", base))).status, 401);
    process.stdout.write("PASS unauthenticated recovery is denied\n");
  } else {
    process.stdout.write("SKIP anonymous check on local dev auth fallback; verify on Preview\n");
  }
  const email = `arch-jobs-${randomUUID()}@example.invalid`;
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
  const jobs = [];
  for (let index = 0; index < 2; index++) {
    const material = await admin
      .from("materials")
      .insert({ owner_id: userId, title: "가상 빈 자료", type: "lecture", full_text: "" })
      .select("id")
      .single();
    if (material.error) throw material.error;
    const job = await admin
      .from("jobs")
      .insert({
        owner_id: userId,
        material_id: material.data.id,
        tool: "summarize",
        status: "running",
        started_at: "2020-01-01T00:00:00Z",
      })
      .select("id")
      .single();
    if (job.error) throw job.error;
    jobs.push(job.data.id);
  }
  async function activeJobs() {
    const response = await fetch(new URL("/api/jobs/active", base), { headers: { cookie } });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.ok, true);
    return result.jobs;
  }
  async function readJob(id) {
    const result = await admin
      .from("jobs")
      .select("status, retry_count, error_message, checkpoint_history")
      .eq("id", id)
      .eq("owner_id", userId)
      .single();
    if (result.error) throw result.error;
    return result.data;
  }
  async function waitForError(id) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const job = await readJob(id);
      if (job.status === "error") {
        assert.equal(job.retry_count, 1);
        assert.ok(job.error_message.includes("본문이 비어"));
        assert.ok(
          job.checkpoint_history.some((checkpoint) => checkpoint.stage === "rebuilding-input"),
        );
        return;
      }
      await delay(500);
    }
    throw new Error("recovery timeout");
  }
  const firstPoll = await activeJobs();
  assert.ok(firstPoll.some((job) => job.id === jobs[1]));
  await waitForError(jobs[0]);
  process.stdout.write("PASS first stale job resumes with persisted attempt checkpoints\n");
  const queued = await readJob(jobs[1]);
  assert.equal(queued.status, "running");
  assert.equal(queued.retry_count, 0);
  process.stdout.write("PASS another eligible job waits for the next poll\n");
  await activeJobs();
  await waitForError(jobs[1]);
  assert.deepEqual(await activeJobs(), []);
  process.stdout.write("PASS next poll resumes the remaining job and clears failed work\n");
  for (const table of ["generations", "ai_budget_reservations"]) {
    const result = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId);
    if (result.error) throw result.error;
    assert.equal(result.count, 0);
  }
  process.stdout.write("PASS invalid sources create no AI calls or budget reservations\n");
} catch (error) {
  process.stderr.write(
    `FAIL job API flow (${error instanceof assert.AssertionError ? error.message : (error.code ?? error.name)})\n`,
  );
  process.exitCode = 1;
} finally {
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      process.stderr.write("FAIL temporary job account cleanup\n");
      process.exitCode = 1;
    } else process.stdout.write("CLEAN temporary job account and fixtures removed\n");
  }
}
