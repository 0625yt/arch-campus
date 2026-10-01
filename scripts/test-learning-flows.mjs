// Opt-in live regression. Uses disposable confirmed users, no AI calls or emails.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const base = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3010");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const users = [];
let browser;
try {
  const password = randomBytes(24).toString("base64url");
  const email = `arch-learning-${randomUUID()}@example.invalid`;
  for (const address of [email, `arch-isolation-${randomUUID()}@example.invalid`]) {
    const made = await admin.auth.admin.createUser({
      email: address,
      password,
      email_confirm: true,
    });
    if (made.error) throw made.error;
    users.push(made.data.user.id);
  }
  const ownerId = users[0];
  const profile = await admin
    .from("profiles")
    .update({
      display_name: "학습 흐름 검증",
      university: "검증 대학교",
      department: "검증 학과",
      year: 1,
    })
    .eq("id", ownerId);
  if (profile.error) throw profile.error;

  const events = Array.from({ length: 1005 }, (_, index) => ({
    owner_id: ownerId,
    title: `백업 검증 ${index}`,
    kind: "etc",
    starts_at: "2026-10-01T09:00:00Z",
  }));
  for (let offset = 0; offset < events.length; offset += 250) {
    const inserted = await admin.from("events").insert(events.slice(offset, offset + 250));
    if (inserted.error) throw inserted.error;
  }
  const foreign = await admin.from("events").insert({
    owner_id: users[1],
    title: "다른 사용자 일정",
    kind: "etc",
    starts_at: "2026-10-01T09:00:00Z",
  });
  if (foreign.error) throw foreign.error;

  const quiz = await admin
    .from("quizzes")
    .insert({
      owner_id: ownerId,
      title: "풀이 회고 검증",
      question_count: 1,
      difficulty: "보통",
      watermark: "이 자료는 학습 보조용이며 본인이 검토해야 합니다.",
      model_id: "fixture",
      questions: [
        {
          id: 1,
          kind: "multiple-choice",
          difficulty: "보통",
          topic: "작업 기억",
          stem: "작업 기억의 핵심 특성을 가장 정확하게 설명한 보기를 고르세요.",
          choices: [
            { key: "A", text: "용량이 무제한이다." },
            { key: "B", text: "일시적으로 유지하며 용량에 한계가 있다." },
            { key: "C", text: "항상 영구 저장된다." },
            { key: "D", text: "간섭을 전혀 받지 않는다." },
          ],
          answer: "B",
          explanation: "작업 기억은 현재 처리 중인 정보를 잠시 유지하며 용량에 한계가 있습니다.",
          evidence: "작업 기억은 제한된 용량으로 정보를 일시 유지한다.",
          evidencePage: 1,
        },
      ],
    })
    .select("id")
    .single();
  if (quiz.error) throw quiz.error;

  const jar = new Map();
  const client = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [...jar.values()].map(({ name, value }) => ({ name, value })),
      setAll: (items) => {
        for (const item of items) jar.set(item.name, item);
      },
    },
  });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies(
    [...jar.values()].map(({ name, value }) => ({
      name,
      value,
      domain: base.hostname,
      path: "/",
      secure: base.protocol === "https:",
      sameSite: "Lax",
    })),
  );
  const page = await context.newPage();
  await page.goto(new URL(`/dashboard/quiz/${quiz.data.id}`, base).href);
  process.stdout.write("CHECK quiz page opened\n");
  await page.getByRole("radio", { name: /용량이 무제한/ }).check();
  process.stdout.write("CHECK answer selected\n");
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await page.getByRole("button", { name: "결과 보기", exact: true }).click();
  await page.getByRole("link", { name: /60초 풀이 회고 남기기/ }).click();
  await page.getByRole("heading", { name: "다음 시험을 바꾸는 60초 회고" }).waitFor();
  await page.getByRole("button", { name: "개념이 비었음" }).click();
  await page.getByPlaceholder(/금요일 저녁/).fill("내일 작업 기억 오답 복습");
  await page.getByRole("button", { name: "회고 저장", exact: true }).click();
  await page.getByText("저장됐어요. 다음 복습 전에 다시 볼 수 있어요.").waitFor();
  await page.reload();
  assert.equal(await page.getByPlaceholder(/금요일 저녁/).inputValue(), "내일 작업 기억 오답 복습");
  assert.equal(
    await page.getByRole("button", { name: "개념이 비었음" }).getAttribute("aria-pressed"),
    "true",
  );
  process.stdout.write("PASS solve → reflection → save → reload (mobile)\n");

  const response = await context.request.get(new URL("/api/export/archive", base).href);
  assert.equal(response.status(), 200);
  const archive = await response.json();
  assert.equal(archive.events.length, 1005);
  assert.ok(archive.events.every((event) => event.owner_id === ownerId));
  assert.equal(archive.attemptReflections.length, 1);
  process.stdout.write("PASS JSON archive: 1005 events, persisted reflection, owner isolation\n");
  const calendar = await context.request.get(new URL("/api/export/calendar", base).href);
  assert.equal(calendar.status(), 200);
  const ics = await calendar.text();
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 1005);
  assert.ok(!ics.includes("다른 사용자 일정"));
  process.stdout.write("PASS ICS archive: 1005 events, owner isolation\n");

  await page.goto(new URL("/admin/jobs", base).href);
  assert.equal(await page.getByRole("heading", { name: "백그라운드 작업" }).count(), 0);
  process.stdout.write("PASS ordinary user cannot view admin jobs\n");
} catch (error) {
  process.stderr.write(
    `FAIL learning flows: ${error instanceof assert.AssertionError || error.name === "TimeoutError" ? error.message : (error.code ?? error.name)}\n`,
  );
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  for (const id of users) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      process.stderr.write("FAIL temporary learning account cleanup\n");
      process.exitCode = 1;
    } else process.stdout.write("CLEAN temporary learning account and fixtures removed\n");
  }
}
