// Run with `npm run test:ui`. The admin's payments and order screens against database-backed orders (a fake): what the
// admin can decide, what the buyer will be told, and what the admin hears when the database says no.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminOrderServices } from "@/features/orders";
import type { Order } from "@/lib/mock/orders";
import { resetOrders } from "@/lib/orders-store";
import { AdminProvider, useAdmin } from "../../providers/admin-provider";
import { OrderDetailModal } from "./order-detail-modal";
import { OrdersManager } from "./orders-manager";
import { PaymentsPanel } from "./payments-panel";

const base = (over: Partial<Order>): Order => ({
  id: "x", number: "1", buyerId: "b", buyer: "Pembeli", phone: "0811", address: "Jl. A", date: "13 Okt 2026", items: [{ productId: 1, qty: 2, price: 100000, name: "Tas (waktu dibeli)", photos: [] }],
  shippingMethod: "Reguler", shippingFee: 18000, payment: "pending", received: false, history: [], proofs: [], ...over,
});
const reviewable = base({ id: "o-a", number: "100001", buyer: "Ana", proofs: [{ objectKey: "orders/o-a/1.png", mime: "image/png", size: 2048, at: "13 Okt 2026, 18.05" }, { objectKey: "orders/o-a/2.png", mime: "image/png", size: 4096, at: "13 Okt 2026, 18.40" }] });
const noProof = base({ id: "o-b", number: "100002", buyer: "Budi", awaitingProof: true, canSendProof: true });
const paid = base({ id: "o-c", number: "100003", buyer: "Cici", payment: "success", proofs: [{ objectKey: "orders/o-c/1.png", mime: "image/png", size: 10, at: "x" }] });
const expired = base({ id: "o-d", number: "100004", buyer: "Dedi", expired: true });
const cancelledUnpaid = base({ id: "o-e", number: "100005", buyer: "Eka", cancelNote: "Batal" });

const okNull = async () => ({ ok: true as const, value: null });
function fake(orders: Order[], over: Partial<AdminOrderServices["repo"]> = {}) {
  const repo = {
    listAllOrders: vi.fn<AdminOrderServices["repo"]["listAllOrders"]>(async () => ({ ok: true as const, value: orders })),
    acceptPayment: vi.fn(okNull), rejectPayment: vi.fn(okNull), cancelOrder: vi.fn(okNull), markRefunded: vi.fn(okNull), setTrackingNumber: vi.fn(okNull),
    proofLink: vi.fn(async () => ({ ok: true as const, value: "https://signed.test/proof" })),
    ...over,
  };
  return { services: { repo } as unknown as AdminOrderServices, repo };
}

function Toast() {
  const { toast } = useAdmin();
  return <p data-testid="toast">{toast}</p>;
}
function show(services: AdminOrderServices, ui: React.ReactNode = <PaymentsPanel />) {
  render(<AdminProvider orderServices={services}>{ui}<Toast /></AdminProvider>);
}
const rowOf = (id: string) => screen.getByText(`#${id}`).closest("tr")!;
const toast = () => screen.getByTestId("toast").textContent;

beforeEach(() => { window.localStorage.clear(); resetOrders(); vi.unstubAllEnvs(); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("the payments list", () => {
  it("says it is loading, then lists each payment with its buyer", async () => {
    let finish: (v: { ok: true; value: Order[] }) => void = () => {};
    show(fake([], { listAllOrders: () => new Promise((resolve) => { finish = resolve as never; }) }).services);
    expect(screen.getByRole("status").textContent).toBe("Memuat pesanan…");
    finish({ ok: true, value: [reviewable] });
    expect(await screen.findByText("Ana")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("offers accept and reject only for a payment whose proof is waiting; the others say why not", async () => {
    show(fake([reviewable, noProof, paid]).services);
    await screen.findByText("Ana");
    expect(within(rowOf("MKP-100001")).getByRole("button", { name: "Terima" })).toBeTruthy();
    expect(within(rowOf("MKP-100001")).getByRole("button", { name: "Tolak" })).toBeTruthy();
    expect(within(rowOf("MKP-100002")).getByText("Belum ada bukti")).toBeTruthy();
    expect(within(rowOf("MKP-100002")).queryByRole("button", { name: "Terima" })).toBeNull();
    expect(within(rowOf("MKP-100003")).queryByRole("button", { name: "Terima" })).toBeNull();
  });
  it("leaves out an order that ran out of time or was cancelled before any money, but keeps a paid one", async () => {
    show(fake([reviewable, expired, cancelledUnpaid, { ...paid, cancelNote: "Barang rusak" }]).services);
    await screen.findByText("Ana");
    expect(screen.queryByText("Dedi")).toBeNull();
    expect(screen.queryByText("Eka")).toBeNull();
    expect(screen.getByText("Cici")).toBeTruthy();
  });
  it("shows an error with a retry that reads again", async () => {
    // The screen reads once when the provider starts and once when it opens, so the first two reads fail.
    const listAllOrders = vi.fn().mockResolvedValueOnce({ ok: false, error: { kind: "network" } }).mockResolvedValueOnce({ ok: false, error: { kind: "network" } }).mockResolvedValue({ ok: true, value: [reviewable] });
    show(fake([], { listAllOrders }).services);
    expect((await screen.findByRole("alert")).textContent).toContain("Pesanan belum bisa dimuat.");
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(await screen.findByText("Ana")).toBeTruthy();
  });
  it("reads the orders again when the screen opens", async () => {
    const { services, repo } = fake([reviewable]);
    show(services);
    await screen.findByText("Ana");
    expect((repo.listAllOrders as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("accepting", () => {
  it("accepts the order's proof and says so", async () => {
    const { services, repo } = fake([reviewable]);
    show(services);
    await screen.findByText("Ana");
    fireEvent.click(within(rowOf("MKP-100001")).getByRole("button", { name: "Terima" }));
    await waitFor(() => expect(toast()).toBe("Pembayaran diterima"));
    expect(repo.acceptPayment).toHaveBeenCalledWith("o-a");
  });
  it("tells the admin when the database says it is no longer waiting for a decision", async () => {
    const { services } = fake([reviewable], { acceptPayment: async () => ({ ok: false, error: { kind: "notReviewable" } }) as never });
    show(services);
    await screen.findByText("Ana");
    fireEvent.click(within(rowOf("MKP-100001")).getByRole("button", { name: "Terima" }));
    await waitFor(() => expect(toast()).toBe("Pembayaran ini tidak sedang menunggu pemeriksaan. Muat ulang daftar."));
  });
  it("tells an admin whose account is not one", async () => {
    const { services } = fake([reviewable], { acceptPayment: async () => ({ ok: false, error: { kind: "forbidden" } }) as never });
    show(services);
    await screen.findByText("Ana");
    fireEvent.click(within(rowOf("MKP-100001")).getByRole("button", { name: "Terima" }));
    await waitFor(() => expect(toast()).toBe("Akun ini bukan admin. Masuk sebagai admin."));
  });
});

describe("rejecting", () => {
  const open = async (services: AdminOrderServices) => {
    show(services);
    await screen.findByText("Ana");
    fireEvent.click(within(rowOf("MKP-100001")).getByRole("button", { name: "Tolak" }));
    return screen.getByRole("dialog", { name: "Tolak pembayaran" });
  };
  it("asks why first: a reason is needed before the button works", async () => {
    const { services, repo } = fake([reviewable]);
    const dialog = await open(services);
    const confirm = within(dialog).getByRole("button", { name: "Tolak pembayaran" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Alasan penolakan"), { target: { value: "   " } });
    expect(confirm.disabled).toBe(true);
    expect(repo.rejectPayment).not.toHaveBeenCalled();
  });
  it("sends the trimmed reason, closes, and says so", async () => {
    const { services, repo } = fake([reviewable]);
    const dialog = await open(services);
    fireEvent.change(within(dialog).getByLabelText("Alasan penolakan"), { target: { value: "  Nominal salah  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Tolak pembayaran" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(repo.rejectPayment).toHaveBeenCalledWith("o-a", "Nominal salah");
    expect(toast()).toBe("Pembayaran ditolak");
  });
  it("stays open and explains when the database refuses, so the reason is not lost", async () => {
    const { services } = fake([reviewable], { rejectPayment: async () => ({ ok: false, error: { kind: "network" } }) as never });
    const dialog = await open(services);
    fireEvent.change(within(dialog).getByLabelText("Alasan penolakan"), { target: { value: "Nominal salah" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Tolak pembayaran" }));
    await waitFor(() => expect(toast()).toBe("Tidak bisa terhubung. Periksa koneksi lalu coba lagi."));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((within(screen.getByRole("dialog")).getByLabelText("Alasan penolakan") as HTMLTextAreaElement).value).toBe("Nominal salah");
  });
  it("closes without rejecting when cancelled, or on Escape", async () => {
    const { services, repo } = fake([reviewable]);
    const dialog = await open(services);
    fireEvent.click(within(dialog).getByRole("button", { name: "Batal" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(within(rowOf("MKP-100001")).getByRole("button", { name: "Tolak" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(repo.rejectPayment).not.toHaveBeenCalled();
  });
  it("does nothing when the form is submitted with no reason", async () => {
    const { services, repo } = fake([reviewable]);
    const dialog = await open(services);
    fireEvent.submit(dialog.querySelector("form")!);
    expect(repo.rejectPayment).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
  it("limits the reason to 500 characters", async () => {
    const dialog = await open(fake([reviewable]).services);
    expect(within(dialog).getByLabelText("Alasan penolakan").getAttribute("maxlength")).toBe("500");
  });
});

describe("viewing a proof", () => {
  const openViewer = async (services: AdminOrderServices, id = "MKP-100001", who = "Ana") => {
    show(services);
    await screen.findByText(who);
    fireEvent.click(within(rowOf(id)).getByRole("button", { name: "Lihat bukti" }));
    return screen.findByRole("dialog", { name: /Bukti transfer/ });
  };
  it("opens the newest proof in a popup, not in a new tab, through a short-lived link", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const { services, repo } = fake([reviewable]);
    const dialog = await openViewer(services);
    await waitFor(() => expect(dialog.querySelector("img")?.getAttribute("src")).toBe("https://signed.test/proof"));
    expect(repo.proofLink).toHaveBeenCalledWith("orders/o-a/2.png");
    expect(open).not.toHaveBeenCalled();
    expect(within(dialog).getByText("Ana · dikirim 13 Okt 2026, 18.40")).toBeTruthy();
  });
  it("says it is opening the proof while the link is made", async () => {
    let finish: (v: { ok: true; value: string }) => void = () => {};
    const { services } = fake([reviewable], { proofLink: () => new Promise((resolve) => { finish = resolve as never; }) as never });
    const dialog = await openViewer(services);
    expect(within(dialog).getByRole("status").textContent).toBe("Membuka bukti…");
    expect(dialog.querySelector("img")).toBeNull();
    finish({ ok: true, value: "https://signed.test/late" });
    await waitFor(() => expect(dialog.querySelector("img")).not.toBeNull());
  });
  it("keeps one frame, with a skeleton in it, from the moment it opens until the picture is drawn", async () => {
    let finish: (v: { ok: true; value: string }) => void = () => {};
    const { services } = fake([reviewable], { proofLink: () => new Promise((resolve) => { finish = resolve as never; }) as never });
    const dialog = await openViewer(services);
    const frame = dialog.querySelector(".proof-frame")!;
    // Link not here yet: the skeleton fills the frame, there is no picture, and nothing is announced as an error.
    expect(frame.querySelector(".proof-skeleton")).not.toBeNull();
    expect(frame.querySelector("img")).toBeNull();
    expect(within(dialog).queryByRole("alert")).toBeNull();
    finish({ ok: true, value: "https://signed.test/p" });
    // Link here, picture still being fetched: the picture is in the frame but hidden, and the skeleton is still shown.
    await waitFor(() => expect(frame.querySelector("img")).not.toBeNull());
    expect(frame.getAttribute("data-drawn")).toBe("false");
    expect(frame.querySelector(".proof-skeleton")).not.toBeNull();
    fireEvent.load(frame.querySelector("img")!);
    expect(frame.getAttribute("data-drawn")).toBe("true");
    expect(frame.querySelector(".proof-skeleton")).toBeNull();
    // It is the same element all along: the popup never changes size.
    expect(dialog.querySelector(".proof-frame")).toBe(frame);
  });
  it("shows the skeleton again when another proof is chosen, in the same frame", async () => {
    const dialog = await openViewer(fake([reviewable]).services);
    const frame = dialog.querySelector(".proof-frame")!;
    await waitFor(() => expect(frame.querySelector("img")).not.toBeNull());
    fireEvent.load(frame.querySelector("img")!);
    expect(frame.querySelector(".proof-skeleton")).toBeNull();
    fireEvent.click(within(dialog).getAllByRole("button", { name: /^Bukti \d$/ })[0]);
    expect(frame.querySelector(".proof-skeleton")).not.toBeNull();
    expect(frame.getAttribute("data-drawn")).toBe("false");
    expect(dialog.querySelector(".proof-frame")).toBe(frame);
  });
  it("waits for a PDF to be drawn too", async () => {
    const pdf = { ...paid, proofs: [{ objectKey: "orders/o-c/1.pdf", mime: "application/pdf", size: 10, at: "x" }] };
    const dialog = await openViewer(fake([pdf]).services, "MKP-100003", "Cici");
    const frame = dialog.querySelector(".proof-frame")!;
    await waitFor(() => expect(frame.querySelector("iframe")).not.toBeNull());
    expect(frame.querySelector(".proof-skeleton")).not.toBeNull();
    fireEvent.load(frame.querySelector("iframe")!);
    expect(frame.querySelector(".proof-skeleton")).toBeNull();
  });
  it("keeps the error inside the same frame, and says the proof could not be shown when the picture itself fails", async () => {
    const dialog = await openViewer(fake([reviewable]).services);
    const frame = dialog.querySelector(".proof-frame")!;
    await waitFor(() => expect(frame.querySelector("img")).not.toBeNull());
    fireEvent.error(frame.querySelector("img")!);
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Bukti tidak bisa dibaca.");
    expect(frame.querySelector(".proof-skeleton")).toBeNull();
    expect(frame.querySelector("img")).toBeNull();
    expect(dialog.querySelector(".proof-frame")).toBe(frame);
  });
  it("is a compact popup, not the wide one", async () => {
    const dialog = await openViewer(fake([reviewable]).services);
    expect(dialog.className).toContain("proof-modal");
    expect(dialog.className).not.toContain("wide");
  });
  it("lets the admin move between the proofs of an order, loading each when chosen", async () => {
    const { services, repo } = fake([reviewable], { proofLink: vi.fn(async (key: string) => ({ ok: true as const, value: `https://signed.test/${key}` })) as never });
    const dialog = await openViewer(services);
    await waitFor(() => expect(dialog.querySelector("img")?.getAttribute("src")).toBe("https://signed.test/orders/o-a/2.png"));
    const tabs = within(dialog).getAllByRole("button", { name: /^Bukti \d$/ });
    expect(tabs.map((t) => t.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
    fireEvent.click(tabs[0]);
    await waitFor(() => expect(dialog.querySelector("img")?.getAttribute("src")).toBe("https://signed.test/orders/o-a/1.png"));
    expect(within(dialog).getByText("Ana · dikirim 13 Okt 2026, 18.05")).toBeTruthy();
    expect(repo.proofLink).toHaveBeenCalledTimes(2);
  });
  it("shows no tabs for a single proof", async () => {
    const dialog = await openViewer(fake([paid]).services, "MKP-100003", "Cici");
    expect(within(dialog).queryByRole("group")).toBeNull();
  });
  it("shows a PDF in a frame and an image as an image", async () => {
    const pdf = { ...paid, proofs: [{ objectKey: "orders/o-c/1.pdf", mime: "application/pdf", size: 10, at: "x" }] };
    const dialog = await openViewer(fake([pdf]).services, "MKP-100003", "Cici");
    await waitFor(() => expect(dialog.querySelector("iframe")?.getAttribute("src")).toBe("https://signed.test/proof"));
    expect(dialog.querySelector("img")).toBeNull();
  });
  it("offers the proof in a new tab too, without handing the page over to it", async () => {
    const dialog = await openViewer(fake([reviewable]).services);
    const link = await within(dialog).findByRole("link", { name: "Buka di tab baru" });
    expect(link.getAttribute("href")).toBe("https://signed.test/proof");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
  it("says why a link could not be made, and tries again on request", async () => {
    const proofLink = vi.fn().mockResolvedValueOnce({ ok: false, error: { kind: "forbidden" } }).mockResolvedValue({ ok: true, value: "https://signed.test/again" });
    const dialog = await openViewer(fake([reviewable], { proofLink: proofLink as never }).services);
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Akun ini bukan admin. Masuk sebagai admin.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Coba lagi" }));
    await waitFor(() => expect(dialog.querySelector("img")?.getAttribute("src")).toBe("https://signed.test/again"));
  });
  it("ignores a slow answer for a proof the admin has already left", async () => {
    const answers = new Map<string, (v: { ok: true; value: string }) => void>();
    const proofLink = vi.fn((key: string) => new Promise((resolve) => answers.set(key, resolve as never)));
    const dialog = await openViewer(fake([reviewable], { proofLink: proofLink as never }).services);
    await waitFor(() => expect(proofLink).toHaveBeenCalledWith("orders/o-a/2.png"));
    fireEvent.click(within(dialog).getAllByRole("button", { name: /^Bukti \d$/ })[0]);
    await waitFor(() => expect(proofLink).toHaveBeenCalledWith("orders/o-a/1.png"));
    answers.get("orders/o-a/1.png")!({ ok: true, value: "https://signed.test/first" });
    await waitFor(() => expect(dialog.querySelector("img")?.getAttribute("src")).toBe("https://signed.test/first"));
    answers.get("orders/o-a/2.png")!({ ok: true, value: "https://signed.test/stale" });
    await new Promise((r) => setTimeout(r, 20));
    expect(dialog.querySelector("img")?.getAttribute("src")).toBe("https://signed.test/first");
  });
  it("closes with the close button, Escape, and a click beside it; not on a click inside", async () => {
    const dialog = await openViewer(fake([reviewable]).services);
    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog", { name: /Bukti transfer/ })).not.toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Tutup" }));
    expect(screen.queryByRole("dialog", { name: /Bukti transfer/ })).toBeNull();
    fireEvent.click(within(rowOf("MKP-100001")).getByRole("button", { name: "Lihat bukti" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /Bukti transfer/ })).toBeNull();
    fireEvent.click(within(rowOf("MKP-100001")).getByRole("button", { name: "Lihat bukti" }));
    fireEvent.click(screen.getByRole("dialog", { name: /Bukti transfer/ }).parentElement!);
    expect(screen.queryByRole("dialog", { name: /Bukti transfer/ })).toBeNull();
  });
  it("says there is no proof when there is none, and opens no popup", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    show(fake([noProof]).services);
    await screen.findByText("Budi");
    fireEvent.click(within(rowOf("MKP-100002")).getByRole("button", { name: "Lihat bukti" }));
    await waitFor(() => expect(toast()).toBe("Belum ada bukti transfer untuk pesanan ini."));
    expect(screen.queryByRole("dialog", { name: /Bukti transfer/ })).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });
});

describe("the order screen", () => {
  it("lists the orders and opens one with its proofs, items as bought, and the rejection reason", async () => {
    const rejected = { ...reviewable, payment: "failed" as const, rejectionReason: "Nominal salah" };
    show(fake([rejected]).services, <OrdersManager />);
    fireEvent.click(await screen.findByRole("button", { name: /Detail|Lihat/ }));
    const dialog = document.querySelector(".modal.wide") as HTMLElement;
    expect(within(dialog).getByText("2× Tas (waktu dibeli)")).toBeTruthy();
    expect(within(dialog).getByText("Bukti 1 · 13 Okt 2026, 18.05")).toBeTruthy();
    expect(within(dialog).getByText("Bukti 2 · 13 Okt 2026, 18.40")).toBeTruthy();
    expect(within(dialog).getByText("2 KB")).toBeTruthy();
    expect(within(dialog).getByText("4 KB")).toBeTruthy();
    expect(within(dialog).getByText(/Bukti ditolak: Nominal salah/)).toBeTruthy();
  });
  it("opens the proofs in the popup from the order, on top of the order", async () => {
    show(fake([reviewable]).services, <OrdersManager />);
    fireEvent.click(await screen.findByRole("button", { name: /Detail|Lihat/ }));
    fireEvent.click(within(document.querySelector(".modal.wide") as HTMLElement).getByRole("button", { name: "Lihat bukti terbaru" }));
    const dialog = await screen.findByRole("dialog", { name: /Bukti transfer/ });
    await waitFor(() => expect(dialog.querySelector("img")?.getAttribute("src")).toBe("https://signed.test/proof"));
  });
  it("shows a note instead of proofs for an order that has none", async () => {
    show(fake([noProof]).services, <OrdersManager />);
    fireEvent.click(await screen.findByRole("button", { name: /Detail|Lihat/ }));
    expect(within(document.querySelector(".modal.wide") as HTMLElement).getByText("Belum ada bukti transfer untuk pesanan ini.")).toBeTruthy();
  });
  it("cancels with a reason and tells the admin; a missing reason is refused first", async () => {
    const { services, repo } = fake([reviewable]);
    show(services, <OrdersManager />);
    fireEvent.click(await screen.findByRole("button", { name: /Detail|Lihat/ }));
    const modal = document.querySelector(".modal.wide") as HTMLElement;
    fireEvent.click(within(modal).getByRole("button", { name: "Batalkan pesanan" }));
    fireEvent.click(within(modal).getByRole("button", { name: "Ya, batalkan pesanan" }));
    await waitFor(() => expect(toast()).toBe("Isi alasan pembatalan dulu"));
    expect(repo.cancelOrder).not.toHaveBeenCalled();
    fireEvent.change(within(modal).getByLabelText(/Alasan/), { target: { value: " Barang rusak " } });
    fireEvent.click(within(modal).getByRole("button", { name: "Ya, batalkan pesanan" }));
    await waitFor(() => expect(repo.cancelOrder).toHaveBeenCalledWith("o-a", "Barang rusak"));
    await waitFor(() => expect(toast()).toBe("Pesanan dibatalkan"));
  });
  it("tells the admin when the order can no longer be cancelled", async () => {
    show(fake([reviewable], { cancelOrder: async () => ({ ok: false, error: { kind: "notCancellable" } }) as never }).services, <OrdersManager />);
    fireEvent.click(await screen.findByRole("button", { name: /Detail|Lihat/ }));
    const modal = document.querySelector(".modal.wide") as HTMLElement;
    fireEvent.click(within(modal).getByRole("button", { name: "Batalkan pesanan" }));
    fireEvent.change(within(modal).getByLabelText(/Alasan/), { target: { value: "x" } });
    fireEvent.click(within(modal).getByRole("button", { name: "Ya, batalkan pesanan" }));
    await waitFor(() => expect(toast()).toBe("Pesanan ini tidak bisa dibatalkan lagi (sudah selesai, kedaluwarsa, atau dibatalkan)."));
  });
  it("records a refund for a cancelled paid order", async () => {
    const cancelledPaid = { ...paid, cancelNote: "Barang rusak", refund: "pending" as const };
    const { services, repo } = fake([cancelledPaid]);
    show(services, <OrdersManager />);
    fireEvent.click(await screen.findByRole("button", { name: /Detail|Lihat/ }));
    fireEvent.click(within(document.querySelector(".modal.wide") as HTMLElement).getByRole("button", { name: "Tandai sudah direfund" }));
    await waitFor(() => expect(repo.markRefunded).toHaveBeenCalledWith("o-c"));
    await waitFor(() => expect(toast()).toBe("Refund dicatat"));
  });
});

describe("the tracking number in the order's details", () => {
  const open = async (orders: Order[], over: Partial<AdminOrderServices["repo"]> = {}) => {
    const made = fake(orders, over);
    show(made.services, <OrdersManager />);
    fireEvent.click(await screen.findByRole("button", { name: /Detail|Lihat/ }));
    return { ...made, modal: document.querySelector(".modal.wide") as HTMLElement };
  };
  it("is asked for on a paid order, and saved trimmed, then the buyer's notification is mentioned to the admin", async () => {
    const { modal, repo } = await open([paid]);
    const save = within(modal).getByRole("button", { name: "Simpan resi" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(modal).getByLabelText("Nomor resi"), { target: { value: "  JP1234567890 " } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(repo.setTrackingNumber).toHaveBeenCalledWith("o-c", "JP1234567890"));
    await waitFor(() => expect(toast()).toBe("Nomor resi disimpan, pembeli diberi tahu"));
  });
  it("cannot be saved while the number is the wrong shape", async () => {
    const { modal, repo } = await open([paid]);
    const save = within(modal).getByRole("button", { name: "Simpan resi" }) as HTMLButtonElement;
    for (const bad of ["AB12", "JP 1234567890", "JP1234567890!"]) {
      fireEvent.change(within(modal).getByLabelText("Nomor resi"), { target: { value: bad } });
      expect(save.disabled).toBe(true);
    }
    fireEvent.click(save);
    expect(repo.setTrackingNumber).not.toHaveBeenCalled();
  });
  it("shows the number already entered and offers to change it", async () => {
    const { modal, repo } = await open([{ ...paid, tracking: "JP1234567890" }]);
    expect(within(modal).getByText("Nomor resi: JP1234567890 (Reguler)")).toBeTruthy();
    expect(within(modal).queryByRole("button", { name: "Simpan resi" })).toBeNull();
    fireEvent.change(within(modal).getByLabelText("Ganti nomor resi"), { target: { value: "JP9999999999" } });
    fireEvent.click(within(modal).getByRole("button", { name: "Perbarui resi" }));
    await waitFor(() => expect(repo.setTrackingNumber).toHaveBeenCalledWith("o-c", "JP9999999999"));
  });
  it("is cleared after it is saved, and kept when the database says no", async () => {
    const { modal } = await open([paid], { setTrackingNumber: async () => ({ ok: false, error: { kind: "notShippable" } }) as never });
    const input = within(modal).getByLabelText("Nomor resi") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "JP1234567890" } });
    fireEvent.click(within(modal).getByRole("button", { name: "Simpan resi" }));
    await waitFor(() => expect(toast()).toBe("Resi hanya bisa diisi untuk pesanan yang sudah dibayar, belum dibatalkan, dan belum diterima pembeli. Muat ulang daftar."));
    expect(input.value).toBe("JP1234567890");
  });
  it("is not offered for an order that is not paid, was cancelled, or was received", async () => {
    for (const o of [reviewable, { ...paid, cancelNote: "Rusak" }, { ...paid, received: true }]) {
      const { modal } = await open([o]);
      expect(within(modal).queryByLabelText(/nomor resi/i)).toBeNull();
      expect(within(modal).queryByText("Pengiriman")).toBeNull();
      cleanup();
    }
  });
  it("starts every order with an empty field", async () => {
    const view = render(<AdminProvider><OrderDetailModal order={paid} onClose={() => {}} /></AdminProvider>);
    fireEvent.change(screen.getByLabelText("Nomor resi"), { target: { value: "JP1234567890" } });
    expect((screen.getByLabelText("Nomor resi") as HTMLInputElement).value).toBe("JP1234567890");
    view.rerender(<AdminProvider><OrderDetailModal order={{ ...paid, number: "100099" }} onClose={() => {}} /></AdminProvider>);
    expect((screen.getByLabelText("Nomor resi") as HTMLInputElement).value).toBe("");
  });
  it("empties the field once the number is saved", async () => {
    const { modal } = await open([paid]);
    const input = within(modal).getByLabelText("Nomor resi") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "JP1234567890" } });
    fireEvent.click(within(modal).getByRole("button", { name: "Simpan resi" }));
    await waitFor(() => expect(toast()).toBe("Nomor resi disimpan, pembeli diberi tahu"));
    await waitFor(() => expect(input.value).toBe(""));
  });
});

describe("a modal opened directly", () => {
  it("shows the sample orders' items by catalog name when they have no copy", () => {
    render(<AdminProvider><OrderDetailModal order={base({ items: [{ productId: 1, qty: 1, price: 89000 }], proofs: undefined })} onClose={() => {}} /></AdminProvider>);
    expect(screen.getByText("1× Mug Blush Daily")).toBeTruthy();
    expect(screen.queryByText("Bukti transfer")).toBeNull();
  });
});

describe("in the sample store", () => {
  it("only says what viewing a proof would do, since the sample store keeps no files", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<AdminProvider><PaymentsPanel /><Toast /></AdminProvider>);
    fireEvent.click(within(screen.getByText("#MKP-837312").closest("tr")!).getByRole("button", { name: "Lihat bukti" }));
    await waitFor(() => expect(toast()).toBe("Preview bukti transfer dibuka"));
    expect(open).not.toHaveBeenCalled();
  });
  it("accepts and rejects with a reason, as before", async () => {
    render(<AdminProvider><PaymentsPanel /><Toast /></AdminProvider>);
    fireEvent.click(within(screen.getByText("#MKP-837312").closest("tr")!).getByRole("button", { name: "Terima" }));
    await waitFor(() => expect(toast()).toBe("Pembayaran diterima"));
    fireEvent.click(within(screen.getByText("#MKP-837301").closest("tr")!).getByRole("button", { name: "Tolak" }));
    fireEvent.change(screen.getByLabelText("Alasan penolakan"), { target: { value: "Buram" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Tolak pembayaran" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(toast()).toBe("Pembayaran ditolak");
  });
});

describe("searching the payments", () => {
  const many = [reviewable, noProof, paid, base({ id: "o-f", number: "100006", buyer: "Ani Lestari", proofs: [{ objectKey: "orders/o-f/1.png", mime: "image/png", size: 1, at: "x" }] })];
  const search = (value: string) => fireEvent.change(screen.getByPlaceholderText("Cari nomor order atau pembeli…"), { target: { value } });
  const names = () => ["Ana", "Budi", "Cici", "Ani Lestari"].filter((n) => screen.queryByText(n));

  it("lists everything until something is typed", async () => {
    show(fake(many).services);
    await screen.findByText("Ana");
    expect(names()).toEqual(["Ana", "Budi", "Cici", "Ani Lestari"]);
  });
  it("finds a payment by the buyer's name, ignoring case and spaces around it", async () => {
    show(fake(many).services);
    await screen.findByText("Ana");
    search("  ANI ");
    expect(names()).toEqual(["Ani Lestari"]);
    search("an");
    expect(names()).toEqual(["Ana", "Ani Lestari"]);
  });
  it("finds a payment by its order number, with or without MKP- or a #", async () => {
    show(fake(many).services);
    await screen.findByText("Ana");
    for (const q of ["100002", "MKP-100002", "mkp-100002", "#MKP-100002", "#100002"]) {
      search(q);
      expect(names(), q).toEqual(["Budi"]);
    }
  });
  it("combines with the status filter", async () => {
    show(fake(many).services);
    await screen.findByText("Ana");
    fireEvent.click(screen.getByRole("button", { name: /Semua status/ }));
    fireEvent.click(screen.getByRole("option", { name: "Diterima" }));
    expect(names()).toEqual(["Cici"]);
    search("ani");
    expect(names()).toEqual([]);
    search("cici");
    expect(names()).toEqual(["Cici"]);
  });
  it("says nothing matched, and that there are no payments at all when there are none", async () => {
    show(fake(many).services);
    await screen.findByText("Ana");
    search("zzz");
    expect(screen.getByText("Tidak ada pembayaran yang cocok dengan pencarianmu.")).toBeTruthy();
    cleanup();
    show(fake([]).services);
    await waitFor(() => expect(screen.getByText("Belum ada pembayaran untuk diperiksa.")).toBeTruthy());
    expect(screen.queryByText("Tidak ada pembayaran yang cocok dengan pencarianmu.")).toBeNull();
  });
  it("shows neither empty note while the payments are still loading", () => {
    show(fake([], { listAllOrders: () => new Promise(() => {}) }).services);
    expect(screen.queryByText("Belum ada pembayaran untuk diperiksa.")).toBeNull();
  });
});
