"use client";

import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/format";
import { SORT_OPTIONS } from "@/lib/store-data";
import { ChevronDownIcon, HeartIcon } from "./icons";
import { useStore } from "./store-provider";

function SortMenu() {
  const { sort, setSort } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className={`sort-wrap${open ? " open" : ""}`} ref={ref}>
      <button className="sort-trigger" aria-expanded={open} aria-haspopup="listbox" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
        <span>{SORT_OPTIONS.find((o) => o.value === sort)?.label}</span>
        <ChevronDownIcon />
      </button>
      <div className="sort-menu" role="listbox">
        {SORT_OPTIONS.map((o) => (
          <button key={o.value} className={`sort-option${sort === o.value ? " active" : ""}`} role="option" aria-selected={sort === o.value} onClick={() => { setSort(o.value); setOpen(false); }}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ProductSection() {
  const { visibleProducts, liked, toggleLike, openDetail } = useStore();
  return (
    <section id="products">
      <div className="section-head">
        <div>
          <h2>Pilihan untukmu</h2>
          <p>Produk menarik yang siap jadi favorit baru.</p>
        </div>
        <SortMenu />
      </div>
      <div className="grid">
        <div className="empty" style={{ display: visibleProducts.length ? "none" : "block" }}>Produk yang kamu cari belum ditemukan.</div>
        {visibleProducts.map((p) => {
          const isLiked = liked.has(p.id);
          return (
            <article key={p.id} className="card" data-pos={p.pos} onClick={() => openDetail(p)}>
              <div className="photo">
                <span className="tag">{p.tag}</span>
                <button className={`heart${isLiked ? " active" : ""}`} aria-label={`Simpan ${p.name}`} onClick={(e) => { e.stopPropagation(); toggleLike(p.id); }}>
                  <HeartIcon filled={isLiked} />
                </button>
              </div>
              <div className="info">
                <div className="shop">{p.shop}</div>
                <div className="product-line">
                  <h3>{p.name}</h3>
                  <span className="price">{money(p.price)}</span>
                </div>
                <div className="rating">★ {p.rating}</div>
                {p.stock <= 3 && <span className="low-stock">🔥 Tinggal {p.stock}</span>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
