"use client";

import { money, spritePosition } from "@/lib/format";
import { useStore } from "./store-provider";

const RATING_BARS = [["5", 82], ["4", 13], ["3", 4], ["2", 1], ["1", 0]] as const;

// Placeholder content: the same summary is shown for every product until reviews come from the database.
const REVIEWS = [
  { name: "Nadia P.", stars: "★★★★★", when: "2 hari lalu", text: "Produknya sesuai foto, packing rapi dan warnanya cantik banget." },
  { name: "Sarah A.", stars: "★★★★☆", when: "1 minggu lalu", text: "Barang bagus dan admin responsif. Pengiriman sedikit lebih lama dari perkiraan." },
];

export function DetailPanel() {
  const { panels, closePanel, selected: p, liked, toggleLike, addToCart } = useStore();
  const isLiked = p ? liked.has(p.id) : false;
  return (
    <aside className={`detail${panels.detail ? " open" : ""}`} id="detail" aria-hidden={!panels.detail}>
      <div className="overlay" onClick={() => closePanel("detail")} />
      <div className="panel">
        <button className="close" aria-label="Tutup" onClick={() => closePanel("detail")}>×</button>
        <div className="detail-photo" style={{ backgroundPosition: p ? spritePosition(p.pos) : undefined }} />
        <div className="detail-body">
          <span className="eyebrow">{p?.cat}</span>
          <h2>{p?.name}</h2>
          <div className="detail-price">{p ? money(p.price) : ""}</div>
          {p && (
            <div className="low-stock" style={{ display: "inline-flex" }}>
              {p.stock <= 3 ? `🔥 Stok terbatas · tinggal ${p.stock}` : `Stok tersedia · ${p.stock}`}
            </div>
          )}
          <p className="detail-desc">{p?.desc}</p>
          <section className="review-block">
            <div className="review-title"><h3>Ulasan pembeli</h3><span className="verified">✓ Pembelian terverifikasi</span></div>
            <div className="review-score">
              <div>
                <div className="score-big">4.8</div>
                <div className="stars">★★★★★</div>
                <small style={{ color: "var(--muted)" }}>128 ulasan</small>
              </div>
              <div className="review-bars">
                {RATING_BARS.map(([star, pct]) => (
                  <div className="review-bar" key={star}>
                    <span>{star}</span>
                    <span className="bar-track"><span className="bar-fill" style={{ display: "block", width: `${pct}%` }} /></span>
                    <span>{pct}%</span>
                  </div>
                ))}
              </div>
            </div>
            {REVIEWS.map((r) => (
              <article className="review-item" key={r.name}>
                <div className="reviewer">
                  <div><b>{r.name}</b><div className="stars">{r.stars}</div></div>
                  <span className="sub">{r.when}</span>
                </div>
                <p>{r.text}</p>
              </article>
            ))}
          </section>
          <div className="detail-actions">
            <button className="secondary" onClick={() => p && toggleLike(p.id)}>{isLiked ? "Hapus dari wishlist" : "Simpan ke wishlist"}</button>
            <button className="primary" onClick={() => p && addToCart(p)}>Tambah ke keranjang</button>
          </div>
        </div>
      </div>
    </aside>
  );
}
