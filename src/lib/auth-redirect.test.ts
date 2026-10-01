import { describe, expect, it } from "vitest";
import { safeAuthRedirect } from "./auth-redirect";

describe("authentication return paths", () => {
  it.each([
    undefined,
    null,
    "",
    "https://example.com",
    "//example.com",
    "javascript:alert(1)",
    "/\\example.com",
    "/%5cexample.com",
    "/%2fexample.com",
    "/\n/example.com",
    "/%0a/example.com",
    "/%broken",
  ])("rejects unsafe destination %s", (value) => {
    expect(safeAuthRedirect(value)).toBe("/dashboard");
  });
  it.each([
    "/",
    "/dashboard/study",
    "/dashboard/calendar?view=week#today",
    "/dashboard/study/%EA%B3%BC%EB%AA%A9",
  ])("preserves app destination %s", (value) => {
    expect(safeAuthRedirect(value)).toBe(value);
  });
});
