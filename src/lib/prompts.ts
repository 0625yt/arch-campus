import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROMPT_DIR = join(process.cwd(), "src/prompts");
const SHARED_DIR = join(PROMPT_DIR, "_shared");

const cache = new Map<string, string>();

function read(path: string): string {
  const cached = cache.get(path);
  if (cached !== undefined) return cached;
  const text = readFileSync(path, "utf8");
  cache.set(path, text);
  return text;
}

export type PromptName = "summarize" | "quiz" | "presentation";

export function loadPrompt(name: PromptName): string {
  const persona = read(join(SHARED_DIR, "persona-schema.md"));
  const master = read(join(SHARED_DIR, "master-rules.md"));
  const tool = read(join(PROMPT_DIR, `${name}.md`));
  return [persona, master, tool].join("\n\n---\n\n");
}
