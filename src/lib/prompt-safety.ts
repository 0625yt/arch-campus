const RESERVED_PROMPT_TAG = /<\s*\/?\s*(user_input|user_metadata|user_scope|user_intent)\b[^>]*>/gi;

/**
 * Model-facing boundary tags are part of our control plane. A student file or
 * free-text field must never be able to close and reopen one of those tags.
 */
export function neutralizePromptBoundaryTags(value: string): string {
  return value.replace(RESERVED_PROMPT_TAG, (_match, tag: string) => `[${tag} tag removed]`);
}

/** Keep short metadata fields on one line and remove invisible control characters. */
export function sanitizePromptField(value: string, maxLength: number): string {
  return neutralizePromptBoundaryTags(value)
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
