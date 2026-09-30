import { formatNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { adminProducts } from "@/lib/mock/admin";
import { AdminButton } from "../atoms/admin-button";
import { Icon } from "../atoms/icon";

type AdminProductCardProps = {
  product: (typeof adminProducts)[number];
  onEdit: () => void;
  onToggleStatus: () => void;
};

export function AdminProductCard({ product: p, onEdit, onToggleStatus }: AdminProductCardProps) {
  return (
    <article className="product">
      <div className="product-visual"><Icon name="products" strokeWidth={1.5} /></div>
      <div className="product-body">
        <h3>{p.name}</h3>
        <span className="sub">{p.cat}</span>
        <div className="product-meta"><b>Rp{p.price}</b><span>{t("admin.products.stock", { stock: p.stock })}</span></div>
        <div className="product-stats">
          <span><Icon name="pointer" />{t("admin.products.clicks", { count: formatNumber(p.clicks) })}</span>
          <span>{t("admin.products.mobileShare", { pct: p.mobileShare })}</span>
        </div>
        <div className="product-actions">
          <AdminButton small onClick={onEdit}>{t("admin.products.edit")}</AdminButton>
          <AdminButton variant="soft" small onClick={onToggleStatus}>{t("admin.products.active")}</AdminButton>
        </div>
      </div>
    </article>
  );
}
