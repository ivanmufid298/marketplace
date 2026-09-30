"use client";

import { useState } from "react";
import { useAdmin } from "@/components/admin/admin-provider";
import { Icon, SearchBar, SectionTop, Select } from "@/components/admin/ui";
import { adminProducts } from "@/lib/admin-data";

const CATEGORY_OPTIONS = ["Semua kategori", "Rumah", "Fashion", "Elektronik", "Kecantikan"].map((c) => ({ value: c, label: c }));

export default function ProductsPage() {
  const { openModal, showToast } = useAdmin();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Semua kategori");
  const list = adminProducts.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()) && (category === "Semua kategori" || p.cat === category));

  return (
    <section className="view active">
      <SectionTop title="Etalase produk" text="Atur produk, stok, harga, dan status tampil.">
        <button className="btn btn-primary" onClick={() => openModal("product")}>＋ Tambah produk</button>
      </SectionTop>
      <div className="filters">
        <SearchBar id="productSearch" value={query} onChange={setQuery} placeholder="Cari produk…" />
        <Select options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
      </div>
      <div className="product-grid" style={{ marginTop: 18 }}>
        {list.map((p) => (
          <article className="product" key={p.name}>
            <div className="product-visual"><Icon name="products" strokeWidth={1.5} /></div>
            <div className="product-body">
              <h3>{p.name}</h3>
              <span className="sub">{p.cat}</span>
              <div className="product-meta"><b>Rp{p.price}</b><span>Stok {p.stock}</span></div>
              <div className="product-actions">
                <button className="btn btn-line btn-sm" onClick={() => showToast("Mode edit produk dibuka")}>Edit</button>
                <button className="btn btn-soft btn-sm" onClick={() => showToast("Status produk diubah")}>Aktif</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
