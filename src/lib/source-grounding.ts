/** Locate in the actual source, preserving original offsets despite layout whitespace. */
export function createSourceLocator(source: string) {
  const positions: number[] = [];
  let compactSource = "";
  for (let offset = 0; offset < source.length; ) {
    const char = String.fromCodePoint(source.codePointAt(offset) ?? 0);
    if (!/[\s\p{P}\p{S}]/u.test(char)) {
      compactSource += char;
      for (let i = 0; i < char.length; i++) positions.push(offset);
    }
    offset += char.length;
  }
  const pageMarkers = [
    ...source.matchAll(
      /^(?:=== Page (\d+) ===|\[페이지 (\d+) [^\n]*\]|===== \[자료 \d+\][^\n]*)$/gm,
    ),
  ].map((match) => ({
    offset: match.index,
    page: match[1] || match[2] ? Number(match[1] || match[2]) : null,
  }));

  return (quote: string): { context: string; page: number | null; quote: string } | null => {
    const compactQuote = quote.replace(/[\s\p{P}\p{S}]/gu, "");
    if (compactQuote.length < 8) return null;
    const compactIndex = compactSource.indexOf(compactQuote);
    if (compactIndex < 0) return null;
    const index = positions[compactIndex];
    const lastOffset = positions[compactIndex + compactQuote.length - 1];
    const contentEnd =
      lastOffset + String.fromCodePoint(source.codePointAt(lastOffset) ?? 0).length;
    const punctuation = source.slice(contentEnd).match(/^[\p{P}\p{S}]+/u)?.[0] ?? "";
    const end = contentEnd + punctuation.length;
    // Repeated passages have no unambiguous page attribution.
    const repeated = compactSource.indexOf(compactQuote, compactIndex + 1) >= 0;
    const marker = pageMarkers.findLast((item) => item.offset <= index);
    const start = Math.max(0, index - 500);
    const stop = Math.min(source.length, end + 500);
    const lineStart = source.lastIndexOf("\n", start) + 1;
    const nextNewline = source.indexOf("\n", stop);
    const lineEnd = nextNewline < 0 ? source.length : nextNewline;
    return {
      context: source.slice(
        start - lineStart <= 500 ? lineStart : start,
        lineEnd - stop <= 500 ? lineEnd : stop,
      ),
      page: repeated ? null : (marker?.page ?? null),
      quote: source.slice(index, end),
    };
  };
}
