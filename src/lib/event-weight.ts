/** Keep only weights traceable to an explicit percentage or score denominator. */
export function supportedEventWeight(weight: number | null, source: string): number | null {
  if (weight === null) return null;
  const supported: number[] = [];
  for (const match of source.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|퍼센트)/g)) {
    supported.push(Number(match[1]));
  }
  for (const match of source.matchAll(
    /(?:총\s*)?(\d+(?:\.\d+)?)\s*점\s*(?:만점\s*)?(?:중|에서)\s*(\d+(?:\.\d+)?)\s*점/g,
  )) {
    const total = Number(match[1]);
    if (total > 0) supported.push((Number(match[2]) / total) * 100);
  }
  for (const match of source.matchAll(/(\d+(?:\.\d+)?)\s*점\s*\/\s*(\d+(?:\.\d+)?)\s*점/g)) {
    const total = Number(match[2]);
    if (total > 0) supported.push((Number(match[1]) / total) * 100);
  }
  return supported.some((value) => value >= 0 && value <= 100 && Math.abs(value - weight) < 0.01)
    ? weight
    : null;
}
