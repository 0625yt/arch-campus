#!/usr/bin/env node
// Anthropic·Google SDK 직접 호출 ping. Gateway 미사용.
// 사용: node --env-file=.env.local scripts/ping-gemini.mjs

import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";

async function ping(label, model) {
  try {
    const result = await generateText({
      model,
      maxOutputTokens: 30,
      messages: [{ role: "user", content: "한 단어로만 답해: 안녕" }],
    });
    console.log(`\x1b[32m✓\x1b[0m ${label} → "${result.text.trim()}" (${result.finishReason})`);
    return true;
  } catch (e) {
    console.log(`\x1b[31m✗\x1b[0m ${label} 실패`);
    console.log(`  ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

const a = await ping("Anthropic Haiku 4.5", anthropic("claude-haiku-4-5"));
const g = await ping("Google Gemini 2.5 Flash", google("gemini-2.5-flash"));

process.exit(a && g ? 0 : 1);
