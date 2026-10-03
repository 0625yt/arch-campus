// Live service-role API ownership checks. Only disposable users and synthetic rows.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const base = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3010");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const users = [];
const cookies = [];
try {
  for (let index = 0; index < 2; index++) {
    const email = `arch-api-${randomUUID()}@example.invalid`;
    const password = randomBytes(24).toString("base64url");
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
    const signed = await client.auth.signInWithPassword({ email, password });
    if (signed.error) throw signed.error;
    cookies.push([...jar.values()].map(({ name, value }) => `${name}=${value}`).join("; "));
  }
  async function insert(table, ownerId, data) {
    const result = await admin
      .from(table)
      .insert({ owner_id: ownerId, ...data })
      .select("id")
      .single();
    if (result.error) throw result.error;
    return result.data.id;
  }
  async function request(index, path, method = "GET", body) {
    return fetch(new URL(path, base), {
      method,
      headers: { cookie: cookies[index], "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  const marker = `PRIVATE_FIXTURE_${randomUUID()}`;
  const courseId = await insert("courses", users[0], { name: marker, category: "personal" });
  const materialId = await insert("materials", users[0], {
    title: marker,
    type: "lecture",
    course_id: courseId,
  });
  const eventId = await insert("events", users[0], {
    title: marker,
    kind: "etc",
    starts_at: "2026-10-03T09:00:00Z",
  });
  const quizId = await insert("quizzes", users[0], {
    title: marker,
    question_count: 1,
    questions: [],
    watermark: "fixture",
    model_id: "fixture",
  });
  const ownMaterialId = await insert("materials", users[1], {
    title: "Own fixture",
    type: "lecture",
  });
  const mutations = [
    [`/api/materials/${materialId}`, "PATCH", { title: "Unauthorized change" }],
    [`/api/materials/${materialId}`, "DELETE"],
    [`/api/events/${eventId}`, "PATCH", { title: "Unauthorized change" }],
    [`/api/events/${eventId}`, "DELETE"],
    [`/api/quiz/${quizId}`, "DELETE"],
    [`/api/materials/${ownMaterialId}`, "PATCH", { course_id: courseId }],
  ];
  for (const [path, method, body] of mutations) {
    const response = await request(1, path, method, body);
    assert.equal(response.status, 404);
    assert.equal((await response.json()).ok, false);
    process.stdout.write(
      `PASS ${method} foreign ${path.startsWith("/api/events") ? "event" : path.startsWith("/api/quiz") ? "quiz" : "material/course"} denied\n`,
    );
  }
  for (const [table, id] of [
    ["materials", materialId],
    ["events", eventId],
    ["quizzes", quizId],
  ]) {
    const result = await admin
      .from(table)
      .select("title")
      .eq("id", id)
      .eq("owner_id", users[0])
      .single();
    assert.ok(!result.error && result.data.title === marker);
  }
  process.stdout.write("PASS original rows remain unchanged after denied mutations\n");
  const own = await request(0, `/api/materials/${materialId}`, "PATCH", { title: "Owner change" });
  assert.equal(own.status, 200);
  assert.equal((await own.json()).material.title, "Owner change");
  process.stdout.write("PASS owner control can update the same material\n");
  const events = await request(1, "/api/events?from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z");
  assert.equal(events.status, 200);
  assert.ok(!(await events.text()).includes(marker));
  process.stdout.write("PASS foreign event is absent from API list\n");
} catch (error) {
  process.stderr.write(
    `FAIL API isolation (${error instanceof assert.AssertionError ? error.message : (error.code ?? error.name)})\n`,
  );
  process.exitCode = 1;
} finally {
  for (const id of users) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      process.stderr.write("FAIL temporary API account cleanup\n");
      process.exitCode = 1;
    } else process.stdout.write("CLEAN temporary API account and fixtures removed\n");
  }
}
