"use client";

import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import { Button } from "../../atoms/button";
import { CloseButton } from "../../atoms/close-button";
import { CartRow } from "../../molecules/cart-row";
import { SummaryLine } from "../../molecules/summary-box";
import { useAuth } from "../../providers/auth-provider";
import { useStore } from "../../providers/store-provider";

export function CartDrawer() {
  const { panels, closePanel, cart, products, subtotal, cartCount, changeQty, removeFromCart, startCheckout, signedIn } = useStore();
  const { openLogin } = useAuth();
  return (
    <aside className={`drawer${panels.drawer ? " open" : ""}`} id="drawer" aria-hidden={!panels.drawer}>
      <div className="overlay" onClick={() => closePanel("drawer")} />
      <div className="panel">
        <div className="panel-top">
          <h2>{t("store.cart.title")}</h2>
          <CloseButton label={t("common.close")} onClick={() => closePanel("drawer")} />
        </div>
        {!signedIn ? (
          <div className="cart-empty">
            {t("store.auth.cartPrompt")}
            <div style={{ marginTop: 14 }}>
              <Button onClick={() => openLogin("cart")}>{t("store.auth.promptAction")}</Button>
            </div>
          </div>
        ) : !cart.length ? (
          <div className="cart-empty">{t("store.cart.emptyLine1")}<br />{t("store.cart.emptyLine2")}</div>
        ) : (
          <>
            {cart.map((line) => {
              const product = products.find((p) => p.id === line.id);
              if (!product) return null;
              return (
                <CartRow key={line.id} product={product} qty={line.qty} onChangeQty={(delta) => changeQty(line.id, delta)} onRemove={() => removeFromCart(line.id)} />
              );
            })}
            <SummaryLine label={t("store.cart.subtotal", { count: cartCount })} value={money(subtotal)} />
            <div className="cart-total"><span>{t("store.cart.total")}</span><span>{money(subtotal)}</span></div>
            <Button variant="checkout" onClick={startCheckout}>{t("store.cart.checkout")}</Button>
          </>
        )}
      </div>
    </aside>
  );
}
