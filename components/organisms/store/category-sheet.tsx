"use client";

import { t } from "@/lib/i18n";
import { CATEGORIES } from "@/lib/mock/store";
import { CloseButton } from "../../atoms/close-button";
import { ALL_CATEGORIES, useStore } from "../../providers/store-provider";

export function CategorySheet() {
  const { panels, closePanel, category, setCategory, scrollToProducts } = useStore();
  const pick = (value: string) => {
    setCategory(value);
    closePanel("categorySheet");
    setTimeout(scrollToProducts, 0);
  };
  const options = [{ value: ALL_CATEGORIES, label: t("store.categorySheet.all") }, ...CATEGORIES.map((c) => ({ value: c, label: c }))];

  return (
    <aside className={`category-sheet${panels.categorySheet ? " open" : ""}`} aria-hidden={!panels.categorySheet}>
      <div className="overlay" onClick={() => closePanel("categorySheet")} />
      <div className="sheet-card">
        <div className="sheet-grip" />
        <div className="sheet-title">
          <h3>{t("store.categorySheet.title")}</h3>
          <CloseButton label={t("common.close")} onClick={() => closePanel("categorySheet")} />
        </div>
        <div className="sheet-options">
          {options.map((o) => (
            <button key={o.value} type="button" className={`sheet-option${category === o.value ? " active" : ""}`} onClick={() => pick(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
