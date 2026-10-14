// Run with `npm run test:ui`. The bell's notifications as a hook, against a fake: loading, reading again on a timer and when
// the tab comes back, marking read, and forgetting everything on sign-out.
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationServices } from "./lib/services";
import type { AppNotification, NotificationsResult } from "./lib/types";
import { POLL_MS, useNotifications } from "./use-notifications";

const note = (id: number, read = false): AppNotification => ({ id, kind: "payment_needed", orderId: "o", payload: { number: "1" }, createdAt: "2026-10-13T11:00:00Z", read });
const ok = <T,>(value: T): NotificationsResult<T> => ({ ok: true, value });

function fake(over: Partial<NotificationServices["repo"]> = {}) {
  const repo = {
    list: vi.fn(async (): Promise<NotificationsResult<AppNotification[]>> => ok([note(2), note(1, true)])),
    markRead: vi.fn(async (): Promise<NotificationsResult<null>> => ok(null)),
    markAllRead: vi.fn(async (): Promise<NotificationsResult<null>> => ok(null)),
    ...over,
  };
  return { services: { repo } as NotificationServices, repo };
}
const setVisibility = (state: "visible" | "hidden") => Object.defineProperty(document, "visibilityState", { value: state, configurable: true });

beforeEach(() => { vi.unstubAllEnvs(); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); setVisibility("visible"); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("loading", () => {
  it("is off, empty, and ready when there are no credentials and no fake", () => {
    const view = renderHook(() => useNotifications("u-1"));
    expect(view.result.current).toMatchObject({ database: false, status: "ready", notifications: [], unreadCount: 0 });
  });
  it("reads a signed-in buyer's notifications and counts the unread ones", async () => {
    const { services, repo } = fake();
    const view = renderHook(() => useNotifications("u-1", services));
    await waitFor(() => expect(view.result.current.notifications).toHaveLength(2));
    expect(view.result.current).toMatchObject({ database: true, status: "ready", unreadCount: 1, error: null });
    expect(repo.list).toHaveBeenCalledTimes(1);
  });
  it("starts out loading", () => {
    const { services } = fake({ list: () => new Promise(() => {}) });
    expect(renderHook(() => useNotifications("u-1", services)).result.current.status).toBe("loading");
  });
  it("reads nothing for a signed-out visitor", async () => {
    const { services, repo } = fake();
    const view = renderHook(() => useNotifications(null, services));
    await act(async () => {});
    expect(repo.list).not.toHaveBeenCalled();
    expect(view.result.current).toMatchObject({ status: "ready", notifications: [], unreadCount: 0 });
  });
  it("forgets the notifications when the buyer signs out", async () => {
    const { services } = fake();
    const view = renderHook(({ id }: { id: string | null }) => useNotifications(id, services), { initialProps: { id: "u-1" as string | null } });
    await waitFor(() => expect(view.result.current.notifications).toHaveLength(2));
    view.rerender({ id: null });
    await waitFor(() => expect(view.result.current.notifications).toEqual([]));
  });
  it("reports a failed read and keeps what it had", async () => {
    const list = vi.fn<NotificationServices["repo"]["list"]>().mockResolvedValueOnce(ok([note(1)])).mockResolvedValueOnce({ ok: false, error: "network" });
    const view = renderHook(() => useNotifications("u-1", fake({ list }).services));
    await waitFor(() => expect(view.result.current.notifications).toHaveLength(1));
    await act(async () => view.result.current.reload());
    await waitFor(() => expect(view.result.current.status).toBe("error"));
    expect(view.result.current).toMatchObject({ error: "network" });
    expect(view.result.current.notifications).toHaveLength(1);
  });
});

describe("staying up to date", () => {
  it("reads again every minute while the tab is in front", async () => {
    vi.useFakeTimers();
    const { services, repo } = fake();
    renderHook(() => useNotifications("u-1", services));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(repo.list).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS); });
    expect(repo.list).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 2); });
    expect(repo.list).toHaveBeenCalledTimes(4);
  });
  it("does not read while the tab is hidden, and reads at once when it comes back", async () => {
    vi.useFakeTimers();
    const { services, repo } = fake();
    renderHook(() => useNotifications("u-1", services));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    setVisibility("hidden");
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 3); });
    expect(repo.list).toHaveBeenCalledTimes(1);
    setVisibility("visible");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(0); });
    expect(repo.list).toHaveBeenCalledTimes(2);
  });
  it("does not read when the tab is hidden by a visibility change", async () => {
    const { services, repo } = fake();
    renderHook(() => useNotifications("u-1", services));
    await waitFor(() => expect(repo.list).toHaveBeenCalledTimes(1));
    setVisibility("hidden");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(repo.list).toHaveBeenCalledTimes(1);
  });
  it("stops reading when the buyer signs out", async () => {
    vi.useFakeTimers();
    const { services, repo } = fake();
    const view = renderHook(({ id }: { id: string | null }) => useNotifications(id, services), { initialProps: { id: "u-1" as string | null } });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    view.rerender({ id: null });
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 3); });
    expect(repo.list).toHaveBeenCalledTimes(1);
  });
});

describe("marking read", () => {
  it("shows a notification as read at once and tells the database", async () => {
    let finish: (r: NotificationsResult<null>) => void = () => {};
    const { services, repo } = fake({ markRead: vi.fn(() => new Promise<NotificationsResult<null>>((resolve) => { finish = resolve; })) });
    const view = renderHook(() => useNotifications("u-1", services));
    await waitFor(() => expect(view.result.current.unreadCount).toBe(1));
    let pending: Promise<void> | undefined;
    act(() => { pending = view.result.current.markRead(2); });
    expect(view.result.current.unreadCount).toBe(0);
    expect(view.result.current.notifications.find((n) => n.id === 2)?.read).toBe(true);
    await act(async () => { finish(ok(null)); await pending; });
    expect(repo.markRead).toHaveBeenCalledWith([2]);
    expect(repo.list).toHaveBeenCalledTimes(1);
  });
  it("shows the truth again when the database could not save it", async () => {
    const { services, repo } = fake({ markRead: async () => ({ ok: false, error: "network" }) });
    const view = renderHook(() => useNotifications("u-1", services));
    await waitFor(() => expect(view.result.current.unreadCount).toBe(1));
    await act(async () => { await view.result.current.markRead(2); });
    await waitFor(() => expect(repo.list).toHaveBeenCalledTimes(2));
    expect(view.result.current.unreadCount).toBe(1);
  });
  it("marks everything read, at once, and reads again if that could not be saved", async () => {
    const { services, repo } = fake();
    const view = renderHook(() => useNotifications("u-1", services));
    await waitFor(() => expect(view.result.current.unreadCount).toBe(1));
    await act(async () => { await view.result.current.markAllRead(); });
    expect(view.result.current.unreadCount).toBe(0);
    expect(repo.markAllRead).toHaveBeenCalledTimes(1);
    expect(repo.list).toHaveBeenCalledTimes(1);
    const failing = fake({ markAllRead: async () => ({ ok: false, error: "network" }) });
    const view2 = renderHook(() => useNotifications("u-1", failing.services));
    await waitFor(() => expect(view2.result.current.unreadCount).toBe(1));
    await act(async () => { await view2.result.current.markAllRead(); });
    await waitFor(() => expect(failing.repo.list).toHaveBeenCalledTimes(2));
    expect(view2.result.current.unreadCount).toBe(1);
  });
  it("does nothing without a database", async () => {
    const view = renderHook(() => useNotifications("u-1"));
    await act(async () => { await view.result.current.markRead(1); await view.result.current.markAllRead(); });
    expect(view.result.current.notifications).toEqual([]);
  });
});
