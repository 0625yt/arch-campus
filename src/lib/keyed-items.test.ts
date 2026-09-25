import { describe, expect, it } from "vitest";
import { keyedItems } from "./keyed-items";

describe("immutable output identity", () => {
  it("keeps identity when an earlier distinct result is removed", () => {
    const before = keyedItems(["A", "B", "C"]);
    expect(keyedItems(["B", "C"]).map((x) => x.key)).toEqual(before.slice(1).map((x) => x.key));
  });
  it("does not collide for repeated generated lines", () => {
    const keys = keyedItems(["A", "A", "B"]).map((x) => x.key);
    expect(new Set(keys).size).toBe(3);
  });
});
