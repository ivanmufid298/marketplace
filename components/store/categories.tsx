"use client";

import { CATEGORIES } from "@/lib/store-data";
import { useStore } from "./store-provider";

export function Categories() {
  const { category, setCategory, savedOnly } = useStore();
  return (
    <nav className="categories" aria-label="Kategori">
      {["Semua", ...CATEGORIES].map((c) => (
        <button key={c} className={`chip${!savedOnly && category === c ? " active" : ""}`} onClick={() => setCategory(c)}>
          {c}
        </button>
      ))}
    </nav>
  );
}
