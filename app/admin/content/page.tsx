"use client";

import { useAdmin } from "@/components/admin/admin-provider";
import { SectionTop } from "@/components/admin/ui";

export default function ContentPage() {
  const { openModal } = useAdmin();
  return (
    <section className="view active">
      <SectionTop title="Banner & popup" text="Atur materi promosi yang tampil di halaman marketplace.">
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-line" onClick={() => openModal("popup")}>＋ Popup</button>
          <button className="btn btn-primary" onClick={() => openModal("banner")}>＋ Banner</button>
        </div>
      </SectionTop>
      <div className="media-grid">
        <article className="media-card">
          <div className="media-preview"><small>HERO BANNER</small><strong>Hal baik, pilihan cantik.</strong></div>
          <div className="media-body">
            <div><b>Banner utama</b><span className="sub" style={{ display: "block" }}>Aktif · Beranda</span></div>
            <button className="btn btn-line btn-sm" onClick={() => openModal("banner")}>Edit</button>
          </div>
        </article>
        <article className="media-card">
          <div className="media-preview dark"><small>POPUP CAMPAIGN</small><strong>Special Payday 25% OFF</strong></div>
          <div className="media-body">
            <div><b>Payday Poster</b><span className="sub" style={{ display: "block" }}>Terjadwal · 30 Sep, 09.00</span></div>
            <button className="btn btn-line btn-sm" onClick={() => openModal("popup")}>Edit</button>
          </div>
        </article>
      </div>
    </section>
  );
}
