"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { AdminOrder, FulfillmentStatus, HistoryEntry, OrderPaymentStatus } from "@/lib/mock/orders";
import { canCancel, canFulfill, deriveSummary, isOrderCancelled, orderShipping, orderSubtotal, orderTotal, type OrderSummary } from "@/lib/order-flow";
import { AdminButton } from "../../atoms/admin-button";
import { StatusBadge } from "../../atoms/badges";
import { CloseButton } from "../../atoms/close-button";
import { Field } from "../../molecules/field";
import { FulfillmentGroupCard } from "../../molecules/fulfillment-group-card";
import { HistoryTimeline, type TimelineItem } from "../../molecules/history-timeline";
import { PAYMENT_TONE, SUMMARY_TONE } from "../../molecules/order-row";
import { useAdmin } from "../../providers/admin-provider";

/** History rows store plain status keys; map each to its label by what changed. */
function statusLabel(scope: HistoryEntry["scope"], key: string): string {
  if (scope === "payment") return t(`admin.orders.payment.${key as OrderPaymentStatus}`);
  if (scope === "order") return t(`admin.orders.summary.${key as OrderSummary}`);
  return t(`admin.orders.fulfillment.${key as FulfillmentStatus}`);
}

function historyTitle(entry: HistoryEntry) {
  const scopeName = entry.scope === "payment" ? t("admin.orders.cols.payment") : entry.scope === "order" ? t("admin.orders.title") : (entry.group ?? "");
  const change = entry.from
    ? t("admin.orders.modal.historyLine", { from: statusLabel(entry.scope, entry.from), to: statusLabel(entry.scope, entry.to) })
    : t("admin.orders.modal.historyFirst", { to: statusLabel(entry.scope, entry.to) });
  return <><b>{scopeName}</b>: {change}</>;
}

type OrderDetailModalProps = {
  order: AdminOrder | null;
  onClose: () => void;
};

export function OrderDetailModal({ order, onClose }: OrderDetailModalProps) {
  const { advanceGroup, cancelOrder, markRefunded } = useAdmin();
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

  const summary = order ? deriveSummary(order) : null;
  const history: TimelineItem[] = order
    ? [...order.history].reverse().map((h, i) => ({ key: `${i}-${h.at}`, at: h.at, title: historyTitle(h), meta: t("admin.orders.modal.by", { actor: h.actor }), note: h.note }))
    : [];

  return (
    <div className={`modal-backdrop${order ? " open" : ""}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide">
        {order && summary && (
          <>
            <div className="modal-head">
              <div>
                <h2>{t("admin.orders.orderLabel", { number: order.number })}</h2>
                <span className="sub">{t("admin.orders.modal.subtitle", { date: order.date, buyer: order.buyer })}</span>
              </div>
              <CloseButton label={t("common.close")} onClick={onClose} />
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 16 }}>
                <StatusBadge tone={SUMMARY_TONE[summary]}>{t(`admin.orders.summary.${summary}`)}</StatusBadge>
              </div>

              <div className="order-info">
                <div><b>{t("admin.orders.modal.customer")}</b>{order.buyer}<span className="sub" style={{ display: "block" }}>{order.phone}</span></div>
                <div><b>{t("admin.orders.modal.address")}</b>{order.address}</div>
              </div>

              <div className="order-block">
                <h3>{t("admin.orders.modal.payment")}</h3>
                <StatusBadge tone={PAYMENT_TONE[order.paymentStatus]}>{t(`admin.orders.payment.${order.paymentStatus}`)}</StatusBadge>
                <p className="sub" style={{ margin: "8px 0 10px" }}>{t("admin.orders.modal.paymentHint")}</p>
                <AdminButton small href="/admin/payments">{t("admin.orders.modal.openPayments")}</AdminButton>
                {order.paymentStatus === "refund_pending" && (
                  <div className="notice-box">
                    {t("admin.orders.modal.refundPending")}
                    <div style={{ marginTop: 10 }}>
                      <AdminButton variant="primary" small onClick={() => markRefunded(order.number)}>{t("admin.orders.modal.markRefunded")}</AdminButton>
                    </div>
                  </div>
                )}
                {order.cancelNote && <div className="notice-box">{t("admin.orders.modal.cancelledNote", { note: order.cancelNote })}</div>}
              </div>

              <div className="order-block">
                <h3>{t("admin.orders.modal.groups")}</h3>
                {order.groups.map((group) => (
                  <FulfillmentGroupCard key={group.id} group={group} canAdvance={canFulfill(order)} onAdvance={() => advanceGroup(order.number, group.id)} />
                ))}
                <div className="order-totals">
                  <div><span>{t("admin.orders.modal.subtotal")}</span><span>{money(orderSubtotal(order))}</span></div>
                  <div><span>{t("admin.orders.modal.shipping")}</span><span>{money(orderShipping(order))}</span></div>
                  <div className="grand"><span>{t("admin.orders.modal.total")}</span><span>{money(orderTotal(order))}</span></div>
                </div>
              </div>

              <div className="order-block">
                <h3>{t("admin.orders.modal.history")}</h3>
                <HistoryTimeline items={history} empty={t("admin.orders.modal.historyEmpty")} />
              </div>

              {!isOrderCancelled(order) && (
                <div className="cancel-area">
                  {canCancel(order) ? (
                    cancelling ? (
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
                    )
                  ) : (
                    <p className="sub">{t("admin.orders.modal.cancelBlocked")}</p>
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
