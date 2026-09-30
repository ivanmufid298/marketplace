"use client";

import { useStore } from "./store-provider";

export function Hero() {
  const { scrollToProducts } = useStore();
  return (
    <section className="hero">
      <div className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow">Pilihan minggu ini</span>
          <h1>Hal baik,<br />pilihan cantik.</h1>
          <p>Temukan barang pilihan untuk keseharianmu, dikurasi dari toko lokal dengan rasa yang istimewa.</p>
          <button className="primary" onClick={scrollToProducts}>Jelajahi koleksi</button>
        </div>
        <div className="hero-art" role="img" aria-label="Tas kanvas warna ivory" />
        <div className="hero-badge">Mulai dari Rp89.000</div>
      </div>
    </section>
  );
}
