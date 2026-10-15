import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  send: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  results: {} as Record<string, { data: unknown; error: unknown }>,
  filters: [] as unknown[][],
  remove: vi.fn(),
}));
vi.mock("@/lib/push", () => ({ sendReminderPush: mocks.send }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: mocks.admin }));

import { dispatchPushReminders } from "./push-reminders";

const delivery = {
  id: "delivery",
  owner_id: "owner-a",
  event_id: "event",
  subscription_id: "subscription",
  starts_at: new Date().toISOString(),
  reminder_minutes: 10,
  due_at: new Date().toISOString(),
  lease_token: "lease",
};
describe("push reminder dispatch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.filters = [];
    mocks.results = {
      events: {
        data: {
          starts_at: delivery.starts_at,
          reminder_minutes: 10,
          confirmed: true,
          recurrence_rule: null,
        },
        error: null,
      },
      push_subscriptions: {
        data: { endpoint: "endpoint", p256dh: "key", auth: "auth" },
        error: null,
      },
    };
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "claim_push_reminders"
        ? { data: [delivery], error: null }
        : { data: true, error: null },
    );
    mocks.admin.mockReturnValue({ rpc: mocks.rpc, from: mocks.from });
    mocks.from.mockImplementation((table: string) => {
      let deleting = false;
      const query = {
        select: () => query,
        delete: () => {
          deleting = true;
          mocks.remove(table);
          return query;
        },
        eq: (...args: unknown[]) => {
          mocks.filters.push([table, ...args]);
          return query;
        },
        maybeSingle: async () => mocks.results[table],
        // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally awaitable.
        then: (resolve: (result: unknown) => unknown) =>
          Promise.resolve(deleting ? { error: null } : mocks.results[table]).then(resolve),
      };
      return query;
    });
    mocks.send.mockResolvedValue(undefined);
  });
  it("sends only a current owner-scoped reminder and settles the exact lease", async () => {
    expect(await dispatchPushReminders("owner-a")).toEqual({ sent: 1, retried: 0, closed: 0 });
    expect(mocks.filters).toContainEqual(["events", "owner_id", "owner-a"]);
    expect(mocks.filters).toContainEqual(["push_subscriptions", "owner_id", "owner-a"]);
    expect(mocks.rpc).toHaveBeenCalledWith("finish_push_reminder", {
      p_id: "delivery",
      p_owner_id: "owner-a",
      p_lease_token: "lease",
      p_outcome: "sent",
    });
  });
  it.each([
    { reminder_minutes: null },
    { confirmed: false },
    { starts_at: "2020-01-01T00:00:00Z" },
    { recurrence_rule: "FREQ=DAILY" },
  ])("does not send after the schedule changes: %j", async (patch) => {
    mocks.results.events.data = { ...(mocks.results.events.data as object), ...patch };
    expect(await dispatchPushReminders()).toMatchObject({ closed: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not send after consent or the event is deleted", async () => {
    mocks.results.push_subscriptions.data = null;
    expect(await dispatchPushReminders()).toMatchObject({ closed: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalledWith("finish_push_reminder", expect.anything());
  });
  it.each([404, 410])("removes an expired subscription for HTTP %i", async (statusCode) => {
    mocks.send.mockRejectedValue({ statusCode });
    expect(await dispatchPushReminders()).toMatchObject({ closed: 1 });
    expect(mocks.remove).toHaveBeenCalledWith("push_subscriptions");
    expect(mocks.filters).toContainEqual(["push_subscriptions", "owner_id", "owner-a"]);
  });
  it.each([429, 503, 0])(
    "retries a transient failure %i within the persisted limit",
    async (statusCode) => {
      mocks.send.mockRejectedValue({ statusCode });
      expect(await dispatchPushReminders()).toMatchObject({ retried: 1 });
      expect(mocks.rpc).toHaveBeenCalledWith(
        "finish_push_reminder",
        expect.objectContaining({ p_outcome: "retry" }),
      );
    },
  );
  it("closes permanent provider rejection without an endless retry", async () => {
    mocks.send.mockRejectedValue({ statusCode: 400 });
    expect(await dispatchPushReminders()).toMatchObject({ closed: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "finish_push_reminder",
      expect.objectContaining({ p_outcome: "failed" }),
    );
  });
  it("does not send when the current event cannot be verified", async () => {
    mocks.results.events = { data: null, error: { message: "unavailable" } };
    expect(await dispatchPushReminders()).toMatchObject({ retried: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
