"use client";

import Link from "next/link";
import { useState } from "react";
import { useAdmin, type ModalType } from "@/components/admin/admin-provider";
import { PaymentRow } from "@/components/admin/payment-rows";
import { Icon } from "@/components/admin/ui";
import { CHART_DATA } from "@/lib/admin-data";

const QUICK: { type: ModalType; glyph: string; title: string; sub: string }[] = [
  { type: "product", glyph: "＋", title: "Tambah produk", sub: "Ke etalase" },
  { type: "promo", glyph: "％", title: "Buat promo", sub: "Dengan jadwal" },
  { type: "voucher", glyph: "V", title: "Buat voucher", sub: "Kode diskon" },
  { type: "banner", glyph: "▣", title: "Ganti banner", sub: "Beranda toko" },
];

function SalesChart() {
  const [mode, setMode] = useState<keyof typeof CHART_DATA>("month");
  const d = CHART_DATA[mode];
  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h3>Statistik penjualan</h3>
          <span className="sub">{d.sub}</span>
        </div>
        <div className="segmented">
          <button className={mode === "month" ? "active" : ""} onClick={() => setMode("month")}>Bulanan</button>
          <button className={mode === "year" ? "active" : ""} onClick={() => setMode("year")}>Tahunan</button>
        </div>
      </div>
      <div className="chart">
        <div className="chart-grid" />
        <span className="axis axis-y" style={{ bottom: 0 }}>0</span>
        <span className="axis axis-y" style={{ bottom: "50%" }}>75 jt</span>
        <span className="axis axis-y" style={{ bottom: "100%" }}>150 jt</span>
        <svg viewBox="0 0 600 240" preserveAspectRatio="none">
          <defs>
            <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#df7895" stopOpacity=".28" />
              <stop offset="1" stopColor="#df7895" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="area" d={d.area} />
          <polyline points={d.points} />
          {d.dots.map(([cx, cy]) => <circle key={cx} cx={cx} cy={cy} r="5" />)}
        </svg>
        <div className="chart-labels">{d.labels.map((l) => <span key={l}>{l}</span>)}</div>
      </div>
    </article>
  );
}

export default function DashboardPage() {
  const { payments, openModal } = useAdmin();
  return (
    <section className="view active">
      <div className="cards">
        <article className="metric"><div className="metric-top"><span>Total penjualan</span><span className="metric-icon">Rp</span></div><strong>Rp128,4 jt</strong><span className="trend">↑ 12,8% dari bulan lalu</span></article>
        <article className="metric"><div className="metric-top"><span>Pesanan</span><span className="metric-icon"><Icon name="bag" /></span></div><strong>1.284</strong><span className="trend">↑ 8,3% dari bulan lalu</span></article>
        <article className="metric"><div className="metric-top"><span>Menunggu verifikasi</span><span className="metric-icon"><Icon name="clock" /></span></div><strong>18</strong><span className="trend down">Perlu ditinjau admin</span></article>
        <article className="metric"><div className="metric-top"><span>Produk aktif</span><span className="metric-icon"><Icon name="products" /></span></div><strong>246</strong><span className="trend">↑ 14 produk baru</span></article>
      </div>
      <div className="dashboard-grid">
        <SalesChart />
        <article className="card">
          <div className="card-head"><h3>Aksi cepat</h3></div>
          <div className="quick-grid">
            {QUICK.map((q) => (
              <button key={q.type} className="quick" onClick={() => openModal(q.type)}>
                <span>{q.glyph}</span><b>{q.title}</b><small>{q.sub}</small>
              </button>
            ))}
          </div>
        </article>
      </div>
      <div className="table-card">
        <div className="table-head">
          <h3>Pembayaran terbaru</h3>
          <Link className="btn btn-line btn-sm" href="/admin/payments">Lihat semua</Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Order</th><th>Pelanggan</th><th>Total</th><th>Waktu</th><th>Status</th><th>Aksi</th></tr></thead>
            <tbody>{payments.slice(0, 4).map((p) => <PaymentRow key={p.id} payment={p} compact />)}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
