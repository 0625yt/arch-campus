const MAX_USER_INPUT = 60_000;

const INJECTION_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/<\/?user_input>/gi, ""],
  [/<\/?system>/gi, ""],
  [/<\|.*?\|>/g, ""],
  [/\[INST\]|\[\/INST\]/g, ""],
  [
    /(?:이전|기존|위의|모든)\s*(?:지침|규칙|시스템\s*프롬프트|instructions?)\s*(?:을|를)?\s*(?:무시|잊어|초기화|override|reset)/gi,
    "[redacted-injection]",
  ],
  [
    /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions?|prompts?)/gi,
    "[redacted-injection]",
  ],
  [/system\s*:\s*you\s+are\s+(?:now|a)/gi, "[redacted-injection]"],
];

export function sanitizeUserInput(raw: string): string {
  if (!raw) return "";
  let cleaned = raw.slice(0, MAX_USER_INPUT);
  // NUL byte는 한국어·일반 본문에 정상적으로 등장하지 않음. 파서가 깨진 바이너리를
  // 흘려보냈을 때 LLM 프롬프트가 깨질 수 있어 명시적으로 제거.
  cleaned = cleaned.replaceAll(String.fromCharCode(0), "");
  for (const [pattern, replacement] of INJECTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  return cleaned.trim();
}

export const PERSONAL_INFO_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b\d{6}-\d{7}\b/g, "[masked-rrn]"],
  [/\b01[016789]-?\d{3,4}-?\d{4}\b/g, "[masked-phone]"],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[masked-email]"],
  [/\b20\d{2}\d{4,8}\b/g, "[masked-studentid]"],
];

export function maskPersonalInfo(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PERSONAL_INFO_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export function sanitizeForPrompt(raw: string): string {
  return maskPersonalInfo(sanitizeUserInput(raw));
}
