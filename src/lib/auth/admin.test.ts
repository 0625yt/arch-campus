import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isAdminUserId } from "./admin";

describe("isAdminUserId", () => {
  beforeEach(() => {
    delete process.env.ADMIN_USER_IDS;
  });
  afterEach(() => {
    delete process.env.ADMIN_USER_IDS;
  });

  it("env 비어있으면 누구도 admin X", () => {
    expect(isAdminUserId("550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });

  it("화이트리스트 포함이면 true", () => {
    process.env.ADMIN_USER_IDS =
      "550e8400-e29b-41d4-a716-446655440000,660e8400-e29b-41d4-a716-446655440000";
    expect(isAdminUserId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isAdminUserId("660e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("포함 안 되면 false", () => {
    process.env.ADMIN_USER_IDS = "550e8400-e29b-41d4-a716-446655440000";
    expect(isAdminUserId("999e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });

  it("공백 있어도 trim", () => {
    process.env.ADMIN_USER_IDS =
      " 550e8400-e29b-41d4-a716-446655440000 ,  660e8400-e29b-41d4-a716-446655440000";
    expect(isAdminUserId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isAdminUserId("660e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("null/빈 입력은 false", () => {
    process.env.ADMIN_USER_IDS = "550e8400-e29b-41d4-a716-446655440000";
    expect(isAdminUserId(null)).toBe(false);
    expect(isAdminUserId("")).toBe(false);
  });
});
