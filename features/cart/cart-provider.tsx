"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { useAuth } from "@/features/auth";
import { useCatalog, type Product } from "@/features/catalog";
import { useUi } from "@/shared/ui-state/ui-provider";

export type CartLine = { id: number; qty: number };

const CART_KEY_PREFIX = "marketplace-cart-v2:";
const LEGACY_CART_KEY = "marketplace-cart-v1";

type CartContextValue = {
  cart: CartLine[];
  cartCount: number;
  subtotal: number;
  /** Whether the signed-in account's saved cart has been read. Until then the cart is still empty and must not be judged. */
  loaded: boolean;
  addToCart: (p: Product) => void;
  changeQty: (id: number, delta: number) => void;
  removeFromCart: (id: number) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}

/**
 * The cart belongs to the signed-in account and is kept in this browser per account until it moves to the database.
 * Guests have no cart: adding to it asks them to sign in first, and the product is added once they have.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const { getProduct, status: catalogStatus } = useCatalog();
  const { user, ready, loginOpen, intent, openLogin, closeLogin } = useAuth();
  const { setPanel, showToast } = useUi();
  const userId = user?.id ?? null;
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOwner, setCartOwner] = useState<string | null>(null);
  const [pendingAdd, setPendingAdd] = useState<Product | null>(null);

  useEffect(() => {
    // The saved cart is checked against the catalog, so wait until the catalog has loaded; checking against an empty list would wipe it.
    if (!ready || catalogStatus !== "ready") return;
    let stored: CartLine[] = [];
    if (userId) {
      try {
        const raw: unknown = JSON.parse(window.localStorage.getItem(CART_KEY_PREFIX + userId) ?? "[]");
        if (Array.isArray(raw)) {
          stored = raw.flatMap((line: Partial<CartLine>) => {
            const product = getProduct(line.id as number);
            return product && typeof line.qty === "number" && line.qty > 0 ? [{ id: product.id, qty: Math.min(line.qty, product.stock) }] : [];
          });
        }
      } catch {
        // Unreadable cart: start empty.
      }
    }
    try {
      window.localStorage.removeItem(LEGACY_CART_KEY);
    } catch {
      // Storage blocked: nothing to clean up.
    }
    setCart(stored);
    setCartOwner(userId);
  }, [ready, catalogStatus, userId, getProduct]);

  useEffect(() => {
    if (!userId || cartOwner !== userId) return;
    try {
      window.localStorage.setItem(CART_KEY_PREFIX + userId, JSON.stringify(cart));
    } catch {
      // Storage blocked: the cart still works for this tab.
    }
  }, [cart, cartOwner, userId]);

  const addToCart = useCallback(
    (p: Product) => {
      if (!user) {
        // Remember what the buyer picked; it is added once they have signed in.
        setPendingAdd(p);
        openLogin("cart");
        return;
      }
      const line = cart.find((l) => l.id === p.id);
      if (line && line.qty >= p.stock) {
        showToast(t("store.toast.stockMax"));
        return;
      }
      setCart((prev) => (line ? prev.map((l) => (l.id === p.id ? { ...l, qty: l.qty + 1 } : l)) : [...prev, { id: p.id, qty: 1 }]));
      setPanel("detail", false);
      showToast(t("store.toast.cartAdded"));
    },
    [cart, openLogin, setPanel, showToast, user],
  );

  // A user appearing while the login dialog is open for the cart means sign-in worked: add what the buyer picked.
  useEffect(() => {
    if (!user || !loginOpen || intent !== "cart") return;
    // Adding has to wait until this account's saved cart has loaded, or it would be overwritten.
    if (cartOwner !== userId) return;
    closeLogin();
    if (pendingAdd) {
      addToCart(pendingAdd);
      setPendingAdd(null);
    }
  }, [user, userId, loginOpen, intent, cartOwner, pendingAdd, addToCart, closeLogin]);

  const changeQty = useCallback(
    (id: number, delta: number) => {
      const product = getProduct(id);
      if (!product) return;
      setCart((prev) =>
        prev
          .map((l) => (l.id === id ? { ...l, qty: Math.min(product.stock, l.qty + delta) } : l))
          .filter((l) => l.qty > 0),
      );
    },
    [getProduct],
  );

  const removeFromCart = useCallback((id: number) => setCart((prev) => prev.filter((l) => l.id !== id)), []);
  const clearCart = useCallback(() => setCart([]), []);

  const cartCount = cart.reduce((s, l) => s + l.qty, 0);
  const subtotal = cart.reduce((s, l) => s + (getProduct(l.id)?.price ?? 0) * l.qty, 0);
  const loaded = cartOwner === userId;

  const value = useMemo(
    () => ({ cart, cartCount, subtotal, loaded, addToCart, changeQty, removeFromCart, clearCart }),
    [cart, cartCount, subtotal, loaded, addToCart, changeQty, removeFromCart, clearCart],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
