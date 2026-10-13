import Link from "next/link";
import { t } from "@/lib/i18n";

export default function ProductNotFound() {
  return (
    <main className="shell product-page product-page-missing">
      <h1>{t("store.productPage.notFoundTitle")}</h1>
      <p>{t("store.productPage.notFoundText")}</p>
      <Link className="primary" href="/">{t("store.productPage.notFoundCta")}</Link>
    </main>
  );
}
