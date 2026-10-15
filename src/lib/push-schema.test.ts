import { describe, expect, it } from "vitest";
import { isPushEndpoint, PushSubscriptionBody, ReminderMinutes } from "./push-schema";

describe("push endpoints", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/test",
    "https://updates.push.services.mozilla.com/wpush/v2/test",
    "https://web.push.apple.com/test",
    "https://wns2.notify.windows.com/test",
  ])("allows browser service %s", (endpoint) => {
    expect(isPushEndpoint(endpoint)).toBe(true);
  });
  it.each([
    "http://fcm.googleapis.com/test",
    "https://localhost/test",
    "https://169.254.169.254/test",
    "https://fcm.googleapis.com.evil.test/send",
    "https://evil.test/redirect",
    "https://evil@fcm.googleapis.com/test",
    "https://fcm.googleapis.com:444/test",
    "https://fcm.googleapis.com/test#secret",
    "https://fcm.googleapis.com/",
    "invalid",
  ])("rejects SSRF or invalid service %s", (endpoint) => {
    expect(isPushEndpoint(endpoint)).toBe(false);
  });
  it("rejects extra owner fields and malformed keys", () => {
    const body = {
      endpoint: "https://fcm.googleapis.com/test",
      keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
    };
    expect(PushSubscriptionBody.safeParse(body).success).toBe(true);
    expect(PushSubscriptionBody.safeParse({ ...body, owner_id: "other" }).success).toBe(false);
    expect(
      PushSubscriptionBody.safeParse({ ...body, keys: { ...body.keys, auth: "bad" } }).success,
    ).toBe(false);
  });
  it("accepts disabled and bounded reminders but rejects fractions and out of range", () => {
    for (const value of [null, 0, 10, 10080])
      expect(ReminderMinutes.safeParse(value).success).toBe(true);
    for (const value of [-1, 10081, 0.5, "10"])
      expect(ReminderMinutes.safeParse(value).success).toBe(false);
  });
});
