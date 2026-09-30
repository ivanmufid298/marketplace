"use client";

import { CartIcon, SearchIcon, UserIcon } from "./icons";
import { useStore } from "./store-provider";

export function Header() {
  const { query, setQuery, cartCount, openPanel } = useStore();
  return (
    <>
      <div className="notice">Gratis ongkir untuk pesanan pertama · Minimal belanja Rp150.000</div>
      <header className="header">
        <div className="shell nav">
          <a className="brand" href="#">
            <span className="brand-mark">M</span>
            <span className="brand-name">BRAND NAME</span>
          </a>
          <label className="search" aria-label="Cari produk">
            <SearchIcon />
            <input id="search" placeholder="Cari produk, kategori, atau toko…" value={query} onChange={(e) => setQuery(e.target.value.toLowerCase())} />
          </label>
          <div className="actions">
            <button className="icon-btn" aria-label="Akun"><UserIcon /></button>
            <button className="icon-btn" aria-label="Buka keranjang" onClick={() => openPanel("drawer")}>
              <CartIcon />
              <span className="count">{cartCount}</span>
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
