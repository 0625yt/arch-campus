/** Content identities for immutable generated output, including repeated identical lines.
 * Editable collections must assign an ID when an item is created instead.
 */
export function keyedItems<T>(items: readonly T[]): { item: T; key: string }[] {
  const occurrences = new Map<string, number>();
  return items.map((item) => {
    const content = JSON.stringify(item);
    const occurrence = occurrences.get(content) ?? 0;
    occurrences.set(content, occurrence + 1);
    return { item, key: `${content}:${occurrence}` };
  });
}
