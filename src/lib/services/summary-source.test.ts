import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  download: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("@/lib/parsers", () => ({ parseDocument: mocks.parse }));
vi.mock("@/lib/storage", () => ({ downloadMaterialFile: mocks.download }));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminSupabase: () => ({ from: () => ({ update: mocks.update }) }),
}));

import { restoreSummarySource } from "./summary-source";

const input = {
  ownerId: "owner-a",
  materialId: "material",
  title: "기존 자료",
  text: "이전에 잘린 원문",
  pageCount: 100,
  originalFile: { storagePath: "owner-a/material.pdf", mimeType: "application/pdf" },
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.eq.mockReturnValue({ eq: mocks.eq, error: null });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.download.mockResolvedValue(new Uint8Array([1]));
  mocks.parse.mockResolvedValue({
    text: "완전한 원문",
    sanitizedText: "=== Page 100 ===\n완전한 원문",
    pageCount: 100,
    warnings: [],
  });
});
it("re-extracts legacy source from the owner-scoped original PDF", async () => {
  expect((await restoreSummarySource(input))?.pageCount).toBe(100);
  expect(mocks.download).toHaveBeenCalledWith("owner-a/material.pdf");
  expect(mocks.eq).toHaveBeenCalledWith("owner_id", "owner-a");
});
it("rejects a storage path outside the owner boundary before reading it", async () => {
  await expect(
    restoreSummarySource({
      ...input,
      originalFile: { ...input.originalFile, storagePath: "owner-b/private.pdf" },
    }),
  ).rejects.toThrow("소유권");
  expect(mocks.download).not.toHaveBeenCalled();
});
it("does not re-read PDFs that already have complete page markers", async () => {
  expect(
    await restoreSummarySource({ ...input, text: "=== Page 1 ===\n원문", pageCount: 1 }),
  ).toBeNull();
  expect(mocks.download).not.toHaveBeenCalled();
});
