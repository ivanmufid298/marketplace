// Run with `npm run test:ui`. "Pesanan saya" against a database-backed orders module (a fake): refreshing when opened,
// loading, failing, an empty list, and sending proof for an order that awaits it.
import { AddressesProvider } from "@/features/account";
import { CheckoutProvider } from "@/features/checkout";
import { CartProvider } from "@/features/cart";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/features/auth";
import { CatalogProvider } from "@/features/catalog";
import { OrdersProvider, type OrderServices } from "@/features/orders";
import type { Order } from "@/lib/mock/orders";
import { UiProvider, useUi } from "@/shared/ui-state/ui-provider";
import { OrdersPanel } from "./orders-panel";

const SESSION_KEY = "marketplace-demo-session-v1";
const awaiting = (): Order => ({
  id: "o-1", number: "100002", buyerId: "nadia", buyer: "N", phone: "1", address: "x", date: "13 Okt 2026", shippingMethod: "Reguler", shippingFee: 18000, payment: "pending", received: false, history: [],
  awaitingProof: true, canSendProof: true, payBefore: "2026-10-13T08:30:00Z", items: [{ productId: 1, qty: 1, price: 189000, name: "Longchamp", photos: [] }],
});

function Controls() {
  const { openPanel, closePanel } = useUi();
  return <><button onClick={() => openPanel("orders")}>open</button><button onClick={() => closePanel("orders")}>close</button></>;
}

function setup(repoOver: Partial<OrderServices["repo"]> = {}, signedIn = true) {
  if (signedIn) window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id: "nadia", email: "n@demo.test", name: "Nadia" }));
  const repo = {
    listShippingMethods: vi.fn(async () => ({ ok: true as const, value: [] })),
    listMyOrders: vi.fn(async () => ({ ok: true as const, value: [awaiting()] })),
    placeOrder: vi.fn(),
    sendProof: vi.fn(async () => ({ ok: true as const, value: null })),
    ...repoOver,
  };
  render(
    <AuthProvider><UiProvider><CatalogProvider><OrdersProvider services={{ repo } as unknown as OrderServices}><CartProvider><AddressesProvider><CheckoutProvider><Controls /><OrdersPanel /></CheckoutProvider></AddressesProvider></CartProvider></OrdersProvider></CatalogProvider></UiProvider></AuthProvider>,
  );
  return repo;
}
const open = () => fireEvent.click(screen.getByRole("button", { name: "open" }));

beforeEach(() => {
  window.localStorage.clear();
  vi.unstubAllEnvs();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
});
afterEach(cleanup);

describe("refreshing", () => {
  it("reads the orders again each time the panel is opened, and not while it is closed", async () => {
    const repo = setup();
    await waitFor(() => expect(repo.listMyOrders).toHaveBeenCalledTimes(1));
    open();
    await waitFor(() => expect(repo.listMyOrders).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "close" }));
    await act(async () => {});
    expect(repo.listMyOrders).toHaveBeenCalledTimes(2);
    open();
    await waitFor(() => expect(repo.listMyOrders).toHaveBeenCalledTimes(3));
  });
  it("reads nothing for a signed-out visitor", async () => {
    const repo = setup({}, false);
    open();
    await act(async () => {});
    expect(repo.listMyOrders).not.toHaveBeenCalled();
  });
});

describe("the list", () => {
  it("says it is loading while there is nothing to show yet", async () => {
    setup({ listMyOrders: () => new Promise(() => {}) });
    expect(screen.getByText("Memuat pesanan…")).toBeTruthy();
  });
  it("shows an error with a retry that reads again", async () => {
    const listMyOrders = vi.fn<OrderServices["repo"]["listMyOrders"]>().mockResolvedValueOnce({ ok: false, error: { kind: "network" } }).mockResolvedValueOnce({ ok: true, value: [awaiting()] });
    setup({ listMyOrders });
    const alert = await screen.findByRole("alert", { hidden: true });
    expect(alert.textContent).toContain("Pesanan belum bisa dimuat.");
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi", hidden: true }));
    expect(await screen.findByText("Order #MKP-100002")).toBeTruthy();
  });
  it("says there are no orders yet", async () => {
    setup({ listMyOrders: async () => ({ ok: true, value: [] }) });
    expect(await screen.findByText("Kamu belum punya pesanan.")).toBeTruthy();
  });
  it("shows an order with the status for a missing proof", async () => {
    setup();
    expect(await screen.findByText("Menunggu pembayaran")).toBeTruthy();
    expect(screen.getByText("Longchamp")).toBeTruthy();
  });
});

describe("sending proof", () => {
  const choose = () => fireEvent.change(document.querySelector('.upload input[type="file"]')!, { target: { files: [new File(["x"], "bukti.png", { type: "image/png" })] } });
  it("sends the file for that order, says so while it is sending, and thanks the buyer", async () => {
    let finish: (v: { ok: true; value: null }) => void = () => {};
    const repo = setup({ sendProof: vi.fn(() => new Promise((resolve) => { finish = resolve as never; })) as never });
    await screen.findByText("Menunggu pembayaran");
    choose();
    expect(await screen.findByText("Mengirim bukti…")).toBeTruthy();
    expect(repo.sendProof).toHaveBeenCalledWith("o-1", expect.any(File));
    await act(async () => finish({ ok: true, value: null }));
    await waitFor(() => expect(screen.queryByText("Mengirim bukti…")).toBeNull());
  });
  it("offers no upload for an order that already has its proof", async () => {
    setup({ listMyOrders: async () => ({ ok: true, value: [{ ...awaiting(), awaitingProof: undefined, canSendProof: undefined }] }) });
    await screen.findByText("Order #MKP-100002");
    expect(screen.queryByText("Unggah bukti transfer")).toBeNull();
    expect(screen.getByText("Sedang diverifikasi")).toBeTruthy();
  });
});
