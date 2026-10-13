"use client";

import { t } from "@/lib/i18n";
import { Chip } from "../../atoms/chip";
import { ALL_CATEGORIES, useCatalog } from "@/features/catalog";

export function CategoryNav() {
  const { category, setCategory, savedOnly, categories } = useCatalog();
  const isActive = (value: string) => !savedOnly && category === value;
  return (
    <nav className="categories" aria-label={t("store.categories.navLabel")}>
      <Chip active={isActive(ALL_CATEGORIES)} onClick={() => setCategory(ALL_CATEGORIES)}>{t("store.categories.all")}</Chip>
      {categories.map((c) => (
        <Chip key={c} active={isActive(c)} onClick={() => setCategory(c)}>{c}</Chip>
      ))}
    </nav>
  );
}
