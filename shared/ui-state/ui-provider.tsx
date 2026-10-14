"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

// Page-level UI state that every storefront module needs: which overlay panels are open, and the toast message.
// It lives in shared/ so that modules do not have to import each other just to open the cart or say "saved".

export type PanelId = "drawer" | "detail" | "checkout" | "categorySheet" | "chat" | "orders" | "notifications";

const ALL_PANELS_CLOSED: Record<PanelId, boolean> = { drawer: false, detail: false, checkout: false, categorySheet: false, chat: false, orders: false, notifications: false };
/** Panels that cover the page, so the page behind them must not scroll. The chat widget floats and does not lock. */
const SCROLL_LOCKING: PanelId[] = ["drawer", "detail", "checkout", "categorySheet", "orders", "notifications"];
const TOAST_MS = 1800;

type UiContextValue = {
  panels: Record<PanelId, boolean>;
  setPanel: (id: PanelId, on: boolean) => void;
  openPanel: (id: PanelId) => void;
  closePanel: (id: PanelId) => void;
  togglePanel: (id: PanelId) => void;
  toast: string;
  showToast: (msg: string) => void;
};

const UiContext = createContext<UiContextValue | null>(null);

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useUi must be used inside <UiProvider>");
  return ctx;
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [panels, setPanels] = useState(ALL_PANELS_CLOSED);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), TOAST_MS);
  }, []);

  const setPanel = useCallback((id: PanelId, on: boolean) => setPanels((p) => ({ ...p, [id]: on })), []);
  const openPanel = useCallback((id: PanelId) => setPanel(id, true), [setPanel]);
  const closePanel = useCallback((id: PanelId) => setPanel(id, false), [setPanel]);
  const togglePanel = useCallback((id: PanelId) => setPanels((p) => ({ ...p, [id]: !p[id] })), []);

  const locked = SCROLL_LOCKING.some((id) => panels[id]);
  useEffect(() => {
    document.body.style.overflow = locked ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [locked]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanels(ALL_PANELS_CLOSED);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(() => ({ panels, setPanel, openPanel, closePanel, togglePanel, toast, showToast }), [panels, setPanel, openPanel, closePanel, togglePanel, toast, showToast]);
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}
