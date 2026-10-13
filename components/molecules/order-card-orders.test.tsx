// Run with `npm run test:ui`. A database order as the buyer reads it: the copy of each product as it was bought, the price
// that was paid, and sending the transfer proof for an order that has none.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Order } from "@/lib/mock/orders";
import type { Product } from "@/lib/mock/store";
import { OrderCard } from "./order-card";

const photo = { src: "https://cdn.test/a-400.webp", srcSet: "https://cdn.test/a-400.webp 400w", alt: "Tas", width: null, height: null };
const order = (over: Partial<Order> = {}): Order => ({
  id: "o-1", number: "100002", buyerId: "b", buyer: "B", phone: "1", address: "x", date: "13 Okt 2026", shippingMethod: "Reguler", shippingFee: 18000, payment: "pending", received: false, history: [],
  items: [{ productId: 1, qty: 2, price: 189000, name: "Longchamp (waktu dibeli)", photos: [photo] }], ...over,
});
const catalog: Product[] = [{ id: 1, name: "Longchamp (nama baru)", cat: "Fashion", price: 250000, stock: 1, desc: "", photos: [] }];
const show = (o: Order, extra: Partial<Parameters<typeof OrderCard>[0]> = {}) => render(<OrderCard order={o} products={catalog} reviews={{}} onSaveReview={() => true} onComplete={vi.fn()} {...extra} />);
afterEach(cleanup);

describe("the items", () => {
  it("shows each product as it was bought, not as it is now: name, price paid, and its photo", () => {
    show(order());
    expect(screen.getByText("Longchamp (waktu dibeli)")).toBeTruthy();
    expect(screen.queryByText("Longchamp (nama baru)")).toBeNull();
    expect(screen.getByText(/2 barang · Rp189\.000/)).toBeTruthy();
    expect(document.querySelector(".order-thumb img")!.getAttribute("src")).toBe("https://cdn.test/a-400.webp");
  });
  it("still shows an item whose product has since been removed from the shop", () => {
    show(order({ items: [{ productId: 0, qty: 1, price: 5000, name: "Barang lama", photos: [] }] }));
    expect(screen.getByText("Barang lama")).toBeTruthy();
    expect(document.querySelector(".order-thumb img")).toBeNull();
  });
  it("shows a sample order's item with the price paid, not today's catalog price", () => {
    show(order({ items: [{ productId: 1, qty: 1, price: 189000 }] }));
    expect(screen.getByText("Longchamp (nama baru)")).toBeTruthy();
    expect(screen.getByText(/1 barang · Rp189\.000/)).toBeTruthy();
    expect(screen.queryByText(/Rp250\.000/)).toBeNull();
  });
  it("skips a sample item that is in no catalog", () => {
    show(order({ items: [{ productId: 99, qty: 1, price: 1 }] }));
    expect(screen.queryByText(/1 barang/)).toBeNull();
  });
  it("adds the shipping fee to the total from the prices paid", () => {
    show(order());
    expect(screen.getByText("Rp396.000")).toBeTruthy(); // 2 x 189.000 + 18.000
  });
});

describe("sending proof for an order that awaits it", () => {
  const awaiting = () => order({ awaitingProof: true, canSendProof: true, payBefore: "2026-10-13T08:30:00Z" });
  it("offers the upload with the deadline in Jakarta time", () => {
    show(awaiting(), { onSendProof: vi.fn() });
    expect(screen.getByText("Unggah bukti transfer")).toBeTruthy();
    expect(screen.getByText("Bayar dan kirim bukti sebelum pukul 15.30 WIB.")).toBeTruthy();
    expect(screen.getByText("Menunggu pembayaran")).toBeTruthy();
  });
  it("sends the chosen file", () => {
    const onSendProof = vi.fn();
    show(awaiting(), { onSendProof });
    const file = new File(["x"], "bukti.png", { type: "image/png" });
    fireEvent.change(document.querySelector('.upload input[type="file"]')!, { target: { files: [file] } });
    expect(onSendProof).toHaveBeenCalledWith(file);
  });
  it("shows that it is sending, and ignores another file meanwhile", () => {
    const onSendProof = vi.fn();
    show(awaiting(), { onSendProof, sendingProof: true });
    expect(screen.getByText("Mengirim bukti…")).toBeTruthy();
    fireEvent.change(document.querySelector('.upload input[type="file"]')!, { target: { files: [new File(["x"], "b.png", { type: "image/png" })] } });
    expect(onSendProof).not.toHaveBeenCalled();
  });
  it("does not offer the upload when proof was already sent, when the order expired, or when sending is not possible", () => {
    show(order({ awaitingProof: undefined, canSendProof: undefined }), { onSendProof: vi.fn() });
    expect(screen.queryByText("Unggah bukti transfer")).toBeNull();
    cleanup();
    show(order({ expired: true }), { onSendProof: vi.fn() });
    expect(screen.queryByText("Unggah bukti transfer")).toBeNull();
    expect(screen.getByText("Kedaluwarsa")).toBeTruthy();
    cleanup();
    show(awaiting());
    expect(screen.queryByText("Unggah bukti transfer")).toBeNull();
  });
  it("only accepts proof formats the database takes", () => {
    show(awaiting(), { onSendProof: vi.fn() });
    expect(document.querySelector('.upload input[type="file"]')!.getAttribute("accept")).toBe(".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf");
  });
});

describe("a rejected proof", () => {
  const rejected = () => order({ payment: "failed", rejectionReason: "Nominal salah", canSendProof: true, payBefore: "2026-10-13T08:30:00Z" });
  it("tells the buyer why, says the payment was rejected, and offers a new upload with the new deadline", () => {
    show(rejected(), { onSendProof: vi.fn() });
    expect(screen.getByText("Pembayaran ditolak")).toBeTruthy();
    expect(screen.getByText("Bukti ditolak: Nominal salah")).toBeTruthy();
    expect(screen.getByText("Unggah bukti transfer")).toBeTruthy();
    expect(screen.getByText("Bayar dan kirim bukti sebelum pukul 15.30 WIB.")).toBeTruthy();
  });
  it("offers no new upload once the window has closed, but still shows the reason", () => {
    show(order({ payment: "failed", rejectionReason: "Nominal salah" }), { onSendProof: vi.fn() });
    expect(screen.getByText("Bukti ditolak: Nominal salah")).toBeTruthy();
    expect(screen.queryByText("Unggah bukti transfer")).toBeNull();
  });
  it("shows no reason line for an order that was not rejected", () => {
    show(order(), { onSendProof: vi.fn() });
    expect(screen.queryByText(/Bukti ditolak/)).toBeNull();
  });
});
