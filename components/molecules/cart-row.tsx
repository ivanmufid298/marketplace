import { money, spritePosition } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Product } from "@/lib/mock/store";
import { CloseButton } from "../atoms/close-button";
import { QuantityStepper } from "./quantity-stepper";

type CartRowProps = {
  product: Product;
  qty: number;
  onChangeQty: (delta: number) => void;
  onRemove: () => void;
};

export function CartRow({ product: p, qty, onChangeQty, onRemove }: CartRowProps) {
  return (
    <div className="cart-row">
      <div className="cart-thumb" style={{ backgroundPosition: spritePosition(p.pos) }} />
      <div className="cart-meta">
        <b>{p.name}</b>
        <small>{p.shop}</small>
        <div className="price">{money(p.price)}</div>
        <QuantityStepper
          qty={qty}
          max={p.stock}
          decreaseLabel={t("store.cart.decrease", { name: p.name })}
          increaseLabel={t("store.cart.increase", { name: p.name })}
          onDecrease={() => onChangeQty(-1)}
          onIncrease={() => onChangeQty(1)}
        />
      </div>
      <CloseButton label={t("store.cart.remove", { name: p.name })} style={{ width: 32, height: 32, fontSize: 18 }} onClick={onRemove} />
    </div>
  );
}
