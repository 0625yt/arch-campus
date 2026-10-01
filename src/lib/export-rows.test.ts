import { describe, expect, it, vi } from "vitest";
import { collectExportRows } from "./export-rows";

describe("export pagination", () => {
  it("exports more than the database row limit, including smaller capped pages", async () => {
    const source = Array.from({ length: 1207 }, (_, id) => ({ id }));
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: source.slice(from, Math.min(to + 1, from + 200)),
      error: null,
    }));
    expect(await collectExportRows(fetchPage)).toEqual(source);
    expect(fetchPage.mock.calls.at(-1)?.[0]).toBe(1207);
  });

  it("fails instead of delivering a partial backup when a later page is unavailable", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: 1 }], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
    await expect(collectExportRows(fetchPage)).rejects.toThrow();
  });

  it("handles an empty collection", async () => {
    expect(await collectExportRows(async () => ({ data: [], error: null }))).toEqual([]);
  });
});
