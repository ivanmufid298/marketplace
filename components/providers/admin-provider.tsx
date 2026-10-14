"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { isCancelled, toPayment } from "@/lib/order-flow";
import { useAdminOrders, type AdminOrderServices, type OrdersStatus } from "@/features/orders";
import { useAdminReviews, type AdminReviewServices, type ReviewsError } from "@/features/reviews";
import type { OrderError } from "@/features/orders";
import {
  initialInteractions,
  initialReviews,
  type Interaction,
  type Payment,
  type Review,
} from "@/lib/mock/admin";
import type { Order } from "@/lib/mock/orders";
import { ProofViewerDialog } from "../organisms/admin/proof-viewer-dialog";

export type ModalType = "product" | "promo" | "voucher" | "banner" | "popup" | "shipping";

type AdminContextValue = {
  payments: Payment[];
  /** Accepts the proof of a payment (an order under review). */
  acceptPayment: (id: string) => Promise<void>;
  /** Rejects it with a reason the buyer will read. Returns false (with a toast) when it was refused. */
  rejectPayment: (id: string, reason: string) => Promise<boolean>;
  /** Shows the transfer proofs of a payment in a popup (database orders); the sample store only says what it would do. */
  viewProof: (id: string) => Promise<void>;
  interactions: Interaction[];
  activeInteractionId: string | null;
  selectInteraction: (id: string | null) => void;
  toggleInteractionStatus: (id: string) => void;
  replyInteraction: (id: string, text: string) => void;
  reviews: Review[];
  /** Whether the reviews come from the database (otherwise the sample reviews). */
  reviewsDatabase: boolean;
  reviewsStatus: OrdersStatus;
  reloadReviews: () => void;
  /** Hides a review from the shop, or shows it again. */
  toggleReview: (id: number) => Promise<void>;
  orders: Order[];
  /** Whether the orders come from the database (otherwise the sample store). */
  ordersDatabase: boolean;
  ordersStatus: OrdersStatus;
  reloadOrders: () => void;
  /** Cancels an order. Returns false (with a toast) when the reason is empty or the order can no longer be cancelled. */
  cancelOrder: (orderNumber: string, note: string) => Promise<boolean>;
  markRefunded: (orderNumber: string) => Promise<void>;
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

type AdminProviderProps = {
  children: ReactNode;
  /** Tests pass fakes, which also switches the orders to the database path. */
  orderServices?: AdminOrderServices;
  /** The same for the reviews. */
  reviewServices?: AdminReviewServices;
};

export function AdminProvider({ children, orderServices, reviewServices }: AdminProviderProps) {
  const { orders, status: ordersStatus, database: ordersDatabase, reload: reloadOrders, ...orderActions } = useAdminOrders(orderServices);
  const [interactions, setInteractions] = useState(initialInteractions);
  const [activeInteractionId, setActiveInteractionId] = useState<string | null>(initialInteractions[0].id);
  const [sampleReviews, setSampleReviews] = useState(initialReviews);
  const dbReviews = useAdminReviews(reviewServices);
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
  const payments = useMemo(() => orders.filter((o) => !isCancelled(o) || o.payment === "success").map(toPayment), [orders]);

  const orderByNumber = useCallback((number: string) => orders.find((o) => o.number === number), [orders]);
  const orderOfPayment = useCallback((id: string) => orderByNumber(id.replace("MKP-", "")), [orderByNumber]);
  const [viewingProof, setViewingProof] = useState<string | null>(null);
  const viewingProofOrder = viewingProof ? orders.find((o) => o.number === viewingProof) : undefined;
  const failure = useCallback((error: OrderError) => showToast(t(`admin.orders.errors.${error.kind}`)), [showToast]);

  const acceptPayment = useCallback(
    async (id: string) => {
      const order = orderOfPayment(id);
      if (!order) return;
      const result = await orderActions.acceptPayment(order);
      if (result.ok) showToast(t("admin.payments.toastAccepted"));
      else failure(result.error);
    },
    [failure, orderActions, orderOfPayment, showToast],
  );

  const rejectPayment = useCallback(
    async (id: string, reason: string) => {
      const order = orderOfPayment(id);
      if (!order) return false;
      const result = await orderActions.rejectPayment(order, reason);
      if (result.ok) showToast(t("admin.payments.toastRejected"));
      else failure(result.error);
      return result.ok;
    },
    [failure, orderActions, orderOfPayment, showToast],
  );

  const viewProof = useCallback(
    async (id: string) => {
      const order = orderOfPayment(id);
      if (!order) return;
      // The sample store keeps no files, so it only says what would happen; the database shows the real proof.
      if (!ordersDatabase) return showToast(t("admin.payments.toastProof"));
      if (!order.proofs?.length) return showToast(t("admin.orders.noProof"));
      setViewingProof(order.number);
    },
    [ordersDatabase, orderOfPayment, showToast],
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

  const reviews: Review[] = useMemo(
    () => (dbReviews.database ? dbReviews.reviews.map((r) => ({ id: r.id, buyer: r.buyer, product: r.product, rating: r.rating, text: r.text, status: r.hidden ? ("hidden" as const) : ("visible" as const), verified: r.verified })) : sampleReviews),
    [dbReviews.database, dbReviews.reviews, sampleReviews],
  );

  const toggleReview = useCallback(
    async (id: number) => {
      const current = reviews.find((r) => r.id === id);
      if (!current) return;
      const next = current.status === "visible" ? "hidden" : "visible";
      if (dbReviews.database) {
        const result = await dbReviews.setHidden(id, next === "hidden");
        showToast(result.ok ? (next === "visible" ? t("admin.reviews.toastShown") : t("admin.reviews.toastHidden")) : t(`admin.reviews.errors.${(result as { error: ReviewsError }).error}`));
        return;
      }
      setSampleReviews((prev) => prev.map((r) => (r.id === id ? { ...r, status: next } : r)));
      showToast(next === "visible" ? t("admin.reviews.toastShown") : t("admin.reviews.toastHidden"));
    },
    [dbReviews, reviews, showToast],
  );

  const cancelOrder = useCallback(
    async (orderNumber: string, note: string) => {
      const order = orderByNumber(orderNumber);
      if (!order) return false;
      if (!note.trim()) {
        showToast(t("admin.orders.toast.needNote"));
        return false;
      }
      const result = await orderActions.cancelOrder(order, note);
      if (result.ok) showToast(t("admin.orders.toast.cancelled"));
      else failure(result.error);
      return result.ok;
    },
    [failure, orderActions, orderByNumber, showToast],
  );

  const markRefunded = useCallback(
    async (orderNumber: string) => {
      const order = orderByNumber(orderNumber);
      if (!order) return;
      const result = await orderActions.markRefunded(order);
      if (result.ok) showToast(t("admin.orders.toast.refunded"));
      else failure(result.error);
    },
    [failure, orderActions, orderByNumber, showToast],
  );

  const resetData = useCallback(() => {
    orderActions.resetSample();
    showToast(t("admin.shell.resetDone"));
  }, [orderActions, showToast]);

  return (
    <AdminContext.Provider
      value={{
        payments, acceptPayment, rejectPayment, viewProof, interactions, activeInteractionId, selectInteraction, toggleInteractionStatus, replyInteraction,
        reviews, reviewsDatabase: dbReviews.database, reviewsStatus: dbReviews.status, reloadReviews: dbReviews.reload, toggleReview, orders, ordersDatabase, ordersStatus, reloadOrders, cancelOrder, markRefunded, resetData, modal, openModal: setModal, closeModal: () => setModal(null), sidebarOpen, setSidebarOpen, toast, showToast,
      }}
    >
      {children}
      {viewingProofOrder && <ProofViewerDialog order={viewingProofOrder} load={orderActions.proofLink} onClose={() => setViewingProof(null)} />}
    </AdminContext.Provider>
  );
}
