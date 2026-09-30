"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { toPayment } from "@/lib/order-flow";
import * as ordersStore from "@/lib/orders-store";
import {
  initialInteractions,
  initialReviews,
  type Interaction,
  type Payment,
  type PaymentStatus,
  type Review,
} from "@/lib/mock/admin";
import type { Order } from "@/lib/mock/orders";

export type ModalType = "product" | "promo" | "voucher" | "banner" | "popup" | "shipping";

type AdminContextValue = {
  payments: Payment[];
  setPaymentStatus: (id: string, status: PaymentStatus) => void;
  interactions: Interaction[];
  activeInteractionId: string | null;
  selectInteraction: (id: string | null) => void;
  toggleInteractionStatus: (id: string) => void;
  replyInteraction: (id: string, text: string) => void;
  reviews: Review[];
  toggleReview: (id: number) => void;
  orders: Order[];
  /** Cancels an order. Returns false (with a toast) when the reason is empty or the order can no longer be cancelled. */
  cancelOrder: (orderNumber: string, note: string) => boolean;
  markRefunded: (orderNumber: string) => void;
  resetData: () => void;
  modal: ModalType | null;
  openModal: (type: ModalType) => void;
  closeModal: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toast: string;
  showToast: (msg: string) => void;
};

const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside <AdminProvider>");
  return ctx;
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const orders = ordersStore.useOrders();
  const [interactions, setInteractions] = useState(initialInteractions);
  const [activeInteractionId, setActiveInteractionId] = useState<string | null>(initialInteractions[0].id);
  const [reviews, setReviews] = useState(initialReviews);
  const [modal, setModal] = useState<ModalType | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 1800);
  }, []);

  // Orders that were cancelled before any money arrived have no payment to verify.
  const payments = useMemo(() => orders.filter((o) => o.cancelNote === undefined || o.payment === "success").map(toPayment), [orders]);

  const setPaymentStatus = useCallback(
    (id: string, status: PaymentStatus) => {
      const number = id.replace("MKP-", "");
      const ok = status === "success" ? ordersStore.acceptPayment(number) : ordersStore.rejectPayment(number);
      if (ok) showToast(status === "success" ? t("admin.payments.toastAccepted") : t("admin.payments.toastRejected"));
    },
    [showToast],
  );

  const selectInteraction = useCallback((id: string | null) => {
    setActiveInteractionId(id);
    if (id) setInteractions((prev) => prev.map((i) => (i.id === id ? { ...i, unread: 0 } : i)));
  }, []);

  const toggleInteractionStatus = useCallback(
    (id: string) => {
      const current = interactions.find((i) => i.id === id);
      if (!current) return;
      const next = current.status === "open" ? "handled" : "open";
      setInteractions((prev) => prev.map((i) => (i.id === id ? { ...i, status: next } : i)));
      showToast(next === "handled" ? t("admin.interactions.toastHandled") : t("admin.interactions.toastReopened"));
    },
    [interactions, showToast],
  );

  const replyInteraction = useCallback((id: string, text: string) => {
    const msg = text.trim();
    if (!msg) return;
    setInteractions((prev) =>
      prev.map((i) => (i.id === id ? { ...i, preview: msg, messages: [...i.messages, { from: "admin", text: msg, time: t("admin.interactions.now") }] } : i)),
    );
  }, []);

  const toggleReview = useCallback(
    (id: number) => {
      const current = reviews.find((r) => r.id === id);
      if (!current) return;
      const next = current.status === "visible" ? "hidden" : "visible";
      setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, status: next } : r)));
      showToast(next === "visible" ? t("admin.reviews.toastShown") : t("admin.reviews.toastHidden"));
    },
    [reviews, showToast],
  );

  const cancelOrder = useCallback(
    (orderNumber: string, note: string) => {
      if (!note.trim()) {
        showToast(t("admin.orders.toast.needNote"));
        return false;
      }
      const ok = ordersStore.cancelOrder(orderNumber, note);
      if (ok) showToast(t("admin.orders.toast.cancelled"));
      return ok;
    },
    [showToast],
  );

  const markRefunded = useCallback(
    (orderNumber: string) => {
      if (ordersStore.markRefunded(orderNumber)) showToast(t("admin.orders.toast.refunded"));
    },
    [showToast],
  );

  const resetData = useCallback(() => {
    ordersStore.resetOrders();
    showToast(t("admin.shell.resetDone"));
  }, [showToast]);

  return (
    <AdminContext.Provider
      value={{
        payments, setPaymentStatus, interactions, activeInteractionId, selectInteraction, toggleInteractionStatus, replyInteraction,
        reviews, toggleReview, orders, cancelOrder, markRefunded, resetData, modal, openModal: setModal, closeModal: () => setModal(null), sidebarOpen, setSidebarOpen, toast, showToast,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}
