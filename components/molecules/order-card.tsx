import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { MyReview, Order, OrderStatus, Product } from "@/lib/mock/store";
import { StatusPill, type PillTone } from "../atoms/badges";
import { OrderItemLine } from "./order-item-line";

const STATUS_TONE: Record<OrderStatus, PillTone> = {
  pending_payment: "pending",
  payment_review: "pending",
  processing: "progress",
  partially_shipped: "progress",
  completed: "success",
  cancelled: "danger",
};

type OrderCardProps = {
  order: Order;
  products: Product[];
  reviews: Record<string, MyReview>;
  onSaveReview: (productId: number, review: MyReview) => boolean;
};

export function OrderCard({ order, products, reviews, onSaveReview }: OrderCardProps) {
  const lines = order.items.flatMap((item) => {
    const product = products.find((p) => p.id === item.productId);
    return product ? [{ product, qty: item.qty }] : [];
  });
  const subtotal = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0);

  return (
    <article className="order-card">
      <div className="order-head">
        <div>
          <b>{t("store.orders.orderLabel", { number: order.number })}</b>
          <small>{order.date}</small>
        </div>
        <StatusPill tone={STATUS_TONE[order.status]}>{t(`store.orders.status.${order.status}`)}</StatusPill>
      </div>
      {lines.map(({ product, qty }) => (
        <OrderItemLine
          key={product.id}
          product={product}
          qty={qty}
          canReview={order.status === "completed"}
          review={reviews[`${order.number}:${product.id}`]}
          onSaveReview={(review) => onSaveReview(product.id, review)}
        />
      ))}
      <div className="order-foot">
        <span>{t("store.orders.shipping")} {money(order.shippingCost)}</span>
        <span>{t("store.orders.total")} <b>{money(subtotal + order.shippingCost)}</b></span>
      </div>
    </article>
  );
}
