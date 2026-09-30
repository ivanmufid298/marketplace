"use client";

import { useState } from "react";
import { useAdmin } from "@/components/admin/admin-provider";
import { SectionTop, Switch } from "@/components/admin/ui";
import { PROMOS } from "@/lib/admin-data";

function PromoCard({ promo }: { promo: (typeof PROMOS)[number] }) {
  const { showToast } = useAdmin();
  const [on, setOn] = useState(promo.on);
  const [label, setLabel] = useState(promo.label);
  return (
    <article className="promo-card">
      <h3>{promo.title}</h3>
      <p>{promo.text}</p>
      <div className="schedule">
        <Switch
          label="Aktifkan promo"
          defaultOn={on}
          onChange={(v) => {
            setOn(v);
            setLabel(v ? "Aktif" : "Nonaktif");
            showToast("Pengaturan diperbarui");
          }}
        />
        <b>{label}</b>
      </div>
      <span className="sub">{promo.sub}</span>
    </article>
  );
}

export default function PromosPage() {
  const { openModal } = useAdmin();
  return (
    <section className="view active">
      <SectionTop title="Promo & scheduler" text="Buat promo langsung atau jadwalkan waktu tayangnya.">
        <button className="btn btn-primary" onClick={() => openModal("promo")}>＋ Tambah promo</button>
      </SectionTop>
      <div className="promo-grid">{PROMOS.map((p) => <PromoCard key={p.title} promo={p} />)}</div>
    </section>
  );
}
