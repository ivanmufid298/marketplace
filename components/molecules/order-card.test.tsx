// Run with `npm run test:ui`. The status the buyer reads on an order in "Pesanan saya".
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Order } from "@/lib/mock/orders";
import { OrderCard } from "./order-card";

const order = (over: Partial<Order> = {}): Order => ({
  number: "837326", buyerId: "b", buyer: "B", phone: "1", address: "x", date: "13 Okt 2026", items: [], shippingMethod: "Reguler", shippingFee: 18000, payment: "pending", received: false, history: [], ...over,
});
const show = (o: Order) => render(<OrderCard order={o} products={[]} reviews={{}} onSaveReview={() => true} onComplete={vi.fn()} />);
afterEach(cleanup);

describe("the tracking number on an order card", () => {
  it("shows the number with the courier's service once the order has one", () => {
    show(order({ payment: "success", shippingMethod: "SICEPAT REG", tracking: "JP1234567890" }));
    expect(screen.getByText("Nomor resi")).toBeTruthy();
    expect(screen.getByText("JP1234567890")).toBeTruthy();
    expect(screen.getByText("SICEPAT REG")).toBeTruthy();
  });
  it("shows nothing about it before then", () => {
    show(order({ payment: "success" }));
    expect(screen.queryByText("Nomor resi")).toBeNull();
    expect(screen.queryByRole("button", { name: "Salin" })).toBeNull();
  });
  it("copies the number, says so for a moment, and then offers to copy again", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    show(order({ payment: "success", tracking: "JP1234567890" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Salin" })); });
    expect(writeText).toHaveBeenCalledWith("JP1234567890");
    expect(screen.getByRole("button", { name: "Tersalin" })).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(1999); });
    expect(screen.getByRole("button", { name: "Tersalin" })).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(screen.getByRole("button", { name: "Salin" })).toBeTruthy();
    vi.useRealTimers();
  });
  it("does not fail when the browser cannot copy: the number stays on screen", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn(async () => { throw new Error("denied"); }) }, configurable: true });
    show(order({ payment: "success", tracking: "JP1234567890" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Salin" })); });
    expect(screen.getByRole("button", { name: "Salin" })).toBeTruthy();
    expect(screen.getByText("JP1234567890")).toBeTruthy();
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Salin" })); });
    expect(screen.getByText("JP1234567890")).toBeTruthy();
  });
});

describe("the status on an order card", () => {
  it("says the proof is being verified once it was uploaded, not that payment is awaited", () => {
    show(order());
    expect(screen.getByText("Sedang diverifikasi")).toBeTruthy();
    expect(screen.queryByText("Menunggu pembayaran")).toBeNull();
  });
  it("says payment is awaited only while no proof was sent", () => {
    show(order({ awaitingProof: true }));
    expect(screen.getByText("Menunggu pembayaran")).toBeTruthy();
    expect(screen.queryByText("Sedang diverifikasi")).toBeNull();
  });
  it("says the payment was rejected", () => {
    show(order({ payment: "failed" }));
    expect(screen.getByText("Pembayaran ditolak")).toBeTruthy();
  });
  it("says a paid order is being prepared until it has a tracking number, then that it is on its way", () => {
    show(order({ payment: "success" }));
    expect(screen.getByText("Pembayaran diterima, pesanan disiapkan")).toBeTruthy();
    expect(screen.queryByText("Barang sedang dikirim")).toBeNull();
    cleanup();
    show(order({ payment: "success", tracking: "JP1234567890" }));
    expect(screen.getByText("Barang sedang dikirim")).toBeTruthy();
    expect(screen.queryByText("Pembayaran diterima, pesanan disiapkan")).toBeNull();
  });
  it("still lets the buyer finish a paid order that is being prepared", () => {
    show(order({ payment: "success" }));
    expect(screen.getByRole("button", { name: "Pesanan selesai" })).toBeTruthy();
  });
  it("says the goods are on their way, done, or cancelled", () => {
    show(order({ payment: "success", tracking: "JP1234567890" }));
    expect(screen.getByText("Barang sedang dikirim")).toBeTruthy();
    cleanup();
    show(order({ payment: "success", received: true }));
    expect(screen.getByText("Selesai")).toBeTruthy();
    cleanup();
    show(order({ cancelNote: "x" }));
    expect(screen.getByText("Dibatalkan")).toBeTruthy();
  });
  it("colours each state apart: amber to wait, blue while checking, red when rejected", () => {
    const pill = () => document.querySelector(".pill")!.className;
    show(order({ awaitingProof: true }));
    expect(pill()).toContain("pending");
    cleanup();
    show(order());
    expect(pill()).toContain("progress");
    cleanup();
    show(order({ payment: "failed" }));
    expect(pill()).toContain("danger");
  });
});
