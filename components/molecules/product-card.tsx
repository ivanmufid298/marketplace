import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Product } from "@/lib/mock/store";
import { StockBadge, Tag } from "../atoms/badges";
import { Icon } from "../atoms/icon";
import { ProductImage } from "../atoms/product-image";

type ProductCardProps = {
  product: Product;
  liked: boolean;
  onOpen: () => void;
  onToggleLike: () => void;
};

export function ProductCard({ product: p, liked, onOpen, onToggleLike }: ProductCardProps) {
  return (
    <article className="card" data-pos={p.pos} onClick={onOpen}>
      <ProductImage product={p} spriteFromParent className="photo" sizes="(max-width: 500px) 50vw, (max-width: 1000px) 33vw, 280px">
        {p.tag && <Tag>{p.tag}</Tag>}
        <button
          type="button"
          className={`heart${liked ? " active" : ""}`}
          aria-label={t("store.products.save", { name: p.name })}
          onClick={(e) => {
            e.stopPropagation();
            onToggleLike();
          }}
        >
          <Icon name="heart" filled={liked} />
        </button>
      </ProductImage>
      <div className="info">
        {p.shop && <div className="shop">{p.shop}</div>}
        <div className="product-line">
          <h3>{p.name}</h3>
          <span className="price">{money(p.price)}</span>
        </div>
        {p.rating && <div className="rating">{t("store.products.rating", { rating: p.rating })}</div>}
        {p.stock <= 3 && <StockBadge>{t("store.products.lowStock", { stock: p.stock })}</StockBadge>}
      </div>
    </article>
  );
}
