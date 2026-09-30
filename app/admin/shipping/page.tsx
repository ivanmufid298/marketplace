"use client";

import { useAdmin } from "@/components/admin/admin-provider";
import { SectionTop, Switch } from "@/components/admin/ui";
import { SHIPPING_SERVICES } from "@/lib/admin-data";

export default function ShippingPage() {
  const { openModal, showToast } = useAdmin();
  return (
    <section className="view active">
      <SectionTop title="Pengaturan ongkir" text="Atur layanan, estimasi, dan tarif dasar pengiriman.">
        <button className="btn btn-primary" onClick={() => openModal("shipping")}>＋ Tambah layanan</button>
      </SectionTop>
      <div className="shipping-list">
        {SHIPPING_SERVICES.map((s) => (
          <article className="shipping-row" key={s.name}>
            <div><b>{s.name}</b><span className="sub" style={{ display: "block" }}>{s.note}</span></div>
            <label className="field"><span className="sub">Tarif dasar</span><input defaultValue={s.base} /></label>
            <label className="field"><span className="sub">Gratis ongkir min.</span><input defaultValue={s.free} /></label>
            <Switch label={`Aktifkan ${s.name.toLowerCase()}`} defaultOn onChange={() => showToast("Pengaturan diperbarui")} />
          </article>
        ))}
      </div>
    </section>
  );
}
