/** Fetch until an empty page, including when the database caps pages below our request. */
export async function collectExportRows<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: unknown;
  }>,
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (;;) {
    const { data, error } = await fetchPage(rows.length, rows.length + pageSize - 1);
    if (error || !data) throw new Error("내보낼 데이터를 모두 읽지 못했어요.");
    if (data.length === 0) return rows;
    rows.push(...data);
  }
}
