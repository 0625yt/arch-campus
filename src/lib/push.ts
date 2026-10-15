import "server-only";
import { createECDH } from "node:crypto";
import webpush from "web-push";
import { PushSubscriptionBody } from "./push-schema";

export function getPushConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  try {
    const contact = new URL(subject);
    if (!["mailto:", "https:"].includes(contact.protocol)) return null;
    if (contact.protocol === "mailto:" && !contact.pathname.includes("@")) return null;
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(privateKey, "base64url"));
    if (ecdh.getPublicKey().toString("base64url") !== publicKey) return null;
    return { publicKey, privateKey, subject };
  } catch {
    return null;
  }
}

export async function sendReminderPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  deliveryId: string,
) {
  const config = getPushConfig();
  if (!config) throw new Error("Push configuration unavailable");
  const validated = PushSubscriptionBody.parse({
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  });
  // Lock screens and shared devices must not reveal course names or event contents.
  await webpush.sendNotification(
    validated,
    JSON.stringify({
      title: "arch-campus",
      body: "알림을 설정한 일정이 있어요. 캘린더에서 확인해 주세요.",
      url: "/dashboard/calendar",
      tag: `reminder-${deliveryId}`,
    }),
    {
      vapidDetails: config,
      TTL: 600,
      timeout: 5000,
      urgency: "normal",
      topic: deliveryId.replaceAll("-", ""),
    },
  );
}
