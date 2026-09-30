"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { products, SHIPPING_OPTIONS, type Product, type ShippingValue, type SortMode } from "@/lib/store-data";

export type PanelId = "drawer" | "detail" | "checkout" | "categorySheet" | "chat";
export type CartLine = { id: number; qty: number };
export type Address = { fullName: string; phone: string; address: string; city: string; postcode: string; note: string };
export type ChatMessage = { from: "user" | "admin"; text: string; meta: string };

const EMPTY_ADDRESS: Address = { fullName: "", phone: "", address: "", city: "", postcode: "", note: "" };
const REQUIRED_ADDRESS_FIELDS: (keyof Address)[] = ["fullName", "phone", "address", "city", "postcode"];

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
  mobileTab: string;
  mobileNav: (mode: string) => void;
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
  orderId: string;
  finishOrder: () => void;
  chatMessages: ChatMessage[];
  sendChat: (text: string) => void;
  toast: string;
  showToast: (msg: string) => void;
  scrollToProducts: () => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [category, setCategoryState] = useState("Semua");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("popular");
  const [savedOnly, setSavedOnly] = useState(false);
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [panels, setPanels] = useState<Record<PanelId, boolean>>({ drawer: false, detail: false, checkout: false, categorySheet: false, chat: false });
  const [mobileTab, setMobileTab] = useState("home");
  const [checkoutStep, setCheckoutStep] = useState(1);
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const [shipping, setShipping] = useState<ShippingValue>("regular");
  const [proofName, setProofName] = useState("");
  const [orderId, setOrderId] = useState("Order #MKP-000000");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{ from: "admin", text: "Halo! Ada yang bisa kami bantu?", meta: "Admin · sekarang" }]);
  const interactionId = useRef<string | null>(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

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
        (category === "Semua" || p.cat === category) &&
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
      showToast(liked.has(id) ? "Dihapus dari wishlist" : "Disimpan ke wishlist");
    },
    [liked, showToast],
  );

  const setPanel = useCallback((id: PanelId, on: boolean) => setPanels((p) => ({ ...p, [id]: on })), []);
  const openPanel = useCallback((id: PanelId) => setPanel(id, true), [setPanel]);
  const closePanel = useCallback((id: PanelId) => setPanel(id, false), [setPanel]);
  const togglePanel = useCallback((id: PanelId) => setPanels((p) => ({ ...p, [id]: !p[id] })), []);

  const openDetail = useCallback((p: Product) => {
    setSelected(p);
    setPanel("detail", true);
  }, [setPanel]);

  const addToCart = useCallback(
    (p: Product) => {
      const line = cart.find((l) => l.id === p.id);
      if (line && line.qty >= p.stock) {
        showToast("Jumlah sudah mencapai stok tersedia");
        return;
      }
      setCart((prev) => (line ? prev.map((l) => (l.id === p.id ? { ...l, qty: l.qty + 1 } : l)) : [...prev, { id: p.id, qty: 1 }]));
      setPanel("detail", false);
      showToast("Produk ditambahkan ke keranjang");
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

  const startCheckout = useCallback(() => {
    if (!cart.length) return;
    setPanel("drawer", false);
    setCheckoutStep(1);
    setPanel("checkout", true);
  }, [cart.length, setPanel]);

  const goCheckoutStep = useCallback(
    (step: number) => {
      if (step === 2) {
        const missing = REQUIRED_ADDRESS_FIELDS.find((k) => !address[k].trim());
        if (missing) {
          document.getElementById(missing)?.focus();
          showToast("Lengkapi alamat pengiriman dulu");
          return;
        }
      }
      setCheckoutStep(step);
      document.querySelector("#checkoutFlow .panel")?.scrollTo({ top: 0, behavior: "smooth" });
    },
    [address, showToast],
  );

  const proofFile = useRef<File | null>(null);
  const setProof = useCallback(
    (file: File | null) => {
      if (file && file.size > 5 * 1024 * 1024) {
        showToast("Ukuran file maksimal 5 MB");
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
      showToast("Unggah bukti transfer dulu");
      return;
    }
    setOrderId("Order #MKP-" + String(Date.now()).slice(-6));
    setCheckoutStep(4);
  }, [showToast]);

  const finishOrder = useCallback(() => {
    setCart([]);
    proofFile.current = null;
    setProofName("");
    setAddress(EMPTY_ADDRESS);
    setPanel("checkout", false);
    showToast("Terima kasih sudah berbelanja");
  }, [setPanel, showToast]);

  const sendChat = useCallback((text: string) => {
    const message = text.trim();
    if (!message) return;
    if (!interactionId.current) interactionId.current = "INT-" + String(Date.now()).slice(-6);
    const id = interactionId.current;
    setChatMessages((m) => [...m, { from: "user", text: message, meta: "Kamu · sekarang" }]);
    setTimeout(
      () => setChatMessages((m) => [...m, { from: "admin", text: `Pesanmu sudah masuk dengan nomor ${id}. Admin akan segera membalas ya.`, meta: "Sistem · sekarang" }]),
      550,
    );
  }, []);

  const scrollToProducts = useCallback(() => document.getElementById("products")?.scrollIntoView({ behavior: "smooth" }), []);

  const mobileNav = useCallback(
    (mode: string) => {
      if (mode === "category") {
        setPanel("categorySheet", true);
        return;
      }
      setMobileTab(mode);
      if (mode === "cart") {
        setPanel("drawer", true);
        return;
      }
      if (mode === "saved") {
        setSavedOnly(true);
        setCategoryState("Semua");
        setTimeout(scrollToProducts, 0);
        if (!liked.size) showToast("Wishlist kamu masih kosong");
      }
      if (mode === "home") {
        setSavedOnly(false);
        setCategoryState("Semua");
        setQuery("");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [liked.size, scrollToProducts, setPanel, showToast],
  );

  useEffect(() => {
    document.body.style.overflow = panels.drawer || panels.detail || panels.checkout || panels.categorySheet ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [panels.drawer, panels.detail, panels.checkout, panels.categorySheet]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanels({ drawer: false, detail: false, checkout: false, categorySheet: false, chat: false });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const value: StoreContextValue = {
    products, visibleProducts, category, setCategory, query, setQuery, sort, setSort, savedOnly, liked, toggleLike,
    cart, cartCount, subtotal, addToCart, changeQty, removeFromCart, selected, openDetail,
    panels, openPanel, closePanel, togglePanel, mobileTab, mobileNav,
    checkoutStep, goCheckoutStep, startCheckout,
    address, setAddressField: (k, v) => setAddress((a) => ({ ...a, [k]: v })),
    shipping, setShipping, shippingCost, proofName, setProof, placeOrder, orderId, finishOrder,
    chatMessages, sendChat, toast, showToast, scrollToProducts,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
