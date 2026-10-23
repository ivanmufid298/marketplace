// Run with `npm run test:ui`. The words for each notification: title, body, the action, and whether it is urgent.
import { describe, expect, it } from "vitest";
import { describeNotification } from "./describe";
import type { AppNotification, NotificationKind } from "./types";

const n = (kind: NotificationKind, payload: Record<string, unknown> = {}, read = false): AppNotification => ({ id: 1, kind, orderId: "o", payload, createdAt: "2026-10-13T11:00:00Z", read, resolved: false });

describe("describeNotification", () => {
  it("tells the buyer the order was shipped, with the courier's service and the tracking number", () => {
    expect(describeNotification(n("order_shipped", { number: "100002", courier: "SICEPAT REG", tracking: "JP1234567890", updated: false }))).toEqual({
      title: "Pesanan #100002 dikirim",
      body: "Lewat SICEPAT REG. Nomor resi: JP1234567890.",
      actionLabel: null,
      urgent: false,
    });
  });
  it("says so when the tracking number was corrected", () => {
    expect(describeNotification(n("order_shipped", { number: "100002", courier: "SICEPAT REG", tracking: "JP9999999999", updated: true })).body).toBe("Nomor resi diperbarui: JP9999999999 (SICEPAT REG).");
  });

  it("asks for payment with the deadline in Jakarta time, and offers the upload", () => {
    expect(describeNotification(n("payment_needed", { number: "100002", expires_at: "2026-10-13T08:30:00Z" }))).toEqual({
      title: "Selesaikan pembayaran pesanan #100002",
      body: "Kirim bukti transfer sebelum pukul 15.30 WIB, atau pesanan dibatalkan otomatis.",
      actionLabel: "Unggah bukti",
      urgent: true,
    });
  });
  it("says why a proof was rejected, with the new deadline, and offers a new upload", () => {
    expect(describeNotification(n("payment_rejected", { number: "100002", reason: "Nominal salah.", reupload_until: "2026-10-13T10:05:00Z" }))).toEqual({
      title: "Bukti pembayaran #100002 ditolak",
      body: "Nominal salah. Kirim bukti baru sebelum pukul 17.05 WIB.",
      actionLabel: "Unggah ulang",
      urgent: true,
    });
  });
  it("warns that an order is about to expire, with the deadline in Jakarta time, and offers the upload", () => {
    expect(describeNotification(n("payment_expiring", { number: "100002", deadline: "2026-10-13T08:30:00Z" }))).toEqual({
      title: "Pesanan #100002 segera kedaluwarsa",
      body: "Kirim bukti transfer sebelum pukul 15.30 WIB, atau pesanan dibatalkan dan stoknya dikembalikan.",
      actionLabel: "Unggah bukti",
      urgent: true,
    });
    expect(describeNotification(n("payment_expiring", { number: "100002", deadline: "2026-10-13T08:30:00Z" }, true)).urgent).toBe(false);
  });
  it("tells an admin a proof is waiting, with who sent it and the total, and offers to check it", () => {
    expect(describeNotification(n("payment_submitted", { number: "100002", recipient: "Ana Putri", total: 178000 }))).toEqual({
      title: "Bukti pembayaran baru #100002",
      body: "Ana Putri mengirim bukti transfer Rp178.000. Periksa lalu terima atau tolak.",
      actionLabel: "Periksa",
      urgent: true,
    });
    expect(describeNotification(n("payment_submitted", { number: "100002", recipient: "Ana", total: 1 }, true)).urgent).toBe(false);
    expect(describeNotification(n("payment_submitted", { number: "100002", recipient: "Ana" })).body).toBe("Ana mengirim bukti transfer . Periksa lalu terima atau tolak.");
  });
  it("tells an admin a paid order waits to be sent, with who it is for and the courier, and offers to enter the tracking number", () => {
    expect(describeNotification(n("order_to_ship", { number: "100002", recipient: "Ana Putri", courier: "SICEPAT REG" }))).toEqual({
      title: "Pesanan #100002 perlu dikirim",
      body: "Ana Putri, SICEPAT REG. Serahkan ke kurir lalu isi nomor resi.",
      actionLabel: "Isi resi",
      urgent: true,
    });
    expect(describeNotification(n("order_to_ship", { number: "100002", recipient: "Ana", courier: "JNE" }, true)).urgent).toBe(false);
  });
  it("tells that a payment was accepted, with nothing to do", () => {
    expect(describeNotification(n("payment_accepted", { number: "100002" }))).toEqual({ title: "Pembayaran #100002 diterima", body: "Pesananmu sedang diproses dan dikirim.", actionLabel: null, urgent: false });
  });
  it("gives the reason for a cancellation, and says a refund will come only when one is due", () => {
    expect(describeNotification(n("order_cancelled", { number: "100002", note: "Stok habis.", refund: false })).body).toBe("Alasan: Stok habis.");
    expect(describeNotification(n("order_cancelled", { number: "100002", note: "Barang rusak.", refund: true })).body).toBe("Alasan: Barang rusak. Dana akan dikembalikan.");
    expect(describeNotification(n("order_cancelled", { number: "1", note: "x" })).body).toBe("Alasan: x");
  });
  it("tells that a refund was sent, and that an order expired", () => {
    expect(describeNotification(n("refund_done", { number: "100002" }))).toMatchObject({ title: "Refund pesanan #100002 sudah dikirim", actionLabel: null });
    expect(describeNotification(n("order_expired", { number: "100002" }))).toMatchObject({ title: "Pesanan #100002 kedaluwarsa", actionLabel: null });
  });
  it("invites a review, which is an offer and not urgent", () => {
    expect(describeNotification(n("review_invite", { number: "100002" }))).toEqual({ title: "Bagaimana pesananmu #100002?", body: "Tulis ulasan untuk barang yang sudah kamu terima.", actionLabel: "Tulis ulasan", urgent: false });
  });
  it("is urgent only while an unread request is open", () => {
    expect(describeNotification(n("payment_needed", { number: "1" }, false)).urgent).toBe(true);
    expect(describeNotification(n("payment_needed", { number: "1" }, true)).urgent).toBe(false);
    expect(describeNotification(n("payment_rejected", { number: "1" }, true)).urgent).toBe(false);
    expect(describeNotification(n("payment_accepted", { number: "1" }, false)).urgent).toBe(false);
  });
  it("copes with missing facts without writing 'undefined'", () => {
    for (const kind of ["payment_needed", "payment_rejected", "payment_accepted", "order_cancelled", "refund_done", "order_expired", "review_invite", "payment_expiring", "payment_submitted", "order_shipped", "order_to_ship"] as const) {
      const view = describeNotification(n(kind, {}));
      expect(`${view.title} ${view.body}`).not.toContain("undefined");
      expect(`${view.title} ${view.body}`).not.toContain("null");
    }
    expect(describeNotification(n("payment_needed", { number: "1", expires_at: "not a date" })).body).toBe("Kirim bukti transfer sebelum pukul  WIB, atau pesanan dibatalkan otomatis.");
    expect(describeNotification(n("payment_needed", { number: 5 as never })).title).toBe("Selesaikan pembayaran pesanan #");
  });
});
