"use client";

import { useBrand } from "@/features/brand";
import { t } from "@/lib/i18n";

export function Footer() {
  const { name } = useBrand();
  return (
    <footer>
      <div className="shell footer-in">
        <span className="footer-brand">{name}</span>
        <span>{t("store.footer.text")}</span>
      </div>
    </footer>
  );
}
