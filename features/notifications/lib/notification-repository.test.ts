// Run with `npm run test:ui`. What the bell asks the database for and what it makes of the answers. Who may read or change
// which notification is decided by the database and covered by the SQL tests.
import { describe, expect, it } from "vitest";
import { createNotificationRepository, NOTIFICATION_LIMIT, toNotification, type NotificationsDb } from "./notification-repository";

type Answer = { data?: unknown; error?: { code?: string; message?: string } | null };

function fake(answer: Answer) {
  const queries: { table: string; ops: [string, unknown[]][] }[] = [];
  const db = {
    from: (table: string) => {
      const query = { table, ops: [] as [string, unknown[]][] };
      queries.push(query);
      const chain: unknown = new Proxy({}, {
        get(_t, prop) {
          if (prop === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve({ data: answer.data ?? null, error: answer.error ?? null }).then(resolve);
          return (...args: unknown[]) => { query.ops.push([String(prop), args]); return chain; };
        },
      });
      return chain;
    },
  };
  return { db: db as unknown as NotificationsDb, queries };
}
const opsOf = (q: { ops: [string, unknown[]][] }, name: string) => q.ops.filter(([o]) => o === name).map(([, a]) => a);
const row = (over: Record<string, unknown> = {}) => ({ id: 1, kind: "payment_needed", order_id: "o-1", payload: { number: "100002" }, created_at: "2026-10-13T11:00:00Z", read_at: null, resolved_at: null, ...over });

describe("toNotification", () => {
  it("maps a row, with read as a yes or no", () => {
    expect(toNotification(row())).toEqual({ id: 1, kind: "payment_needed", orderId: "o-1", payload: { number: "100002" }, createdAt: "2026-10-13T11:00:00Z", read: false, resolved: false });
    expect(toNotification(row({ read_at: "2026-10-13T12:00:00Z" }))?.read).toBe(true);
  });
  it("says whether it is resolved, apart from whether it was read", () => {
    expect(toNotification(row({ read_at: "2026-10-13T12:00:00Z", resolved_at: null }))).toMatchObject({ read: true, resolved: false });
    expect(toNotification(row({ read_at: "2026-10-13T12:00:00Z", resolved_at: "2026-10-13T12:00:00Z" }))).toMatchObject({ read: true, resolved: true });
    expect(toNotification({ ...row(), resolved_at: undefined } as never)?.resolved).toBe(false);
  });
  it("asks for the resolved time too", async () => {
    const { db, queries } = fake({ data: [] });
    await createNotificationRepository(db).list();
    expect(String(opsOf(queries[0], "select")[0][0])).toContain("resolved_at");
  });
  it("knows the warning that an order is about to expire", () => {
    expect(toNotification(row({ kind: "payment_expiring", payload: { number: "100002", deadline: "2026-10-13T11:30:00Z" } }))).toMatchObject({ kind: "payment_expiring", payload: { deadline: "2026-10-13T11:30:00Z" } });
  });
  it("knows the notice that a payment is waiting for an admin", () => {
    expect(toNotification(row({ kind: "payment_submitted", payload: { number: "100002", recipient: "Ana", total: 1 } }))).toMatchObject({ kind: "payment_submitted" });
  });
  it("leaves out a kind this version does not know, instead of showing it wrongly", () => {
    expect(toNotification(row({ kind: "something_new" }))).toBeNull();
  });
  it("treats a payload that is not an object as empty", () => {
    for (const payload of [null, "text", 5, [1, 2]]) expect(toNotification(row({ payload }))?.payload).toEqual({});
  });
  it("keeps a notification that has no order", () => {
    expect(toNotification(row({ order_id: null }))?.orderId).toBeNull();
  });
});

describe("list", () => {
  it("reads the newest notifications, at most the limit", async () => {
    const { db, queries } = fake({ data: [row(), row({ id: 2, kind: "payment_accepted" })] });
    const result = await createNotificationRepository(db).list();
    expect(result.ok && result.value.map((n) => n.id)).toEqual([1, 2]);
    expect(queries[0].table).toBe("notifications");
    expect(opsOf(queries[0], "order")).toEqual([["created_at", { ascending: false }], ["id", { ascending: false }]]);
    expect(opsOf(queries[0], "limit")).toEqual([[NOTIFICATION_LIMIT]]);
  });
  it("skips unknown kinds in the list", async () => {
    const result = await createNotificationRepository(fake({ data: [row(), row({ id: 2, kind: "x" })] }).db).list();
    expect(result.ok && result.value).toHaveLength(1);
  });
  it("is empty for none, and reports a failed read by its kind", async () => {
    expect(await createNotificationRepository(fake({ data: null }).db).list()).toEqual({ ok: true, value: [] });
    expect(await createNotificationRepository(fake({ error: { message: "Failed to fetch" } }).db).list()).toEqual({ ok: false, error: "network" });
    expect(await createNotificationRepository(fake({ error: { code: "42501", message: "permission denied" } }).db).list()).toEqual({ ok: false, error: "forbidden" });
    expect(await createNotificationRepository(fake({ error: { code: "XX000", message: "network exploded" } }).db).list()).toEqual({ ok: false, error: "unknown" });
  });
});

describe("marking read", () => {
  it("marks the given notifications read, only those not already read", async () => {
    const { db, queries } = fake({});
    expect(await createNotificationRepository(db).markRead([3, 4])).toEqual({ ok: true, value: null });
    const update = opsOf(queries[0], "update")[0][0] as { read_at: string };
    expect(Number.isNaN(Date.parse(update.read_at))).toBe(false);
    expect(opsOf(queries[0], "in")).toEqual([["id", [3, 4]]]);
    expect(opsOf(queries[0], "is")).toEqual([["read_at", null]]);
  });
  it("asks nothing for an empty list", async () => {
    const { db, queries } = fake({});
    expect(await createNotificationRepository(db).markRead([])).toEqual({ ok: true, value: null });
    expect(queries).toHaveLength(0);
  });
  it("marks every unread notification read", async () => {
    const { db, queries } = fake({});
    expect(await createNotificationRepository(db).markAllRead()).toEqual({ ok: true, value: null });
    expect(opsOf(queries[0], "is")).toEqual([["read_at", null]]);
    expect(opsOf(queries[0], "in")).toEqual([]);
  });
  it("reports a failure", async () => {
    expect(await createNotificationRepository(fake({ error: { message: "Failed to fetch" } }).db).markRead([1])).toEqual({ ok: false, error: "network" });
    expect(await createNotificationRepository(fake({ error: { message: "Failed to fetch" } }).db).markAllRead()).toEqual({ ok: false, error: "network" });
  });
});
