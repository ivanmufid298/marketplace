// Run with `npm run test:ui`. The numbers at the top of the admin dashboard, counted from the real orders: what was sold, and what
// waits for the admin. The orders are a fake database, or the sample store.
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminOrderServices } from "@/features/orders";
import { money } from "@/lib/format";
import { seedOrders, type Order } from "@/lib/mock/orders";
import { summarizeOrders } from "@/lib/order-flow";
import { resetOrders } from "@/lib/orders-store";
import { AdminProvider } from "../../providers/admin-provider";
import { DashboardMetrics } from "./dashboard-metrics";

const order = (over: Partial<Order>): Order => ({
  id: "x", number: "1", buyerId: "b", buyer: "B", phone: "1", address: "x", date: "1 Okt 2026", items: [{ productId: 1, qty: 1, price: 100000 }], shippingMethod: "Reguler", shippingFee: 10000, payment: "pending", received: false, history: [], ...over,
});
const services = (list: Order[] | "fail" | "never"): AdminOrderServices => ({
  repo: { listAllOrders: vi.fn(() => (list === "never" ? new Promise(() => undefined) : Promise.resolve(list === "fail" ? { ok: false as const, error: { kind: "network" as const } } : { ok: true as const, value: list }))) },
} as unknown as AdminOrderServices);
const mount = (s?: AdminOrderServices) => render(<AdminProvider orderServices={s}><DashboardMetrics /></AdminProvider>);
const card = (label: string) => screen.getByText(label).closest(".metric") as HTMLElement;

beforeEach(() => { window.localStorage.clear(); resetOrders(); vi.unstubAllEnvs(); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); });
afterEach(cleanup);

describe("the dashboard numbers from the database", () => {
  const list = [
    order({ id: "a", number: "1", payment: "success" }),
    order({ id: "b", number: "2", payment: "success", tracking: "JP1234567890" }),
    order({ id: "c", number: "3", payment: "pending" }),
    order({ id: "d", number: "4", payment: "success", cancelNote: "Rusak", refund: "pending" }),
  ];
  it("shows what was sold, how many proofs wait, how many orders are to ship, and the refunds owed", async () => {
    mount(services(list));
    await waitFor(() => expect(within(card("Total penjualan")).getByText("Rp220.000")).toBeTruthy());
    expect(within(card("Total penjualan")).getByText("Dari 2 pesanan yang sudah dibayar")).toBeTruthy();
    expect(within(card("Menunggu verifikasi")).getByText("1")).toBeTruthy();
    expect(within(card("Menunggu verifikasi")).getByText("Periksa bukti transfernya").className).toContain("down");
    expect(within(card("Perlu dikirim")).getByText("1")).toBeTruthy();
    expect(within(card("Perlu dikirim")).getByText("Serahkan ke kurir, lalu isi resi")).toBeTruthy();
    expect(within(card("Refund tertunda")).getByText("1")).toBeTruthy();
    expect(within(card("Refund tertunda")).getByText("Kembalikan dana ke pembeli")).toBeTruthy();
  });
  it("links the cards that can be acted on to the right screen", async () => {
    mount(services(list));
    await waitFor(() => expect(within(card("Perlu dikirim")).getByText("1")).toBeTruthy());
    expect(card("Menunggu verifikasi").getAttribute("href")).toBe("/admin/payments");
    expect(card("Perlu dikirim").getAttribute("href")).toBe("/admin/orders");
    expect(card("Refund tertunda").getAttribute("href")).toBe("/admin/orders");
    expect(card("Total penjualan").getAttribute("href")).toBeNull();
  });
  it("says there is nothing to do, without a warning, when nothing waits", async () => {
    mount(services([order({ payment: "success", tracking: "JP1234567890" })]));
    await waitFor(() => expect(within(card("Total penjualan")).getByText("Rp110.000")).toBeTruthy());
    for (const [label, text] of [["Menunggu verifikasi", "Tidak ada yang menunggu"], ["Perlu dikirim", "Semua sudah punya resi"], ["Refund tertunda", "Tidak ada refund"]]) {
      const note = within(card(label)).getByText(text);
      expect(note.className).not.toContain("down");
      expect(within(card(label)).getByText("0")).toBeTruthy();
    }
  });
  it("shows zero sales for a shop with no orders yet", async () => {
    mount(services([]));
    await waitFor(() => expect(within(card("Total penjualan")).getByText("Rp0")).toBeTruthy());
  });
  it("says it is loading rather than showing zeros", () => {
    mount(services("never"));
    expect(within(card("Total penjualan")).getByText("…")).toBeTruthy();
    expect(within(card("Total penjualan")).getByText("Memuat pesanan…")).toBeTruthy();
    expect(within(card("Perlu dikirim")).queryByText("0")).toBeNull();
  });
  it("keeps the numbers it has when a later read fails, instead of saying nothing could be loaded", async () => {
    const listAllOrders = vi.fn().mockResolvedValueOnce({ ok: true, value: [order({ payment: "success" })] }).mockResolvedValue({ ok: false, error: { kind: "network" } });
    mount({ repo: { listAllOrders } } as unknown as AdminOrderServices);
    await waitFor(() => expect(within(card("Total penjualan")).getByText("Rp110.000")).toBeTruthy());
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(listAllOrders).toHaveBeenCalledTimes(2));
    expect(within(card("Total penjualan")).getByText("Rp110.000")).toBeTruthy();
    expect(within(card("Total penjualan")).queryByText("Pesanan belum bisa dimuat")).toBeNull();
    expect(within(card("Total penjualan")).queryByText("Memuat pesanan…")).toBeNull();
  });
  it("keeps showing the numbers while they are read again", async () => {
    const listAllOrders = vi.fn().mockResolvedValueOnce({ ok: true, value: [order({ payment: "success" })] }).mockImplementation(() => new Promise(() => undefined));
    mount({ repo: { listAllOrders } } as unknown as AdminOrderServices);
    await waitFor(() => expect(within(card("Total penjualan")).getByText("Rp110.000")).toBeTruthy());
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(listAllOrders).toHaveBeenCalledTimes(2));
    expect(within(card("Total penjualan")).getByText("Rp110.000")).toBeTruthy();
    expect(within(card("Total penjualan")).queryByText("Memuat pesanan…")).toBeNull();
  });
  it("says the orders could not be loaded rather than showing zeros as if they were true", async () => {
    mount(services("fail"));
    await waitFor(() => expect(within(card("Total penjualan")).getByText("Pesanan belum bisa dimuat")).toBeTruthy());
    expect(within(card("Perlu dikirim")).getByText("…")).toBeTruthy();
    expect(within(card("Perlu dikirim")).queryByText("0")).toBeNull();
  });
});

describe("the dashboard numbers in the sample store", () => {
  it("counts the sample orders, ready at once", () => {
    const expected = summarizeOrders(seedOrders);
    mount();
    expect(within(card("Total penjualan")).getByText(money(expected.sales))).toBeTruthy();
    expect(within(card("Menunggu verifikasi")).getByText(String(expected.toReview))).toBeTruthy();
    expect(within(card("Perlu dikirim")).getByText(String(expected.toShip))).toBeTruthy();
    expect(expected.sales).toBeGreaterThan(0);
  });
});
