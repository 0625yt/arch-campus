/** Preserve every source character and absolute page markers. Bound both text and page count. */
export function splitSummarySource(text: string, maxChars = 50_000, maxPages = 8): string[] {
  const pages = text.split(/(?=^=== Page \d+ ===$)/m).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  let pageCount = 0;
  for (const page of pages) {
    const marker = page.match(/^=== Page \d+ ===/m)?.[0];
    if (current && (current.length + page.length > maxChars || pageCount >= maxPages)) {
      chunks.push(current);
      current = "";
      pageCount = 0;
    }
    if (page.length > maxChars) {
      let remaining = page;
      while (remaining.length > maxChars) {
        const boundary = remaining.lastIndexOf("\n", maxChars);
        const end = boundary > maxChars / 2 ? boundary + 1 : maxChars;
        chunks.push(remaining.slice(0, end));
        remaining = (marker ? `${marker}\n` : "") + remaining.slice(end);
      }
      current = remaining;
      pageCount = 1;
    } else {
      current += page;
      pageCount += marker ? 1 : 0;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [text];
}

export function sourcePages(text: string): number[] {
  return [...new Set([...text.matchAll(/^=== Page (\d+) ===$/gm)].map((m) => Number(m[1])))];
}
