import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let id, dir;
try {
  const email = `arch-browser-${randomUUID()}@example.invalid`,
    password = randomBytes(24).toString("base64url");
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  id = created.data.user.id;
  const profile = await admin
    .from("profiles")
    .update({
      display_name: "검증 사용자",
      university: "검증 대학교",
      department: "검증 학과",
      year: 1,
    })
    .eq("id", id);
  if (profile.error) throw profile.error;
  const jar = new Map();
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => [...jar.values()].map(({ name, value }) => ({ name, value })),
      setAll: (items) => {
        for (const { name, value, options } of items) jar.set(name, { name, value, ...options });
      },
    },
  });
  const auth = await client.auth.signInWithPassword({ email, password });
  if (auth.error) throw auth.error;
  dir = await mkdtemp(join(tmpdir(), "arch-browser-"));
  const statePath = join(dir, "state.json");
  const base = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3010");
  await writeFile(
    statePath,
    JSON.stringify({
      cookies: [...jar.values()].map((c) => ({
        name: c.name,
        value: c.value,
        domain: base.hostname,
        path: c.path ?? "/",
        expires: -1,
        httpOnly: Boolean(c.httpOnly),
        secure: base.protocol === "https:",
        sameSite: "Lax",
      })),
      origins: [],
    }),
    { mode: 0o600 },
  );
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "node_modules/@playwright/test/cli.js",
        "test",
        "e2e/responsive-accessibility.spec.ts",
        "--grep",
        "로그인 후",
        "--workers=2",
      ],
      { stdio: "inherit", env: { ...process.env, E2E_STORAGE_STATE: statePath } },
    );
    child.on("error", reject);
    child.on("exit", resolve);
  });
  if (exitCode !== 0) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`FAIL authenticated browser setup (${error.code ?? error.name})\n`);
  process.exitCode = 1;
} finally {
  if (id) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      process.stderr.write("FAIL temporary browser account cleanup\n");
      process.exitCode = 1;
    } else process.stdout.write("CLEAN temporary browser account removed\n");
  }
  if (dir) await rm(dir, { recursive: true, force: true });
}
