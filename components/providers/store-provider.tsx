"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { INITIAL_MY_REVIEWS, type MyReview, type Order } from "@/lib/mock/orders";
import { formatDateTime } from "@/lib/format";
import { useAuth, type LoginIntent } from "@/features/auth";
import { useCatalog, type Product, type SortMode } from "@/features/catalog";
import { useNotifications, type AppNotification, type NotificationServices, type Notifications } from "@/features/notifications";
import { useMyReviews, type BuyerReviewServices } from "@/features/reviews";
import { MAX_PROOF_BYTES, MAX_PROOF_SOURCE_BYTES, useBuyerOrders, type OrderError, type ShippingMethod } from "@/features/orders";
import { useUi, type PanelId } from "@/shared/ui-state/ui-provider";

export type CartLine = { id: number; qty: number };
export type Address = { fullName: string; phone: string; address: string; city: string; postcode: string; note: string };
export type ChatMessage = { from: "user" | "admin"; text: string; meta: string };
export type MobileNavMode = "home" | "category" | "saved" | "orders" | "cart";

const EMPTY_ADDRESS: Address = { fullName: "", phone: "", address: "", city: "", postcode: "", note: "" };
const REQUIRED_ADDRESS_FIELDS: (keyof Address)[] = ["fullName", "phone", "address", "city", "postcode"];
const CART_KEY_PREFIX = "marketplace-cart-v2:";
/** A checkout the buyer left half done (step, address, shipping), kept per account so it survives closing the panel and a reload. */
const CHECKOUT_DRAFT_PREFIX = "marketplace-checkout-v1:";
const LEGACY_CART_KEY = "marketplace-cart-v1";

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
  chatMessages: ChatMessage[];
  sendChat: (text: string) => void;
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
  const { products, status: catalogStatus, getProduct, visibleProducts, category, setCategory, query, setQuery, sort, setSort, savedOnly, liked, toggleLike, selected, openDetail, showSaved, showAll, scrollToProducts } = useCatalog();
  const { orders, shippingMethods, placeOrder: submitOrder, sendProof, confirmReceived } = useBuyerOrders();
  const [cart, setCart] = useState<CartLine[]>([]);
  const { panels, setPanel, openPanel, closePanel, togglePanel, toast, showToast } = useUi();
  const [checkoutStep, setCheckoutStep] = useState(1);
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const [shipping, setShipping] = useState("regular");
  const [placing, setPlacing] = useState(false);
  const [proofName, setProofName] = useState("");
  const [orderNumber, setOrderNumber] = useState("000000");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{ from: "admin", text: t("store.chat.welcome"), meta: t("store.chat.metaAdmin") }]);
  const interactionId = useRef<string | null>(null);
  const proofFile = useRef<File | null>(null);
  const [localReviews, setLocalReviews] = useState(INITIAL_MY_REVIEWS);
  const { user, ready, loginOpen, intent, openLogin, closeLogin } = useAuth();
  const reviews = useMyReviews(user?.id ?? null, reviewServices);
  const notifications = useNotifications(user?.id ?? null, notificationServices);
  // The cart belongs to the signed-in account and is kept in this browser per account until it moves to the database.
  // Guests have no cart: adding to it asks them to sign in first.
  const userId = user?.id ?? null;
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

  const changeQty = useCallback((id: number, delta: number) => {
    const product = getProduct(id);
    if (!product) return;
    setCart((prev) =>
      prev
        .map((l) => (l.id === id ? { ...l, qty: Math.min(product.stock, l.qty + delta) } : l))
        .filter((l) => l.qty > 0),
    );
  }, [getProduct]);

  const removeFromCart = useCallback((id: number) => setCart((prev) => prev.filter((l) => l.id !== id)), []);

  const cartCount = cart.reduce((s, l) => s + l.qty, 0);
  const subtotal = cart.reduce((s, l) => s + (getProduct(l.id)?.price ?? 0) * l.qty, 0);
  const chosenShipping = shippingMethods.find((m) => m.value === shipping) ?? shippingMethods[0];
  const shippingCost = chosenShipping?.cost ?? 0;

  /** Returns true when signed in. Otherwise opens the login dialog for `why` and returns false. */
  const requireLogin = useCallback(
    (why: LoginIntent) => {
      if (user) return true;
      openLogin(why);
      return false;
    },
    [openLogin, user],
  );

  const startCheckout = useCallback(() => {
    if (!cart.length) return;
    if (!requireLogin("checkout")) return;
    setPanel("drawer", false);
    // A checkout left half done picks up where it stopped (payment, say); anything else starts at the address.
    setCheckoutStep((step) => (step === 2 || step === 3 ? step : 1));
    setPanel("checkout", true);
  }, [cart.length, requireLogin, setPanel]);

  // A user appearing while the login dialog is open means sign-in worked: close it and pick up where the buyer left off.
  useEffect(() => {
    if (!user || !loginOpen) return;
    // Adding to the cart has to wait until this account's saved cart has loaded, or it would be overwritten.
    if (intent === "cart" && cartOwner !== userId) return;
    closeLogin();
    if (intent === "cart" && pendingAdd) {
      addToCart(pendingAdd);
      setPendingAdd(null);
    }
    if (intent === "checkout" && cart.length) {
      setPanel("drawer", false);
      setCheckoutStep((step) => (step === 2 || step === 3 ? step : 1));
      setPanel("checkout", true);
    }
    if (intent === "orders") setPanel("orders", true);
    if (intent === "chat") setPanel("chat", true);
  }, [user, userId, loginOpen, intent, cartOwner, pendingAdd, cart.length, addToCart, closeLogin, setPanel]);

  // Pre-fill the receiver name from the account the first time.
  useEffect(() => {
    if (user) setAddress((a) => (a.fullName ? a : { ...a, fullName: user.name }));
  }, [user]);

  const goCheckoutStep = useCallback(
    (step: number) => {
      if (step === 2) {
        const missing = REQUIRED_ADDRESS_FIELDS.find((k) => !address[k].trim());
        if (missing) {
          document.getElementById(missing)?.focus();
          showToast(t("store.toast.fillAddress"));
          return;
        }
      }
      setCheckoutStep(step);
      document.querySelector("#checkoutFlow .panel")?.scrollTo({ top: 0, behavior: "smooth" });
    },
    [address, showToast],
  );

  const setProof = useCallback(
    (file: File | null) => {
      // A photo is shrunk before it is sent, so it may be big; a PDF (or a file of unknown type) has to fit as it is.
      if (file && file.size > (file.type.startsWith("image/") ? MAX_PROOF_SOURCE_BYTES : MAX_PROOF_BYTES)) {
        showToast(t("store.toast.fileTooBig"));
        return false;
      }
      proofFile.current = file;
      setProofName(file ? file.name : "");
      return true;
    },
    [showToast],
  );

  /** The words for a failed order action; products are named so the buyer knows which line to fix. */
  const orderErrorText = useCallback(
    (error: OrderError) => t(`store.orderErrors.${error.kind}`, { name: (error.productId ? getProduct(error.productId)?.name : undefined) ?? t("store.orderErrors.thisProduct") }),
    [getProduct],
  );

  const placeOrder = useCallback(async () => {
    if (placing) return;
    if (!proofFile.current) {
      showToast(t("store.toast.needProof"));
      return;
    }
    if (!user) {
      openLogin("checkout");
      return;
    }
    setPlacing(true);
    const result = await submitOrder({
      items: cart.flatMap((line) => {
        const product = getProduct(line.id);
        return product ? [{ productId: product.id, qty: line.qty, price: product.price }] : [];
      }),
      shippingCode: chosenShipping?.value ?? shipping,
      recipient: address.fullName.trim() || user.name,
      phone: address.phone.trim(),
      address: address.address.trim(),
      city: address.city.trim(),
      postcode: address.postcode.trim(),
      proof: proofFile.current,
    });
    setPlacing(false);
    if (!result.ok) {
      showToast(orderErrorText(result.error));
      return;
    }
    if (!result.value.proofSent) showToast(t("store.toast.proofPending"));
    setOrderNumber(result.value.number);
    setCheckoutStep(4);
  }, [address, cart, chosenShipping, getProduct, openLogin, orderErrorText, placing, shipping, showToast, submitOrder, user]);

  const sendOrderProof = useCallback(
    async (order: Order, file: File) => {
      const result = await sendProof(order, file);
      showToast(result.ok ? t("store.toast.proofSent") : orderErrorText(result.error));
      return result.ok;
    },
    [orderErrorText, sendProof, showToast],
  );

  const finishOrder = useCallback(() => {
    setCart([]);
    proofFile.current = null;
    setProofName("");
    setAddress(EMPTY_ADDRESS);
    setPanel("checkout", false);
    showToast(t("store.toast.thanks"));
  }, [setPanel, showToast]);

  // Closing the checkout from its last screen (the cross, or a click beside it) finishes the order too, so the cart is not
  // left full of what was just bought. The "back to the shop" button does that itself and has emptied the cart by then.
  const checkoutWasOpen = useRef(false);
  useEffect(() => {
    const wasOpen = checkoutWasOpen.current;
    checkoutWasOpen.current = panels.checkout;
    if (wasOpen && !panels.checkout && checkoutStep === 4 && cart.length > 0) finishOrder();
  }, [panels.checkout, checkoutStep, cart.length, finishOrder]);

  // A checkout left half done survives closing the panel and reloading the page: step, address, and shipping are kept per
  // account. (The proof file cannot be kept, so a reload during payment asks for it again.)
  const draftKey = userId ? CHECKOUT_DRAFT_PREFIX + userId : null;
  const midCheckout = checkoutStep === 2 || checkoutStep === 3;
  const restoredDraftFor = useRef<string | null>(null);
  useEffect(() => {
    if (!draftKey || cartOwner !== userId || restoredDraftFor.current === draftKey) return;
    restoredDraftFor.current = draftKey;
    if (!cart.length) return;
    try {
      const raw: unknown = JSON.parse(window.localStorage.getItem(draftKey) ?? "null");
      const draft = raw as { step?: unknown; address?: Partial<Address>; shipping?: unknown } | null;
      if (!draft || (draft.step !== 2 && draft.step !== 3)) return;
      setCheckoutStep(draft.step);
      if (draft.address && typeof draft.address === "object") setAddress((a) => ({ ...a, ...Object.fromEntries(Object.entries(draft.address as object).filter(([k, v]) => k in EMPTY_ADDRESS && typeof v === "string")) }));
      if (typeof draft.shipping === "string") setShipping(draft.shipping);
    } catch {
      // Unreadable draft: start the checkout from the beginning.
    }
  }, [draftKey, cartOwner, userId, cart.length]);

  useEffect(() => {
    if (!draftKey || cartOwner !== userId || restoredDraftFor.current !== draftKey) return;
    try {
      if (midCheckout && cart.length > 0) window.localStorage.setItem(draftKey, JSON.stringify({ step: checkoutStep, address, shipping }));
      else window.localStorage.removeItem(draftKey);
    } catch {
      // Storage blocked: the checkout still works for this tab.
    }
  }, [draftKey, cartOwner, userId, midCheckout, checkoutStep, address, shipping, cart.length]);

  // An emptied cart ends a half-done checkout: there is nothing left to pay for.
  useEffect(() => {
    if (cartOwner === userId && cart.length === 0 && midCheckout) setCheckoutStep(1);
  }, [cartOwner, userId, cart.length, midCheckout]);

  const pendingCheckout = useMemo(() => (user && cart.length > 0 && midCheckout && !panels.checkout ? { step: checkoutStep } : null), [user, cart.length, midCheckout, panels.checkout, checkoutStep]);
  const resumeCheckout = useCallback(() => {
    closePanel("notifications");
    startCheckout();
  }, [closePanel, startCheckout]);

  const sendChat = useCallback(
    (text: string) => {
    const message = text.trim();
    if (!message) return;
    if (!requireLogin("chat")) return;
    if (!interactionId.current) interactionId.current = "INT-" + String(Date.now()).slice(-6);
    const id = interactionId.current;
    setChatMessages((m) => [...m, { from: "user", text: message, meta: t("store.chat.metaUser") }]);
    setTimeout(
      () => setChatMessages((m) => [...m, { from: "admin", text: t("store.chat.autoReply", { id }), meta: t("store.chat.metaSystem") }]),
      550,
    );
    },
    [requireLogin],
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
    address, setAddressField: (k, v) => setAddress((a) => ({ ...a, [k]: v })),
    shipping, setShipping, shippingMethods, shippingCost, proofName, setProof, placeOrder, placing, sendOrderProof, orderNumber, finishOrder,
    chatMessages, sendChat, toast, showToast, scrollToProducts, signedIn: Boolean(user), orders, completeOrder, myReviews, saveReview, notifications, openNotification,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
