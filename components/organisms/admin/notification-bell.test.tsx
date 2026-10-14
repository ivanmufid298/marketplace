// Run with `npm run test:ui`. The bell in the admin top bar against fake notifications: what it counts, what it lists,
// where choosing one goes, and what happens when the read fails or the panel keeps no notifications (the demo).
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/features/auth";
import { NotificationsProvider, type AppNotification, type NotificationServices } from "@/features/notifications";
import { AdminNotificationBell } from "./notification-bell";

const SESSION_KEY = "marketplace-demo-session-v1";
const submitted = (id: number, over: Partial<AppNotification> = {}): AppNotification => ({
  id, kind: "payment_submitted", orderId: `o-${id}`, payload: { number: String(100000 + id), recipient: "Ana Putri", total: 178000 },
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(), read: false, resolved: false, ...over,
});

function show(list: AppNotification[] | (() => Promise<unknown>), { signedIn = true, database = true } = {}) {
  if (signedIn) window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id: "siti", email: "siti@demo.test", name: "Siti Admin" }));
  const repo = {
    list: vi.fn(typeof list === "function" ? list : async () => ({ ok: true as const, value: list })),
    markRead: vi.fn(async () => ({ ok: true as const, value: null })),
    markAllRead: vi.fn(async () => ({ ok: true as const, value: null })),
  };
  render(
    <AuthProvider>
      <NotificationsProvider services={database ? ({ repo } as unknown as NotificationServices) : undefined}>
        <AdminNotificationBell />
        <p>elsewhere</p>
      </NotificationsProvider>
    </AuthProvider>,
  );
  return repo;
}
const bell = () => screen.getByRole("button", { name: /Notifikasi/ });
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

beforeEach(() => { window.localStorage.clear(); vi.unstubAllEnvs(); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); });
afterEach(cleanup);

describe("the admin bell", () => {
  it("counts the payments waiting to be checked that this admin has not read", async () => {
    show([submitted(1), submitted(2), submitted(3, { read: true })]);
    await waitFor(() => expect(bell().getAttribute("aria-label")).toBe("Notifikasi, 2 belum dibaca"));
    expect(bell().textContent).toContain("2");
  });

  it("says 9+ for ten or more, and shows no number when everything is read", async () => {
    show(Array.from({ length: 10 }, (_, i) => submitted(i + 1)));
    await waitFor(() => expect(bell().textContent).toContain("9+"));
    cleanup();
    show([submitted(1, { read: true })]);
    await flush();
    expect(bell().getAttribute("aria-label")).toBe("Notifikasi");
    expect(bell().textContent).toBe("");
  });

  it("ignores whatever else this account was told, such as a buyer's own order news", async () => {
    show([submitted(1), { ...submitted(2), kind: "payment_needed", payload: { number: "1" } }, { ...submitted(3), kind: "order_expired" }]);
    await waitFor(() => expect(bell().getAttribute("aria-label")).toBe("Notifikasi, 1 belum dibaca"));
    fireEvent.click(bell());
    expect(within(screen.getByRole("dialog")).getAllByRole("listitem")).toHaveLength(1);
  });

  it("lists each payment with the order, who sent it, the total, and how long ago", async () => {
    show([submitted(1)]);
    await flush();
    fireEvent.click(bell());
    const item = within(screen.getByRole("dialog")).getByRole("listitem");
    expect(item.textContent).toContain("Bukti pembayaran baru #100001");
    expect(item.textContent).toContain("Ana Putri mengirim bukti transfer Rp178.000. Periksa lalu terima atau tolak.");
    expect(item.textContent).toMatch(/5 menit/);
    expect(within(item).getByRole("link").getAttribute("href")).toBe("/admin/payments");
  });

  it("marks an unread one so, and opens the payments page from it, closing the panel", async () => {
    const repo = show([submitted(1), submitted(2, { read: true })]);
    await flush();
    fireEvent.click(bell());
    const items = within(screen.getByRole("dialog")).getAllByRole("listitem");
    expect(items[0].className).toContain("unread");
    expect(items[1].className).not.toContain("unread");
    fireEvent.click(within(items[0]).getByRole("link"));
    expect(repo.markRead).toHaveBeenCalledWith([1]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("marks everything read at once, only while there is something unread", async () => {
    const repo = show([submitted(1), submitted(2)]);
    await flush();
    fireEvent.click(bell());
    fireEvent.click(screen.getByRole("button", { name: "Tandai semua dibaca" }));
    expect(repo.markAllRead).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Tandai semua dibaca" })).toBeNull());
  });

  it("reads again when it is opened, without waiting for the next scheduled read", async () => {
    const repo = show([submitted(1)]);
    await flush();
    const before = repo.list.mock.calls.length;
    fireEvent.click(bell());
    await flush();
    expect(repo.list.mock.calls.length).toBeGreaterThan(before);
  });

  it("closes with Escape and when something else is clicked, and not when the panel itself is", async () => {
    show([submitted(1)]);
    await flush();
    fireEvent.click(bell());
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(bell());
    fireEvent.mouseDown(screen.getByText("elsewhere"));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(bell());
    fireEvent.click(bell());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says when there is nothing to check, while loading, and when the read failed (with a way to try again)", async () => {
    show([]);
    await flush();
    fireEvent.click(bell());
    expect(screen.getByText("Tidak ada pembayaran yang menunggu. Bukti transfer baru akan muncul di sini.")).toBeTruthy();
    cleanup();

    show(() => new Promise(() => {}));
    fireEvent.click(bell());
    expect(screen.getByRole("status").textContent).toContain("Memuat notifikasi");
    cleanup();

    const repo = show(async () => ({ ok: false as const, error: "network" as const }));
    await flush();
    fireEvent.click(bell());
    expect(screen.getByRole("alert").textContent).toContain("Notifikasi belum bisa dimuat.");
    const calls = repo.list.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    await flush();
    expect(repo.list.mock.calls.length).toBeGreaterThan(calls);
  });

  it("is the plain bell, with nothing to open, where the panel keeps no notifications or nobody is signed in", async () => {
    show([submitted(1)], { database: false });
    await flush();
    fireEvent.click(bell());
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();
    window.localStorage.clear();
    show([submitted(1)], { signedIn: false });
    await flush();
    fireEvent.click(bell());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(bell().getAttribute("aria-label")).toBe("Notifikasi");
  });
});
