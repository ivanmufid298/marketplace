import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Product } from "@/lib/mock/store";
import { ProductImage } from "../atoms/product-image";

export function HotPromoItem({ product: p, onOpen }: { product: Product; onOpen: () => void }) {
  return (
    <button type="button" className="hot-item" onClick={onOpen}>
      <ProductImage product={p} as="span" className="hot-thumb" sizes="76px" />
      <span>
        <small>{t("store.hotPromo.remaining", { promo: p.promo ?? "", stock: p.stock })}</small>
        <b>{p.name}</b>
        <span className="hot-price">
          <strong>{money(p.price)}</strong>
          {p.oldPrice && <del>{money(p.oldPrice)}</del>}
        </span>
      </span>
    </button>
  );
}
