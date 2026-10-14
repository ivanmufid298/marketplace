"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { INITIAL_MY_REVIEWS, type MyReview, type Order } from "@/lib/mock/orders";
import { useAuth } from "@/features/auth";
import { useCart, type CartLine } from "@/features/cart";
import { useCheckout, type Address } from "@/features/checkout";
import { useCatalog, type Product, type SortMode } from "@/features/catalog";
import { useNotifications, type AppNotification, type NotificationServices, type Notifications } from "@/features/notifications";
import { useMyReviews, type BuyerReviewServices } from "@/features/reviews";
import { useBuyerOrders, useOrderErrorText, type ShippingMethod } from "@/features/orders";
import { useUi, type PanelId } from "@/shared/ui-state/ui-provider";

export type MobileNavMode = "home" | "category" | "saved" | "orders" | "cart";

type StoreContextValue = {
  products: Product[];
  visibleProducts: Product[];
  category: string;
  setCategory: (c: string) => void;
  query: string;
  setQuery: (q: string) => void;
  sort: SortMode;
  setSort: (s: SortMode) => void;
  savedOnly: boolean;
  liked: Set<number>;
  toggleLike: (id: number) => void;
  cart: CartLine[];
  cartCount: number;
  subtotal: number;
  addToCart: (p: Product) => void;
  changeQty: (id: number, delta: number) => void;
  removeFromCart: (id: number) => void;
  selected: Product | null;
  openDetail: (p: Product) => void;
  panels: Record<PanelId, boolean>;
  openPanel: (id: PanelId) => void;
  closePanel: (id: PanelId) => void;
  togglePanel: (id: PanelId) => void;
  mobileNav: (mode: MobileNavMode) => void;
  checkoutStep: number;
  goCheckoutStep: (step: number) => void;
  startCheckout: () => void;
  /** A checkout the buyer started and closed before finishing, with the step it stopped at. `null` when there is none. */
  pendingCheckout: { step: number } | null;
  /** Opens the checkout again where the buyer left it. */
  resumeCheckout: () => void;
  address: Address;
  setAddressField: (k: keyof Address, v: string) => void;
  /** The code of the chosen shipping method. */
  shipping: string;
  setShipping: (s: string) => void;
  shippingMethods: ShippingMethod[];
  shippingCost: number;
  proofName: string;
  setProof: (file: File | null) => boolean;
  /** Places the order and sends the proof. False while a request is already running. */
  placeOrder: () => void;
  placing: boolean;
  /** Sends a transfer proof for an order that has none yet. */
  sendOrderProof: (order: Order, file: File) => Promise<boolean>;
  orderNumber: string;
  finishOrder: () => void;
  toast: string;
  showToast: (msg: string) => void;
  scrollToProducts: () => void;
  /** Orders of the signed-in buyer, newest first. */
  /** Whether a buyer is signed in. Guests can browse and fill a cart but must sign in to chat or check out. */
  signedIn: boolean;
  orders: Order[];
  /** Buyer taps "Pesanan selesai" on a paid order. */
  completeOrder: (orderNumber: string) => Promise<void>;
  myReviews: Record<string, MyReview>;
  /** What happened to the buyer's orders and what they still have to do. */
  notifications: Notifications;
  /** The buyer chose a notification: it is marked read and "Pesanan saya" opens, where the thing to do is. */
  openNotification: (notification: AppNotification) => void;
  /** Saves the review of one order item. Returns false (with a toast) when rating or text is missing. */
  saveReview: (orderNumber: string, productId: number, review: MyReview) => boolean | Promise<boolean>;
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}

type StoreProviderProps = {
  children: ReactNode;
  /** Tests pass fakes for the buyer's own reviews, which also switches them to the database path. */
  reviewServices?: BuyerReviewServices;
  /** The same for the buyer's notifications. */
  notificationServices?: NotificationServices;
};

export function StoreProvider({ children, reviewServices, notificationServices }: StoreProviderProps) {
  const { products, getProduct, visibleProducts, category, setCategory, query, setQuery, sort, setSort, savedOnly, liked, toggleLike, selected, openDetail, showSaved, showAll, scrollToProducts } = useCatalog();
  const { orders, sendProof, confirmReceived } = useBuyerOrders();
  const { cart, cartCount, subtotal, loaded: cartLoaded, addToCart, changeQty, removeFromCart } = useCart();
  const { checkoutStep, goCheckoutStep, startCheckout, pendingCheckout, resumeCheckout, address, setAddressField, shipping, setShipping, shippingMethods, shippingCost, proofName, setProof, placeOrder, placing, orderNumber, finishOrder } = useCheckout();
  const { panels, setPanel, openPanel, closePanel, togglePanel, toast, showToast } = useUi();
  const [localReviews, setLocalReviews] = useState(INITIAL_MY_REVIEWS);
  const { user, loginOpen, intent, closeLogin } = useAuth();
  const reviews = useMyReviews(user?.id ?? null, reviewServices);
  const notifications = useNotifications(user?.id ?? null, notificationServices);

  const orderErrorText = useOrderErrorText();

  // A user appearing while the login dialog is open means sign-in worked: close it and pick up where the buyer left off.
  // The cart and the checkout carry on their own part (adding the picked product, opening the checkout) when it is theirs.
  useEffect(() => {
    if (!user || !loginOpen) return;
    if (intent === "cart" && !cartLoaded) return;
    closeLogin();
    if (intent === "orders") setPanel("orders", true);
  }, [user, loginOpen, intent, cartLoaded, closeLogin, setPanel]);

  const sendOrderProof = useCallback(
    async (order: Order, file: File) => {
      const result = await sendProof(order, file);
      showToast(result.ok ? t("store.toast.proofSent") : orderErrorText(result.error));
      return result.ok;
    },
    [orderErrorText, sendProof, showToast],
  );

  const completeOrder = useCallback(
    async (orderNumber: string) => {
      const order = orders.find((o) => o.number === orderNumber);
      if (!order) return;
      const result = await confirmReceived(order);
      showToast(result.ok ? t("store.toast.orderCompleted") : orderErrorText(result.error));
    },
    [confirmReceived, orderErrorText, orders, showToast],
  );

  // The buyer's reviews as the order screens read them, by "order number:product". In the database they come from the
  // reviews table, matched to the order items they are about; otherwise from this browser.
  const myReviews = useMemo(() => {
    if (!reviews.database) return localReviews;
    const out: Record<string, MyReview> = {};
    for (const order of orders) {
      for (const item of order.items) {
        const mine = item.itemId === undefined ? undefined : reviews.byItemId[item.itemId];
        if (mine) out[`${order.number}:${item.productId}`] = { rating: mine.rating, text: mine.body };
      }
    }
    return out;
  }, [localReviews, orders, reviews.byItemId, reviews.database]);

  const saveReview = useCallback(
    (orderNumber: string, productId: number, review: MyReview): boolean | Promise<boolean> => {
      if (review.rating < 1) {
        showToast(t("store.toast.reviewNeedRating"));
        return false;
      }
      if (!review.text) {
        showToast(t("store.toast.reviewNeedText"));
        return false;
      }
      const key = `${orderNumber}:${productId}`;
      const updating = Boolean(myReviews[key]);
      if (!reviews.database) {
        showToast(updating ? t("store.toast.reviewUpdated") : t("store.toast.reviewSent"));
        setLocalReviews((prev) => ({ ...prev, [key]: review }));
        return true;
      }
      const itemId = orders.find((o) => o.number === orderNumber)?.items.find((i) => i.productId === productId)?.itemId;
      if (itemId === undefined) {
        showToast(t("store.reviewErrors.itemNotFound"));
        return false;
      }
      return reviews.submit(itemId, review.rating, review.text).then((result) => {
        showToast(result.ok ? (updating ? t("store.toast.reviewUpdated") : t("store.toast.reviewSent")) : t(`store.reviewErrors.${result.error}`));
        return result.ok;
      });
    },
    [myReviews, orders, reviews, showToast],
  );

  const { markRead: markNotificationRead } = notifications;
  const openNotification = useCallback(
    (notification: AppNotification) => {
      void markNotificationRead(notification.id);
      closePanel("notifications");
      openPanel("orders");
    },
    [closePanel, markNotificationRead, openPanel],
  );

  const mobileNav = useCallback(
    (mode: MobileNavMode) => {
      if (mode === "category") return setPanel("categorySheet", true);
      if (mode === "cart") return setPanel("drawer", true);
      if (mode === "orders") return setPanel("orders", true);
      if (mode === "saved") return showSaved();
      showAll();
    },
    [setPanel, showAll, showSaved],
  );

  const value: StoreContextValue = {
    products, visibleProducts, category, setCategory, query, setQuery, sort, setSort, savedOnly, liked, toggleLike,
    cart, cartCount, subtotal, addToCart, changeQty, removeFromCart, selected, openDetail,
    panels, openPanel, closePanel, togglePanel, mobileNav,
    checkoutStep, goCheckoutStep, startCheckout, pendingCheckout, resumeCheckout,
    address, setAddressField,
    shipping, setShipping, shippingMethods, shippingCost, proofName, setProof, placeOrder, placing, sendOrderProof, orderNumber, finishOrder,
    toast, showToast, scrollToProducts, signedIn: Boolean(user), orders, completeOrder, myReviews, saveReview, notifications, openNotification,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
