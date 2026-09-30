import { t } from "@/lib/i18n";

export function Footer() {
  return (
    <footer>
      <div className="shell footer-in">
        <span className="footer-brand">{t("common.brand")}</span>
        <span>{t("store.footer.text")}</span>
      </div>
    </footer>
  );
}
