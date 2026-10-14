// Run with `npm run test:ui`. The bell and the notifications panel against fake notifications: what is shown, how the buyer
// reaches the thing to do, and what happens when something goes wrong.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/features/auth";
import { CatalogProvider } from "@/features/catalog";
import type { AppNotification, NotificationServices } from "@/features/notifications";
import { OrdersProvider } from "@/features/orders";
import { UiProvider, useUi } from "@/shared/ui-state/ui-provider";
import { products } from "@/lib/mock/store";
import { StoreProvider, useStore } from "../../providers/store-provider";
import { NotificationBell } from "./notification-bell";
import { NotificationsPanel } from "./notifications-panel";

const SESSION_KEY = "marketplace-demo-session-v1";
const note = (id: number, over: Partial<AppNotification> = {}): AppNotification => ({
  id, kind: "payment_needed", orderId: "o", payload: { number: String(100000 + id), expires_at: "2026-10-13T08:30:00Z" }, createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), read: false, resolved: false, ...over,
});

function Probe() {
  const { panels } = useUi();
  return <p data-testid="open">{Object.entries(panels).filter(([, on]) => on).map(([k]) => k).join(",")}</p>;
}

/** Drives a checkout from outside, the way the shopper does. */
function Checkout() {
  const { addToCart, startCheckout, setAddressField, goCheckoutStep, closePanel, checkoutStep } = useStore();
  return (
    <>
      <button onClick={() => addToCart(products[0])}>add</button>
      <button onClick={() => startCheckout()}>start</button>
      <button onClick={() => { setAddressField("phone", "0811000111"); setAddressField("address", "Jl. Mawar 1"); setAddressField("city", "Jakarta"); setAddressField("postcode", "12345"); }}>fill</button>
      <button onClick={() => goCheckoutStep(2)}>to2</button>
      <button onClick={() => goCheckoutStep(3)}>to3</button>
      <button onClick={() => closePanel("checkout")}>closeCheckout</button>
      <p data-testid="step">{checkoutStep}</p>
    </>
  );
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
async function leaveCheckoutAt(step: 2 | 3) {
  fireEvent.click(screen.getByText("add")); await flush();
  fireEvent.click(screen.getByText("start")); await flush();
  fireEvent.click(screen.getByText("fill"));
  fireEvent.click(screen.getByText("to2"));
  if (step === 3) fireEvent.click(screen.getByText("to3"));
  fireEvent.click(screen.getByText("closeCheckout"));
}

function show(list: AppNotification[] | (() => Promise<unknown>), { signedIn = true, database = true } = {}) {
  if (signedIn) window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id: "nadia", email: "n@demo.test", name: "Nadia" }));
  const repo = {
    list: vi.fn(typeof list === "function" ? list : async () => ({ ok: true as const, value: list })),
    markRead: vi.fn(async () => ({ ok: true as const, value: null })),
    markAllRead: vi.fn(async () => ({ ok: true as const, value: null })),
  };
  render(
    <AuthProvider>
      <UiProvider>
        <CatalogProvider>
          <OrdersProvider>
            <StoreProvider notificationServices={database ? ({ repo } as unknown as NotificationServices) : undefined}>
              <NotificationBell />
              <NotificationsPanel />
              <Probe />
              <Checkout />
            </StoreProvider>
          </OrdersProvider>
        </CatalogProvider>
      </UiProvider>
    </AuthProvider>,
  );
  return repo;
}
const bell = () => screen.queryByRole("button", { name: /^Notifikasi/ });
const open = () => screen.getByTestId("open").textContent;
const panel = () => document.getElementById("notificationsPanel") as HTMLElement;

beforeEach(() => { window.localStorage.clear(); vi.unstubAllEnvs(); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); });
afterEach(cleanup);

describe("the bell", () => {
  it("shows how many notifications are unread", async () => {
    show([note(1), note(2), note(3, { read: true })]);
    await waitFor(() => expect(bell()?.getAttribute("aria-label")).toBe("Notifikasi, 2 belum dibaca"));
    expect(bell()!.querySelector(".count")!.textContent).toBe("2");
  });
  it("shows no number when everything is read", async () => {
    show([note(1, { read: true })]);
    await act(async () => {});
    expect(bell()?.getAttribute("aria-label")).toBe("Notifikasi");
    expect(bell()!.querySelector(".count")).toBeNull();
  });
  it("says 9+ for ten or more", async () => {
    show(Array.from({ length: 12 }, (_, i) => note(i + 1)));
    await waitFor(() => expect(bell()!.querySelector(".count")?.textContent).toBe("9+"));
  });
  it("shows exactly 9 as 9", async () => {
    show(Array.from({ length: 9 }, (_, i) => note(i + 1)));
    await waitFor(() => expect(bell()!.querySelector(".count")?.textContent).toBe("9"));
  });
  it("is not there for a signed-out visitor, or when notifications are off (the demo)", async () => {
    show([note(1)], { signedIn: false });
    await act(async () => {});
    expect(bell()).toBeNull();
    cleanup();
    show([note(1)], { database: false });
    await act(async () => {});
    expect(bell()).toBeNull();
  });
  it("opens the notifications panel", async () => {
    show([note(1)]);
    await waitFor(() => expect(bell()).not.toBeNull());
    fireEvent.click(bell()!);
    expect(open()).toBe("notifications");
  });
});

describe("the panel", () => {
  it("lists each notification with its words and how long ago it was, the unread ones marked", async () => {
    show([note(1), note(2, { kind: "payment_accepted", read: true, payload: { number: "100002" } })]);
    await waitFor(() => expect(within(panel()).getByText("Selesaikan pembayaran pesanan #100001")).toBeTruthy());
    expect(within(panel()).getByText("Kirim bukti transfer sebelum pukul 15.30 WIB, atau pesanan dibatalkan otomatis.")).toBeTruthy();
    expect(within(panel()).getByText("Pembayaran #100002 diterima")).toBeTruthy();
    expect(within(panel()).getAllByText("2 jam lalu")).toHaveLength(2);
    const items = panel().querySelectorAll(".notif");
    expect(items[0].className).toContain("unread");
    expect(items[0].className).toContain("urgent");
    expect(items[1].className).not.toContain("unread");
    expect(items[1].querySelector(".notif-dot")).toBeNull();
  });
  it("offers an action only on an unread notification that asks for something", async () => {
    show([note(1), note(2, { kind: "payment_accepted", payload: { number: "2" } }), note(3, { read: true })]);
    await waitFor(() => expect(within(panel()).getAllByRole("button", { name: "Unggah bukti", hidden: true })).toHaveLength(1));
  });
  it("says it is loading, shows an error with a retry, and says when there is nothing", async () => {
    show(() => new Promise(() => {}));
    expect(within(panel()).getByRole("status", { hidden: true }).textContent).toBe("Memuat notifikasi…");
    cleanup();
    const list = vi.fn().mockResolvedValueOnce({ ok: false, error: "network" }).mockResolvedValue({ ok: true, value: [note(1)] });
    show(list as never);
    expect((await within(panel()).findByRole("alert", { hidden: true })).textContent).toContain("Notifikasi belum bisa dimuat.");
    fireEvent.click(within(panel()).getByRole("button", { name: "Coba lagi", hidden: true }));
    expect(await within(panel()).findByText("Selesaikan pembayaran pesanan #100001")).toBeTruthy();
    cleanup();
    show([]);
    expect(await within(panel()).findByText(/Tidak ada notifikasi/)).toBeTruthy();
  });
  it("shows 'no notifications' when everything has been done, instead of the instructions that no longer apply", async () => {
    show([note(1, { read: true, resolved: true })]);
    expect(await within(panel()).findByText(/Tidak ada notifikasi/)).toBeTruthy();
    expect(within(panel()).queryByText(/Selesaikan pembayaran/)).toBeNull();
    expect(bell()!.querySelector(".count")).toBeNull();
  });
  it("still lists the news that is not an instruction, once read", async () => {
    show([note(1, { kind: "payment_accepted", payload: { number: "9" }, read: true }), note(2, { read: true, resolved: true })]);
    expect(await within(panel()).findByText("Pembayaran #9 diterima")).toBeTruthy();
    expect(within(panel()).queryByText(/Selesaikan pembayaran/)).toBeNull();
  });
  it("asks a signed-out visitor to sign in", () => {
    show([], { signedIn: false });
    expect(within(panel()).getByText("Masuk untuk melihat notifikasi.")).toBeTruthy();
  });
  it("reads again each time it is opened", async () => {
    const repo = show([note(1)]);
    await waitFor(() => expect(repo.list).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole("button", { name: /^Notifikasi/ }));
    await waitFor(() => expect(repo.list).toHaveBeenCalledTimes(2));
  });
  it("closes with its close button and by a click beside it", async () => {
    show([note(1)]);
    fireEvent.click(await screen.findByRole("button", { name: /^Notifikasi/ }));
    expect(open()).toBe("notifications");
    fireEvent.click(within(panel()).getByRole("button", { name: "Tutup", hidden: true }));
    expect(open()).toBe("");
    fireEvent.click(await screen.findByRole("button", { name: /^Notifikasi/ }));
    fireEvent.click(panel().querySelector(".overlay")!);
    expect(open()).toBe("");
  });
});

describe("choosing a notification", () => {
  it("marks it read, closes the panel, and opens Pesanan saya where the thing to do is", async () => {
    const repo = show([note(1)]);
    fireEvent.click(await screen.findByRole("button", { name: /^Notifikasi/ }));
    fireEvent.click(within(panel()).getByText("Selesaikan pembayaran pesanan #100001"));
    expect(open()).toBe("orders");
    await waitFor(() => expect(repo.markRead).toHaveBeenCalledWith([1]));
  });
  it("does the same from its action button", async () => {
    const repo = show([note(1)]);
    fireEvent.click(await screen.findByRole("button", { name: /^Notifikasi/ }));
    fireEvent.click(within(panel()).getByRole("button", { name: "Unggah bukti", hidden: true }));
    expect(open()).toBe("orders");
    await waitFor(() => expect(repo.markRead).toHaveBeenCalledWith([1]));
  });
  it("shows it as read in the list and drops the number on the bell", async () => {
    show([note(1), note(2)]);
    await waitFor(() => expect(bell()!.querySelector(".count")?.textContent).toBe("2"));
    fireEvent.click(screen.getByRole("button", { name: /^Notifikasi/ }));
    fireEvent.click(within(panel()).getByText("Selesaikan pembayaran pesanan #100001"));
    await waitFor(() => expect(bell()!.querySelector(".count")?.textContent).toBe("1"));
  });
});

describe("marking everything read", () => {
  it("is offered only while something is unread, and clears the number on the bell", async () => {
    const repo = show([note(1), note(2)]);
    await waitFor(() => expect(bell()!.querySelector(".count")?.textContent).toBe("2"));
    fireEvent.click(within(panel()).getByRole("button", { name: "Tandai semua dibaca", hidden: true }));
    await waitFor(() => expect(repo.markAllRead).toHaveBeenCalledTimes(1));
    expect(bell()!.querySelector(".count")).toBeNull();
    expect(within(panel()).queryByRole("button", { name: "Tandai semua dibaca", hidden: true })).toBeNull();
  });
  it("is not offered when everything is already read", async () => {
    show([note(1, { read: true })]);
    await waitFor(() => expect(within(panel()).getByText(/Selesaikan pembayaran/)).toBeTruthy());
    expect(within(panel()).queryByRole("button", { name: "Tandai semua dibaca", hidden: true })).toBeNull();
  });
});

describe("a checkout left half done", () => {
  it("puts a dot on the bell and a reminder at the top of the panel, naming the step it stopped at", async () => {
    show([]);
    await act(async () => {});
    expect(bell()!.querySelector(".count")).toBeNull(); // nothing to show yet
    await leaveCheckoutAt(3);
    await waitFor(() => expect(bell()?.getAttribute("aria-label")).toBe("Notifikasi, 1 belum dibaca"));
    expect(bell()!.querySelector(".count")!.textContent).toBe("1");
    const item = panel().querySelector("[data-kind='checkout_unfinished']")!;
    expect(item.className).toContain("unread");
    expect(item.className).toContain("urgent");
    expect(item.querySelector(".notif-dot")).not.toBeNull();
    expect(within(item as HTMLElement).getByText("Checkout belum selesai")).toBeTruthy();
    expect(within(item as HTMLElement).getByText("Tinggal unggah bukti transfer lalu buat pesanan. Tanpa itu pesananmu belum tercatat.")).toBeTruthy();
  });
  it("asks for the shipping step when that is where it stopped", async () => {
    show([]);
    await leaveCheckoutAt(2);
    const item = await waitFor(() => panel().querySelector("[data-kind='checkout_unfinished']") as HTMLElement);
    expect(within(item).getByText("Tinggal pilih pengiriman dan bayar untuk menyelesaikan pesananmu.")).toBeTruthy();
  });
  it("is counted with the unread notifications, and listed above them", async () => {
    show([note(1), note(2)]);
    await waitFor(() => expect(bell()!.querySelector(".count")?.textContent).toBe("2"));
    await leaveCheckoutAt(3);
    await waitFor(() => expect(bell()!.querySelector(".count")?.textContent).toBe("3"));
    const items = [...panel().querySelectorAll(".notif")];
    expect(items[0].getAttribute("data-kind")).toBe("checkout_unfinished");
    expect(items).toHaveLength(3);
  });
  it("is not cleared by marking everything read, since it is still unfinished", async () => {
    show([note(1)]);
    await waitFor(() => expect(bell()!.querySelector(".count")?.textContent).toBe("1"));
    await leaveCheckoutAt(3);
    await waitFor(() => expect(bell()!.querySelector(".count")?.textContent).toBe("2"));
    fireEvent.click(within(panel()).getByRole("button", { name: "Tandai semua dibaca", hidden: true }));
    await waitFor(() => expect(bell()!.querySelector(".count")?.textContent).toBe("1"));
    expect(panel().querySelector("[data-kind='checkout_unfinished']")).not.toBeNull();
  });
  it("shows the reminder instead of 'no notifications' when there is nothing else", async () => {
    show([]);
    await leaveCheckoutAt(3);
    await waitFor(() => expect(panel().querySelector("[data-kind='checkout_unfinished']")).not.toBeNull());
    expect(within(panel()).queryByText(/Tidak ada notifikasi/)).toBeNull();
  });
  it("reopens the checkout at the same step, and the reminder goes away, when chosen", async () => {
    show([]);
    await leaveCheckoutAt(3);
    fireEvent.click(await screen.findByRole("button", { name: /^Notifikasi/ }));
    expect(open()).toBe("notifications");
    fireEvent.click(within(panel()).getByRole("button", { name: "Lanjutkan checkout", hidden: true }));
    expect(open()).toBe("checkout");
    expect(screen.getByTestId("step").textContent).toBe("3");
    await waitFor(() => expect(bell()!.querySelector(".count")).toBeNull());
    expect(panel().querySelector("[data-kind='checkout_unfinished']")).toBeNull();
  });
  it("does the same from the whole reminder, not only its button", async () => {
    show([]);
    await leaveCheckoutAt(3);
    fireEvent.click(await screen.findByRole("button", { name: /^Notifikasi/ }));
    fireEvent.click(within(panel()).getByText("Checkout belum selesai"));
    expect(open()).toBe("checkout");
  });
  it("shows the bell in the demo too, while a checkout is half done, but not otherwise", async () => {
    show([], { database: false });
    await act(async () => {});
    expect(bell()).toBeNull();
    await leaveCheckoutAt(3);
    await waitFor(() => expect(bell()).not.toBeNull());
    expect(bell()!.querySelector(".count")!.textContent).toBe("1");
  });
});
