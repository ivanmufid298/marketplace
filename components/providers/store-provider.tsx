"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { INITIAL_MY_REVIEWS, type MyReview, type Order } from "@/lib/mock/orders";
import { products, SHIPPING_OPTIONS, type Product, type ShippingValue, type SortMode } from "@/lib/mock/store";
import * as ordersStore from "@/lib/orders-store";
import { useAuth, type LoginIntent } from "./auth-provider";

/** Sentinel for "no category filter". Display text comes from content/id.json. */
export const ALL_CATEGORIES = "all";

export type PanelId = "drawer" | "detail" | "checkout" | "categorySheet" | "chat" | "orders";
export type CartLine = { id: number; qty: number };
export type Address = { fullName: string; phone: string; address: string; city: string; postcode: string; note: string };
export type ChatMessage = { from: "user" | "admin"; text: string; meta: string };
export type MobileNavMode = "home" | "category" | "saved" | "orders" | "cart";

const EMPTY_ADDRESS: Address = { fullName: "", phone: "", address: "", city: "", postcode: "", note: "" };
const REQUIRED_ADDRESS_FIELDS: (keyof Address)[] = ["fullName", "phone", "address", "city", "postcode"];
const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const CART_KEY = "marketplace-cart-v1";
const ALL_PANELS_CLOSED: Record<PanelId, boolean> = { drawer: false, detail: false, checkout: false, categorySheet: false, chat: false, orders: false };

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
  address: Address;
  setAddressField: (k: keyof Address, v: string) => void;
  shipping: ShippingValue;
  setShipping: (s: ShippingValue) => void;
  shippingCost: number;
  proofName: string;
  setProof: (file: File | null) => boolean;
  placeOrder: () => void;
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
  completeOrder: (orderNumber: string) => void;
  myReviews: Record<string, MyReview>;
  /** Saves the review of one order item. Returns false (with a toast) when rating or text is missing. */
  saveReview: (orderNumber: string, productId: number, review: MyReview) => boolean;
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [category, setCategoryState] = useState(ALL_CATEGORIES);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("popular");
  const [savedOnly, setSavedOnly] = useState(false);
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [panels, setPanels] = useState(ALL_PANELS_CLOSED);
  const [checkoutStep, setCheckoutStep] = useState(1);
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const [shipping, setShipping] = useState<ShippingValue>("regular");
  const [proofName, setProofName] = useState("");
  const [orderNumber, setOrderNumber] = useState("000000");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{ from: "admin", text: t("store.chat.welcome"), meta: t("store.chat.metaAdmin") }]);
  const interactionId = useRef<string | null>(null);
  const proofFile = useRef<File | null>(null);
  const [myReviews, setMyReviews] = useState(INITIAL_MY_REVIEWS);
  const { user, loginOpen, intent, openLogin, closeLogin } = useAuth();
  const allOrders = ordersStore.useOrders();
  const orders = useMemo(() => (user ? allOrders.filter((o) => o.buyerId === user.id) : []), [allOrders, user]);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The cart lives in this browser so a guest's items survive a reload and a sign-in (PRD section 5).
  const [cartReady, setCartReady] = useState(false);
  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(window.localStorage.getItem(CART_KEY) ?? "[]");
      if (Array.isArray(stored)) {
        const valid = stored.flatMap((line: Partial<CartLine>) => {
          const product = products.find((p) => p.id === line.id);
          return product && typeof line.qty === "number" && line.qty > 0 ? [{ id: product.id, qty: Math.min(line.qty, product.stock) }] : [];
        });
        if (valid.length) setCart(valid);
      }
    } catch {
      // Unreadable cart: start empty.
    }
    setCartReady(true);
  }, []);
  useEffect(() => {
    if (!cartReady) return;
    try {
      window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      // Storage blocked: the cart still works for this tab.
    }
  }, [cart, cartReady]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1800);
  }, []);

  const setCategory = useCallback((c: string) => {
    setCategoryState(c);
    setSavedOnly(false);
  }, []);

  const visibleProducts = useMemo(() => {
    const list = products.filter(
      (p) =>
        (category === ALL_CATEGORIES || p.cat === category) &&
        (p.name + " " + p.shop + " " + p.cat).toLowerCase().includes(query) &&
        (!savedOnly || liked.has(p.id)),
    );
    if (sort === "low") list.sort((a, b) => a.price - b.price);
    if (sort === "high") list.sort((a, b) => b.price - a.price);
    return list;
  }, [category, query, savedOnly, liked, sort]);

  const toggleLike = useCallback(
    (id: number) => {
      setLiked((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      showToast(liked.has(id) ? t("store.toast.wishlistRemoved") : t("store.toast.wishlistAdded"));
    },
    [liked, showToast],
  );

  const setPanel = useCallback((id: PanelId, on: boolean) => setPanels((p) => ({ ...p, [id]: on })), []);
  const openPanel = useCallback((id: PanelId) => setPanel(id, true), [setPanel]);
  const closePanel = useCallback((id: PanelId) => setPanel(id, false), [setPanel]);
  const togglePanel = useCallback((id: PanelId) => setPanels((p) => ({ ...p, [id]: !p[id] })), []);

  const openDetail = useCallback(
    (p: Product) => {
      setSelected(p);
      setPanel("detail", true);
    },
    [setPanel],
  );

  const addToCart = useCallback(
    (p: Product) => {
      const line = cart.find((l) => l.id === p.id);
      if (line && line.qty >= p.stock) {
        showToast(t("store.toast.stockMax"));
        return;
      }
      setCart((prev) => (line ? prev.map((l) => (l.id === p.id ? { ...l, qty: l.qty + 1 } : l)) : [...prev, { id: p.id, qty: 1 }]));
      setPanel("detail", false);
      showToast(t("store.toast.cartAdded"));
    },
    [cart, setPanel, showToast],
  );

  const changeQty = useCallback((id: number, delta: number) => {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    setCart((prev) =>
      prev
        .map((l) => (l.id === id ? { ...l, qty: Math.min(product.stock, l.qty + delta) } : l))
        .filter((l) => l.qty > 0),
    );
  }, []);

  const removeFromCart = useCallback((id: number) => setCart((prev) => prev.filter((l) => l.id !== id)), []);

  const cartCount = cart.reduce((s, l) => s + l.qty, 0);
  const subtotal = cart.reduce((s, l) => s + (products.find((p) => p.id === l.id)?.price ?? 0) * l.qty, 0);
  const shippingCost = SHIPPING_OPTIONS.find((o) => o.value === shipping)?.cost ?? SHIPPING_OPTIONS[0].cost;

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
    setCheckoutStep(1);
    setPanel("checkout", true);
  }, [cart.length, requireLogin, setPanel]);

  // A user appearing while the login dialog is open means sign-in worked: close it and pick up where the buyer left off.
  useEffect(() => {
    if (!user || !loginOpen) return;
    closeLogin();
    if (intent === "checkout" && cart.length) {
      setPanel("drawer", false);
      setCheckoutStep(1);
      setPanel("checkout", true);
    }
    if (intent === "orders") setPanel("orders", true);
    if (intent === "chat") setPanel("chat", true);
  }, [user, loginOpen, intent, cart.length, closeLogin, setPanel]);

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
      if (file && file.size > MAX_PROOF_BYTES) {
        showToast(t("store.toast.fileTooBig"));
        return false;
      }
      proofFile.current = file;
      setProofName(file ? file.name : "");
      return true;
    },
    [showToast],
  );

  const placeOrder = useCallback(() => {
    if (!proofFile.current) {
      showToast(t("store.toast.needProof"));
      return;
    }
    if (!user) {
      openLogin("checkout");
      return;
    }
    const method = SHIPPING_OPTIONS.find((o) => o.value === shipping) ?? SHIPPING_OPTIONS[0];
    const number = ordersStore.createOrder({
      buyerId: user.id,
      buyer: address.fullName.trim() || user.name,
      phone: address.phone.trim(),
      address: [address.address, address.city, address.postcode].map((part) => part.trim()).filter(Boolean).join(", "),
      items: cart.flatMap((line) => {
        const product = products.find((p) => p.id === line.id);
        return product ? [{ productId: product.id, qty: line.qty, price: product.price }] : [];
      }),
      shippingMethod: method.label,
      shippingFee: method.cost,
    });
    setOrderNumber(number);
    setCheckoutStep(4);
  }, [address, cart, openLogin, shipping, showToast, user]);

  const finishOrder = useCallback(() => {
    setCart([]);
    proofFile.current = null;
    setProofName("");
    setAddress(EMPTY_ADDRESS);
    setPanel("checkout", false);
    showToast(t("store.toast.thanks"));
  }, [setPanel, showToast]);

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

  const scrollToProducts = useCallback(() => document.getElementById("products")?.scrollIntoView({ behavior: "smooth" }), []);

  const completeOrder = useCallback(
    (orderNumber: string) => {
      if (ordersStore.confirmReceived(orderNumber)) showToast(t("store.toast.orderCompleted"));
    },
    [showToast],
  );

  const saveReview = useCallback(
    (orderNumber: string, productId: number, review: MyReview) => {
      if (review.rating < 1) {
        showToast(t("store.toast.reviewNeedRating"));
        return false;
      }
      if (!review.text) {
        showToast(t("store.toast.reviewNeedText"));
        return false;
      }
      const key = `${orderNumber}:${productId}`;
      showToast(myReviews[key] ? t("store.toast.reviewUpdated") : t("store.toast.reviewSent"));
      setMyReviews((prev) => ({ ...prev, [key]: review }));
      return true;
    },
    [myReviews, showToast],
  );

  const mobileNav = useCallback(
    (mode: MobileNavMode) => {
      if (mode === "category") return setPanel("categorySheet", true);
      if (mode === "cart") return setPanel("drawer", true);
      if (mode === "orders") return setPanel("orders", true);
      if (mode === "saved") {
        setSavedOnly(true);
        setCategoryState(ALL_CATEGORIES);
        setTimeout(scrollToProducts, 0);
        if (!liked.size) showToast(t("store.toast.wishlistEmpty"));
        return;
      }
      setSavedOnly(false);
      setCategoryState(ALL_CATEGORIES);
      setQuery("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [liked.size, scrollToProducts, setPanel, showToast],
  );

  useEffect(() => {
    document.body.style.overflow = panels.drawer || panels.detail || panels.checkout || panels.categorySheet || panels.orders ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [panels.drawer, panels.detail, panels.checkout, panels.categorySheet, panels.orders]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanels(ALL_PANELS_CLOSED);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const value: StoreContextValue = {
    products, visibleProducts, category, setCategory, query, setQuery, sort, setSort, savedOnly, liked, toggleLike,
    cart, cartCount, subtotal, addToCart, changeQty, removeFromCart, selected, openDetail,
    panels, openPanel, closePanel, togglePanel, mobileNav,
    checkoutStep, goCheckoutStep, startCheckout,
    address, setAddressField: (k, v) => setAddress((a) => ({ ...a, [k]: v })),
    shipping, setShipping, shippingCost, proofName, setProof, placeOrder, orderNumber, finishOrder,
    chatMessages, sendChat, toast, showToast, scrollToProducts, signedIn: Boolean(user), orders, completeOrder, myReviews, saveReview,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
