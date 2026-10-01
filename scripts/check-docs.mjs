import { access, readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const files = [
  "README.md",
  "CLAUDE.md",
  "docs/STATUS.md",
  "docs/NEXT-STEPS.md",
  "docs/ARCHITECTURE.md",
  "docs/PROMPTS.md",
  "docs/audit/2026-10-01-prompt-quality.md",
  "docs/audit/2026-09-17-feature-audit.md",
  "docs/audit/2026-09-22-hardening.md",
];
for (const entry of await readdir("src/prompts", { recursive: true })) {
  if (entry.endsWith(".md")) files.push(`src/prompts/${entry}`);
}
let count = 0,
  failures = 0;
for (const file of files) {
  const source = (await readFile(file, "utf8"))
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]*`/g, "");
  for (const match of source.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].split("#")[0];
    // Absolute application routes in prompt examples are not filesystem links.
    if (!target || target.startsWith("/") || /^[a-z]+:/i.test(target)) continue;
    count++;
    try {
      await access(resolve(dirname(file), target));
    } catch {
      failures++;
      process.stderr.write(`Broken link: ${file} → ${target}\n`);
    }
  }
}
process.stdout.write(`${count} documentation links checked; ${failures} broken\n`);
process.exitCode = failures ? 1 : 0;
