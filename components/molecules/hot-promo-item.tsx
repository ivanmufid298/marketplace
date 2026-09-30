import { money, spritePosition } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Product } from "@/lib/mock/store";

export function HotPromoItem({ product: p, onOpen }: { product: Product; onOpen: () => void }) {
  return (
    <button type="button" className="hot-item" onClick={onOpen}>
      <span className="hot-thumb" style={{ backgroundPosition: spritePosition(p.pos) }} />
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
