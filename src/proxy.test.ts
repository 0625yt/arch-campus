import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    user: null as null | { id: string; factors: { status: string }[] },
    aal: "aal1",
    error: null as null | object,
  },
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: unknown,
    _key: unknown,
    options: {
      cookies: { setAll: (cookies: { name: string; value: string; options: object }[]) => void };
    },
  ) => ({
    auth: {
      getUser: async () => {
        options.cookies.setAll([
          { name: "refreshed-session", value: "fixture", options: { httpOnly: true } },
        ]);
        return { data: { user: state.user } };
      },
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: state.aal },
          error: state.error,
        }),
      },
    },
  }),
}));

import { proxy } from "./proxy";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "fixture");
  state.user = null;
  state.aal = "aal1";
  state.error = null;
});
describe("MFA page gate", () => {
  it("keeps refreshed cookies and query when redirecting to login", async () => {
    const r = await proxy(new NextRequest("https://campus.example/dashboard/study?semester=fall"));
    const u = new URL(r.headers.get("location")!);
    expect(u.pathname).toBe("/login");
    expect(u.searchParams.get("next")).toBe("/dashboard/study?semester=fall");
    expect(r.cookies.get("refreshed-session")?.value).toBe("fixture");
  });
  it("requires challenge for enrolled AAL1", async () => {
    state.user = { id: "a", factors: [{ status: "verified" }] };
    const r = await proxy(new NextRequest("https://campus.example/dashboard"));
    expect(new URL(r.headers.get("location")!).pathname).toBe("/auth/mfa");
    expect(r.cookies.get("refreshed-session")?.value).toBe("fixture");
  });
  it("leaves challenge reachable", async () => {
    state.user = { id: "a", factors: [{ status: "verified" }] };
    const r = await proxy(new NextRequest("https://campus.example/auth/mfa"));
    expect(r.headers.get("location")).toBeNull();
  });
  it("allows verified AAL2", async () => {
    state.user = { id: "a", factors: [{ status: "verified" }] };
    state.aal = "aal2";
    const r = await proxy(new NextRequest("https://campus.example/dashboard"));
    expect(r.headers.get("location")).toBeNull();
  });
  it("fails closed on assurance service failure", async () => {
    state.user = { id: "a", factors: [{ status: "verified" }] };
    state.error = {};
    const r = await proxy(new NextRequest("https://campus.example/dashboard"));
    expect(new URL(r.headers.get("location")!).pathname).toBe("/auth/mfa");
  });
});
