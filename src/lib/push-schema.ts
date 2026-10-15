import { z } from "zod";

// Only browser vendors' push services can receive server requests.
export function isPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname;
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      url.pathname.length > 1 &&
      (host === "fcm.googleapis.com" ||
        host === "updates.push.services.mozilla.com" ||
        host === "web.push.apple.com" ||
        host.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}

export const PushEndpoint = z.string().max(2048).refine(isPushEndpoint);
const key = (bytes: number) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .length(Math.ceil((bytes * 4) / 3));

export const PushSubscriptionBody = z
  .object({
    endpoint: PushEndpoint,
    expirationTime: z.number().nonnegative().nullable().optional(),
    keys: z.object({ p256dh: key(65), auth: key(16) }).strict(),
  })
  .strict();

export const ReminderMinutes = z.number().int().min(0).max(10080).nullable();
