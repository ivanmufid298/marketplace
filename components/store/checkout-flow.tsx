"use client";

import type { InputHTMLAttributes } from "react";
import { money } from "@/lib/format";
import { SHIPPING_OPTIONS } from "@/lib/store-data";
import { useStore, type Address } from "./store-provider";

const STEPS = ["Alamat", "Pengiriman", "Pembayaran"];

function Summary() {
  const { subtotal, shippingCost } = useStore();
  return (
    <div className="summary-box">
      <div className="summary-line"><span>Subtotal</span><span>{money(subtotal)}</span></div>
      <div className="summary-line"><span>Ongkos kirim</span><span>{money(shippingCost)}</span></div>
      <div className="summary-line total"><span>Total pembayaran</span><span>{money(subtotal + shippingCost)}</span></div>
    </div>
  );
}

export function CheckoutFlow() {
  const s = useStore();
  const { checkoutStep: step, address, setAddressField } = s;
  const field = (id: keyof Address, label: string, props: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} value={address[id]} onChange={(e) => setAddressField(id, e.target.value)} {...props} />
    </div>
  );

  return (
    <aside className={`checkout-flow${s.panels.checkout ? " open" : ""}`} id="checkoutFlow" aria-hidden={!s.panels.checkout}>
      <div className="overlay" onClick={() => s.closePanel("checkout")} />
      <div className="panel">
        <div className="co-head">
          <div className="co-title">
            <h2>Checkout</h2>
            <button className="close" aria-label="Tutup" onClick={() => s.closePanel("checkout")}>×</button>
          </div>
          <div className="steps">
            {STEPS.map((label, i) => (
              <div key={label} className={`step${step === i + 1 ? " active" : ""}${step > i + 1 ? " done" : ""}`} data-n={i + 1} data-label={label}>{label}</div>
            ))}
          </div>
        </div>
        <div className="co-body">
          <section className={`co-page${step === 1 ? " active" : ""}`}>
            <h3>Alamat pengiriman</h3>
            <p className="co-note">Pastikan pesanan sampai ke tangan yang tepat.</p>
            <div className="fields">
              {field("fullName", "Nama lengkap", { autoComplete: "name", placeholder: "Nama penerima" })}
              {field("phone", "Nomor WhatsApp", { inputMode: "tel", placeholder: "08xxxxxxxxxx" })}
              <div className="field full">
                <label htmlFor="address">Alamat lengkap</label>
                <textarea id="address" placeholder="Nama jalan, nomor rumah, RT/RW" value={address.address} onChange={(e) => setAddressField("address", e.target.value)} />
              </div>
              {field("city", "Kota / Kabupaten", { placeholder: "Contoh: Jakarta Selatan" })}
              {field("postcode", "Kode pos", { inputMode: "numeric", placeholder: "12345" })}
              <div className="field full">
                <label htmlFor="note">Catatan untuk kurir <span style={{ fontWeight: 400, color: "var(--muted)" }}>(opsional)</span></label>
                <input id="note" placeholder="Contoh: Titip ke satpam" value={address.note} onChange={(e) => setAddressField("note", e.target.value)} />
              </div>
            </div>
            <div className="co-actions"><span /><button className="primary" onClick={() => s.goCheckoutStep(2)}>Pilih pengiriman</button></div>
          </section>

          <section className={`co-page${step === 2 ? " active" : ""}`}>
            <h3>Pilih pengiriman</h3>
            <p className="co-note">Estimasi dihitung untuk alamat yang kamu isi.</p>
            <div className="option-list">
              {SHIPPING_OPTIONS.map((o) => (
                <label className="option" key={o.value}>
                  <input type="radio" name="shipping" value={o.value} checked={s.shipping === o.value} onChange={() => s.setShipping(o.value)} />
                  <span className="option-main"><b>{o.label}</b><small>{o.note}</small></span>
                  <span className="option-price">{money(o.cost)}</span>
                </label>
              ))}
            </div>
            <Summary />
            <div className="co-actions">
              <button className="secondary" onClick={() => s.goCheckoutStep(1)}>Kembali</button>
              <button className="primary" onClick={() => s.goCheckoutStep(3)}>Lanjut bayar</button>
            </div>
          </section>

          <section className={`co-page${step === 3 ? " active" : ""}`}>
            <h3>Transfer pembayaran</h3>
            <p className="co-note">Tidak ada biaya payment gateway. Transfer sesuai total, lalu unggah bukti pembayaran.</p>
            <div className="bank-card">
              <div className="bank-label">Bank Central Asia</div>
              <div className="bank-no">123 456 7890</div>
              <div className="bank-owner">a.n. PT NAMA MARKETPLACE</div>
              <button className="copy-btn" onClick={() => { navigator.clipboard?.writeText("1234567890"); s.showToast("Nomor rekening disalin"); }}>Salin nomor rekening</button>
            </div>
            <Summary />
            <label className="upload">
              <input type="file" accept="image/*,.pdf" onChange={(e) => { if (!s.setProof(e.target.files?.[0] ?? null)) e.target.value = ""; }} />
              <b>{s.proofName ? "✓ " + s.proofName : "Unggah bukti transfer"}</b>
              <small>JPG, PNG, atau PDF · Maksimal 5 MB</small>
            </label>
            <div className="co-actions">
              <button className="secondary" onClick={() => s.goCheckoutStep(2)}>Kembali</button>
              <button className="primary" onClick={s.placeOrder}>Buat pesanan</button>
            </div>
          </section>

          <section className={`co-page${step === 4 ? " active" : ""}`}>
            <div className="success">
              <div className="success-mark">✓</div>
              <h3>Pesanan berhasil dibuat</h3>
              <p className="co-note">Bukti pembayaran sudah diterima dan akan diverifikasi admin.</p>
              <div className="order-id">{s.orderId}</div>
              <div className="summary-box">
                <div className="summary-line"><span>Status</span><strong>Menunggu verifikasi</strong></div>
                <div className="summary-line"><span>Estimasi verifikasi</span><strong>1×24 jam</strong></div>
              </div>
              <button className="primary" style={{ marginTop: 24 }} onClick={s.finishOrder}>Kembali belanja</button>
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
}
