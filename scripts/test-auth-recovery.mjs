// Disposable account; real recovery token and browser form, without sending email.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const base = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3010");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
let id, browser;
try {
  const email = `arch-recovery-${randomUUID()}@example.invalid`;
  const password = randomBytes(24).toString("base64url");
  const nextPassword = randomBytes(24).toString("base64url");
  const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error) throw made.error;
  id = made.data.user.id;
  const profile = await admin
    .from("profiles")
    .update({
      display_name: "인증 검증",
      university: "검증 대학교",
      department: "검증 학과",
      year: 1,
    })
    .eq("id", id);
  if (profile.error) throw profile.error;

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(new URL("/auth/reset", base).href);
  await expect(page.getByRole("link", { name: "재설정 다시 요청하기" })).toBeVisible();
  process.stdout.write("PASS reset without a session shows recovery guidance\n");

  const link = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (link.error) throw link.error;
  const jar = new Map();
  const client = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [...jar.values()].map(({ name, value }) => ({ name, value })),
      setAll: (items) => {
        for (const item of items) jar.set(item.name, item);
      },
    },
  });
  const recovered = await client.auth.verifyOtp({
    type: "recovery",
    token_hash: link.data.properties.hashed_token,
  });
  if (recovered.error) throw recovered.error;
  const session = recovered.data.session;
  assert.ok(session);
  // The application uses PKCE cookies; implicit token fragments are a different flow.
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
  await page.goto(new URL("/auth/reset", base).href);
  await page.getByLabel("새 비밀번호", { exact: true }).fill(nextPassword);
  await page.getByLabel("비밀번호 확인", { exact: true }).fill(`${nextPassword}x`);
  await page.getByRole("button", { name: "비밀번호 바꾸고 들어가기" }).click();
  await expect(page.getByText("비밀번호 확인이 일치하지 않아요.")).toBeVisible();
  process.stdout.write("PASS mismatched password confirmation is rejected\n");
  await page.getByLabel("비밀번호 확인", { exact: true }).fill(nextPassword);
  await page.getByRole("button", { name: "비밀번호 바꾸고 들어가기" }).click();
  await page.waitForURL(`${base.origin}/dashboard`, { timeout: 30_000 });
  process.stdout.write("PASS real recovery session → password form → dashboard\n");

  const oldLogin = await client.auth.signInWithPassword({ email, password });
  assert.ok(oldLogin.error);
  const newLogin = await client.auth.signInWithPassword({ email, password: nextPassword });
  assert.ok(!newLogin.error && newLogin.data.user?.id === id);
  process.stdout.write("PASS old password denied and new password accepted\n");
  const reused = await client.auth.verifyOtp({
    type: "recovery",
    token_hash: link.data.properties.hashed_token,
  });
  assert.ok(reused.error);
  process.stdout.write("PASS recovery token cannot be reused\n");

  await context.clearCookies();
  await page.goto(new URL("/login?next=https://example.invalid", base).href);
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(nextPassword);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL(`${base.origin}/dashboard`, { timeout: 30_000 });
  process.stdout.write("PASS browser password login rejects an external next redirect\n");
} catch (error) {
  // Playwright error messages can include the token-bearing navigation URL.
  process.stderr.write(`FAIL auth recovery (${error.code ?? error.name})\n`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (id) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      process.stderr.write("FAIL temporary recovery account cleanup\n");
      process.exitCode = 1;
    } else process.stdout.write("CLEAN temporary recovery account removed\n");
  }
}
