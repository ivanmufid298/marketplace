"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { formatDateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { canCancel, canFulfill, nextStatus } from "@/lib/order-flow";
import {
  initialInteractions,
  initialPayments,
  initialReviews,
  type Interaction,
  type Payment,
  type PaymentStatus,
  type Review,
} from "@/lib/mock/admin";
import { initialOrders, type AdminOrder, type HistoryEntry } from "@/lib/mock/orders";

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
  orders: AdminOrder[];
  /** Moves one fulfillment group to its next step. Only works once the order is paid. */
  advanceGroup: (orderNumber: string, groupId: string) => void;
  /** Cancels an order that has nothing shipped. Returns false (with a toast) when the note is empty or cancelling is not allowed. */
  cancelOrder: (orderNumber: string, note: string) => boolean;
  markRefunded: (orderNumber: string) => void;
  modal: ModalType | null;
  openModal: (type: ModalType) => void;
  closeModal: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toast: string;
  showToast: (msg: string) => void;
};

const AdminContext = createContext<AdminContextValue | null>(null);

/** A status-history row stamped with the current time and the acting admin. */
const historyEntry = (partial: Omit<HistoryEntry, "at" | "actor">): HistoryEntry => ({ at: formatDateTime(), actor: t("admin.orders.actor"), ...partial });

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside <AdminProvider>");
  return ctx;
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const [payments, setPayments] = useState(initialPayments);
  const [interactions, setInteractions] = useState(initialInteractions);
  const [activeInteractionId, setActiveInteractionId] = useState<string | null>(initialInteractions[0].id);
  const [reviews, setReviews] = useState(initialReviews);
  const [orders, setOrders] = useState(initialOrders);
  const [modal, setModal] = useState<ModalType | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 1800);
  }, []);

  const setPaymentStatus = useCallback(
    (id: string, status: PaymentStatus) => {
      setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
      showToast(status === "success" ? t("admin.payments.toastAccepted") : t("admin.payments.toastRejected"));
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

  const updateOrder = useCallback((orderNumber: string, update: (order: AdminOrder) => AdminOrder) => {
    setOrders((prev) => prev.map((o) => (o.number === orderNumber ? update(o) : o)));
  }, []);

  const advanceGroup = useCallback(
    (orderNumber: string, groupId: string) => {
      const order = orders.find((o) => o.number === orderNumber);
      const group = order?.groups.find((g) => g.id === groupId);
      if (!order || !group || !canFulfill(order)) return;
      const next = nextStatus(group);
      if (!next) return;
      updateOrder(orderNumber, (o) => ({
        ...o,
        groups: o.groups.map((g) => (g.id === groupId ? { ...g, status: next } : g)),
        history: [...o.history, historyEntry({ scope: "fulfillment", group: t(`admin.orders.kind.${group.kind}`), from: group.status, to: next })],
      }));
      showToast(t("admin.orders.toast.advanced"));
    },
    [orders, showToast, updateOrder],
  );

  const cancelOrder = useCallback(
    (orderNumber: string, note: string) => {
      const order = orders.find((o) => o.number === orderNumber);
      const reason = note.trim();
      if (!order || !canCancel(order)) return false;
      if (!reason) {
        showToast(t("admin.orders.toast.needNote"));
        return false;
      }
      const wasPaid = order.paymentStatus === "paid";
      updateOrder(orderNumber, (o) => ({
        ...o,
        cancelNote: reason,
        paymentStatus: wasPaid ? "refund_pending" : o.paymentStatus,
        groups: o.groups.map((g) => ({ ...g, status: "cancelled" })),
        history: [
          ...o.history,
          historyEntry({ scope: "order", to: "cancelled", note: reason }),
          ...(wasPaid ? [historyEntry({ scope: "payment", from: "paid", to: "refund_pending" })] : []),
        ],
      }));
      showToast(t("admin.orders.toast.cancelled"));
      return true;
    },
    [orders, showToast, updateOrder],
  );

  const markRefunded = useCallback(
    (orderNumber: string) => {
      updateOrder(orderNumber, (o) =>
        o.paymentStatus === "refund_pending"
          ? { ...o, paymentStatus: "refunded", history: [...o.history, historyEntry({ scope: "payment", from: "refund_pending", to: "refunded" })] }
          : o,
      );
      showToast(t("admin.orders.toast.refunded"));
    },
    [showToast, updateOrder],
  );

  return (
    <AdminContext.Provider
      value={{
        payments, setPaymentStatus, interactions, activeInteractionId, selectInteraction, toggleInteractionStatus, replyInteraction,
        reviews, toggleReview, orders, advanceGroup, cancelOrder, markRefunded, modal, openModal: setModal, closeModal: () => setModal(null), sidebarOpen, setSidebarOpen, toast, showToast,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}
