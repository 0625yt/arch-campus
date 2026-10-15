import "server-only";
import { sendReminderPush } from "@/lib/push";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

type Delivery = Database["public"]["Tables"]["push_reminder_deliveries"]["Row"];

async function finish(delivery: Delivery, outcome: "sent" | "retry" | "failed") {
  const { data, error } = await getAdminSupabase().rpc("finish_push_reminder", {
    p_id: delivery.id,
    p_owner_id: delivery.owner_id,
    p_lease_token: delivery.lease_token as string,
    p_outcome: outcome,
  });
  if (error || !data) throw new Error("Could not settle push delivery");
}

export async function dispatchPushReminders(ownerId?: string) {
  const admin = getAdminSupabase();
  const { data, error } = await admin.rpc("claim_push_reminders", { p_owner_id: ownerId ?? null });
  if (error) throw new Error("Could not claim push deliveries");
  const counts = { sent: 0, retried: 0, closed: 0 };
  for (const delivery of data) {
    // Recheck edits, deletion and consent immediately before making an external request.
    const [eventResult, subscriptionResult] = await Promise.all([
      admin
        .from("events")
        .select("starts_at, reminder_minutes, confirmed, recurrence_rule")
        .eq("id", delivery.event_id)
        .eq("owner_id", delivery.owner_id)
        .maybeSingle(),
      admin
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("id", delivery.subscription_id)
        .eq("owner_id", delivery.owner_id)
        .maybeSingle(),
    ]);
    if (eventResult.error || subscriptionResult.error) {
      await finish(delivery, "retry");
      counts.retried++;
      continue;
    }
    const event = eventResult.data;
    const subscription = subscriptionResult.data;
    if (
      !event ||
      !subscription ||
      !event.confirmed ||
      event.recurrence_rule ||
      Date.parse(event.starts_at) !== Date.parse(delivery.starts_at) ||
      event.reminder_minutes !== delivery.reminder_minutes ||
      Date.parse(delivery.due_at) < Date.now() - 600_000
    ) {
      // Deletion cascades may already have removed the leased delivery.
      if (event && subscription) await finish(delivery, "failed");
      counts.closed++;
      continue;
    }
    try {
      await sendReminderPush(subscription, delivery.id);
    } catch (error) {
      const status =
        typeof error === "object" && error !== null && "statusCode" in error
          ? Number(error.statusCode)
          : 0;
      if (status === 404 || status === 410) {
        const { error: removeError } = await admin
          .from("push_subscriptions")
          .delete()
          .eq("id", delivery.subscription_id)
          .eq("owner_id", delivery.owner_id);
        if (removeError) throw new Error("Could not remove expired push subscription");
        counts.closed++;
      } else {
        const retry = status === 0 || status === 429 || status >= 500;
        await finish(delivery, retry ? "retry" : "failed");
        if (retry) counts.retried++;
        else counts.closed++;
      }
      continue;
    }
    // Settlement failures must not be confused with a rejected provider request.
    await finish(delivery, "sent");
    counts.sent++;
  }
  return counts;
}
