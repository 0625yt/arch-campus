import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDocumentProxy } = vi.hoisted(() => ({ getDocumentProxy: vi.fn() }));

vi.mock("unpdf", () => ({ getDocumentProxy }));

import { extractTimetableGrid } from "./pdf-grid";

function item(str: string, x: number, y: number) {
  return { str, transform: [1, 0, 0, 1, x, y], width: 20, height: 10 };
}

function page(items: ReturnType<typeof item>[]) {
  return {
    getTextContent: vi.fn().mockResolvedValue({ items }),
  };
}

describe("extractTimetableGrid", () => {
  beforeEach(() => {
    getDocumentProxy.mockReset();
  });

  it("keeps PDF pages isolated and selects the page with actual timetable cells", async () => {
    const noisePage = page([
      item("월", 100, 700),
      item("화", 200, 700),
      item("수", 300, 700),
      item("1교시", 20, 650),
      item("[09:00~09:50]", 20, 640),
      // 다음 페이지의 실제 강의와 좌표가 같아도 섞이면 안 된다.
      item("학사안내 잡음", 110, 620),
    ]);
    const timetablePage = page([
      item("월", 100, 700),
      item("화", 200, 700),
      item("수", 300, 700),
      item("목", 400, 700),
      item("금", 500, 700),
      item("1교시", 20, 650),
      item("[09:00~09:50]", 20, 640),
      item("데이터구조", 110, 620),
      item("공학관 401", 110, 608),
      item("2교시", 20, 590),
      item("[10:00~10:50]", 20, 580),
      item("글로컬 영어", 210, 560),
    ]);

    getDocumentProxy.mockResolvedValue({
      numPages: 2,
      getPage: vi.fn(async (number: number) => (number === 1 ? noisePage : timetablePage)),
    });

    const result = await extractTimetableGrid(new Uint8Array([1, 2, 3]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.grid.page).toBe(2);
    expect(result.markdown).toContain("데이터구조");
    expect(result.markdown).toContain("글로컬 영어");
    expect(result.markdown).not.toContain("학사안내 잡음");
  });

  it("does not mutate or detach the caller-owned byte array", async () => {
    getDocumentProxy.mockImplementation(async (received: Uint8Array) => {
      structuredClone(received.buffer, { transfer: [received.buffer] });
      return { numPages: 0, getPage: vi.fn() };
    });
    const bytes = new Uint8Array([1, 2, 3, 4]);

    await extractTimetableGrid(bytes);

    expect(bytes.byteLength).toBe(4);
  });

  it("rejects a single numeric artifact under weekday-looking guide headers", async () => {
    const guidePage = page([
      item("월", 100, 700),
      item("화", 200, 700),
      item("수", 300, 700),
      item("목", 400, 700),
      item("금", 500, 700),
      item("24교시", 20, 650),
      item("- 4 -", 210, 620),
    ]);
    getDocumentProxy.mockResolvedValue({
      numPages: 1,
      getPage: vi.fn().mockResolvedValue(guidePage),
    });

    const result = await extractTimetableGrid(new Uint8Array([1, 2, 3]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no-rows");
  });
});
