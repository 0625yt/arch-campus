import { afterEach, describe, expect, it, vi } from "vitest";
import webpush from "web-push";
import { getPushConfig } from "./push";

describe("VAPID configuration", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("requires a matching key pair and contact subject", () => {
    const keys = webpush.generateVAPIDKeys();
    vi.stubEnv("VAPID_PUBLIC_KEY", keys.publicKey);
    vi.stubEnv("VAPID_PRIVATE_KEY", keys.privateKey);
    vi.stubEnv("VAPID_SUBJECT", "mailto:support@example.com");
    expect(getPushConfig()).toEqual({ ...keys, subject: "mailto:support@example.com" });
    vi.stubEnv("VAPID_PRIVATE_KEY", webpush.generateVAPIDKeys().privateKey);
    expect(getPushConfig()).toBeNull();
    vi.stubEnv("VAPID_PRIVATE_KEY", keys.privateKey);
    vi.stubEnv("VAPID_SUBJECT", "http://localhost");
    expect(getPushConfig()).toBeNull();
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    expect(getPushConfig()).toBeNull();
  });
});
