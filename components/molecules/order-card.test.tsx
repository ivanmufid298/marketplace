// Run with `npm run test:ui`. The status the buyer reads on an order in "Pesanan saya".
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Order } from "@/lib/mock/orders";
import { OrderCard } from "./order-card";

const order = (over: Partial<Order> = {}): Order => ({
  number: "837326", buyerId: "b", buyer: "B", phone: "1", address: "x", date: "13 Okt 2026", items: [], shippingMethod: "Reguler", shippingFee: 18000, payment: "pending", received: false, history: [], ...over,
});
const show = (o: Order) => render(<OrderCard order={o} products={[]} reviews={{}} onSaveReview={() => true} onComplete={vi.fn()} />);
afterEach(cleanup);

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
  it("says the goods are on their way, done, or cancelled", () => {
    show(order({ payment: "success" }));
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
