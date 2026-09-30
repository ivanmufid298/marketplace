"use client";

import { money, spritePosition } from "@/lib/format";
import { useStore } from "./store-provider";

export function HotPromo() {
  const { products, openDetail } = useStore();
  return (
    <section className="hot-section">
      <div className="hot-head">
        <div>
          <span className="hot-kicker">Penawaran terbatas</span>
          <h2>Hot Promo</h2>
        </div>
        <p>Harga spesial sebelum kehabisan.</p>
      </div>
      <div className="hot-list">
        {products.filter((p) => p.promo).map((p) => (
          <button key={p.id} className="hot-item" onClick={() => openDetail(p)}>
            <span className="hot-thumb" style={{ backgroundPosition: spritePosition(p.pos) }} />
            <span>
              <small>{p.promo} · Sisa {p.stock}</small>
              <b>{p.name}</b>
              <span className="hot-price">
                <strong>{money(p.price)}</strong>
                {p.oldPrice && <del>{money(p.oldPrice)}</del>}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
