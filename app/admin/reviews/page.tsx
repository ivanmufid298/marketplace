"use client";

import { useState } from "react";
import { useAdmin } from "@/components/admin/admin-provider";
import { SectionTop, Select } from "@/components/admin/ui";

const RATINGS = [{ value: "all", label: "Semua rating" }, ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} bintang` }))];
const STATUSES = [
  { value: "all", label: "Semua status" },
  { value: "visible", label: "Ditampilkan" },
  { value: "hidden", label: "Disembunyikan" },
];

export default function ReviewsPage() {
  const { reviews, toggleReview } = useAdmin();
  const [rating, setRating] = useState("all");
  const [status, setStatus] = useState("all");
  const list = reviews.filter((r) => (rating === "all" || r.rating === Number(rating)) && (status === "all" || r.status === status));

  return (
    <section className="view active">
      <SectionTop title="Product reviews" text="Sortir rating dan kelola ulasan yang tampil pada halaman produk.">
        <div className="filters">
          <Select options={RATINGS} value={rating} onChange={setRating} />
          <Select options={STATUSES} value={status} onChange={setStatus} />
        </div>
      </SectionTop>
      <div className="cards" style={{ marginBottom: 18 }}>
        <article className="metric"><div className="metric-top"><span>Rating rata-rata</span></div><strong>4.8 ★</strong><span className="trend">Dari 382 ulasan</span></article>
        <article className="metric"><div className="metric-top"><span>Menunggu moderasi</span></div><strong>7</strong><span className="trend down">Perlu ditinjau</span></article>
      </div>
      <div className="table-card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Buyer</th><th>Produk</th><th>Rating</th><th>Ulasan</th><th>Status</th><th>Aksi</th></tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.buyer}</strong><span className="sub">Verified buyer</span></td>
                  <td>{r.product}</td>
                  <td><span style={{ color: "#d66a87", whiteSpace: "nowrap" }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span></td>
                  <td style={{ maxWidth: 330 }}>{r.text}</td>
                  <td><span className={`status ${r.status === "visible" ? "success" : "failed"}`}>{r.status === "visible" ? "Ditampilkan" : "Disembunyikan"}</span></td>
                  <td><button className="btn btn-line btn-sm" onClick={() => toggleReview(r.id)}>{r.status === "visible" ? "Sembunyikan" : "Tampilkan"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
