"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Order } from "@/lib/mock/orders";
import { subtotal, total, canCancel, deriveStatus, STATUS_STEPS } from "@/lib/order-flow";
import { products } from "@/lib/mock/store";
import { AdminButton } from "../../atoms/admin-button";
import { StatusBadge } from "../../atoms/badges";
import { CloseButton } from "../../atoms/close-button";
import { Field } from "../../molecules/field";
import { HistoryTimeline, type TimelineItem } from "../../molecules/history-timeline";
import { STATUS_TONE } from "../../molecules/order-row";
import { StatusStepper } from "../../molecules/status-stepper";
import { useAdmin } from "../../providers/admin-provider";

type OrderDetailModalProps = {
  order: Order | null;
  onClose: () => void;
};

export function OrderDetailModal({ order, onClose }: OrderDetailModalProps) {
  const { cancelOrder, markRefunded } = useAdmin();
  const [cancelling, setCancelling] = useState(false);
  const [note, setNote] = useState("");

  // Start every order from a closed cancel form.
  useEffect(() => {
    setCancelling(false);
    setNote("");
  }, [order?.number]);

  useEffect(() => {
    if (!order) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [order, onClose]);

  const status = order ? deriveStatus(order) : null;
  const history: TimelineItem[] = order
    ? [...order.history].reverse().map((h, i) => ({
        key: `${i}-${h.at}`,
        at: h.at,
        title: <b>{t(`admin.orders.events.${h.event}`)}</b>,
        meta: t("admin.orders.modal.by", { actor: h.actor }),
        note: h.note,
      }))
    : [];

  return (
    <div className={`modal-backdrop${order ? " open" : ""}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide">
        {order && status && (
          <>
            <div className="modal-head">
              <div>
                <h2>{t("admin.orders.orderLabel", { number: order.number })}</h2>
                <span className="sub">{t("admin.orders.modal.subtitle", { date: order.date, buyer: order.buyer })}</span>
              </div>
              <CloseButton label={t("common.close")} onClick={onClose} />
            </div>
            <div className="modal-body">
              <div className="order-info">
                <div><b>{t("admin.orders.modal.customer")}</b>{order.buyer}<span className="sub" style={{ display: "block" }}>{order.phone}</span></div>
                <div><b>{t("admin.orders.modal.address")}</b>{order.address}</div>
              </div>

              <div className="order-block">
                <h3>{t("admin.orders.modal.statusHeading")}</h3>
                <StatusBadge tone={STATUS_TONE[status]}>{t(`admin.orders.status.${status}`)}</StatusBadge>
                <div style={{ marginTop: 12 }}>
                  <StatusStepper
                    steps={STATUS_STEPS.map((key) => ({ key, label: t(`admin.orders.status.${key}`) }))}
                    current={status}
                    cancelled={status === "cancelled"}
                  />
                </div>
                <p className="sub" style={{ margin: "10px 0" }}>{t("admin.orders.modal.statusHint")}</p>
                <AdminButton small href="/admin/payments">{t("admin.orders.modal.openPayments")}</AdminButton>
                {order.cancelNote && <div className="notice-box">{t("admin.orders.modal.cancelledNote", { note: order.cancelNote })}</div>}
                {order.refund === "pending" && (
                  <div className="notice-box">
                    {t("admin.orders.modal.refundPending")}
                    <div style={{ marginTop: 10 }}>
                      <AdminButton variant="primary" small onClick={() => markRefunded(order.number)}>{t("admin.orders.modal.markRefunded")}</AdminButton>
                    </div>
                  </div>
                )}
                {order.refund === "done" && <div className="notice-box">{t("admin.orders.modal.refundDone")}</div>}
              </div>

              <div className="order-block">
                <h3>{t("admin.orders.modal.items")}</h3>
                <ul className="group-items">
                  {order.items.map((item) => (
                    <li key={item.productId}>
                      <span>{item.qty}× {products.find((p) => p.id === item.productId)?.name}</span>
                      <span>{money(item.qty * item.price)}</span>
                    </li>
                  ))}
                </ul>
                <span className="sub">{t("admin.orders.modal.shippingLine", { method: order.shippingMethod, fee: money(order.shippingFee) })}</span>
                <div className="order-totals">
                  <div><span>{t("admin.orders.modal.subtotal")}</span><span>{money(subtotal(order))}</span></div>
                  <div><span>{t("admin.orders.modal.shipping")}</span><span>{money(order.shippingFee)}</span></div>
                  <div className="grand"><span>{t("admin.orders.modal.total")}</span><span>{money(total(order))}</span></div>
                </div>
              </div>

              <div className="order-block">
                <h3>{t("admin.orders.modal.history")}</h3>
                <HistoryTimeline items={history} empty={t("admin.orders.modal.historyEmpty")} />
              </div>

              {canCancel(order) && (
                <div className="cancel-area">
                  {cancelling ? (
                    <>
                      <Field label={t("admin.orders.modal.cancelHeading")} htmlFor="cancelNote">
                        <textarea id="cancelNote" placeholder={t("admin.orders.modal.cancelPlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
                      </Field>
                      <div className="cancel-actions">
                        <AdminButton onClick={() => setCancelling(false)}>{t("admin.orders.modal.cancelBack")}</AdminButton>
                        <AdminButton variant="primary" onClick={() => cancelOrder(order.number, note)}>{t("admin.orders.modal.cancelConfirm")}</AdminButton>
                      </div>
                    </>
                  ) : (
                    <AdminButton className="danger" onClick={() => setCancelling(true)}>{t("admin.orders.modal.cancelOrder")}</AdminButton>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
