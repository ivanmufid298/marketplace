import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import { flowFor, groupSubtotal, isCancelled, nextStatus } from "@/lib/order-flow";
import type { FulfillmentGroup } from "@/lib/mock/orders";
import { AdminButton } from "../atoms/admin-button";
import { StatusStepper } from "./status-stepper";

type FulfillmentGroupCardProps = {
  group: FulfillmentGroup;
  /** False until payment is confirmed or when the order is cancelled. */
  canAdvance: boolean;
  onAdvance: () => void;
};

export function FulfillmentGroupCard({ group, canAdvance, onAdvance }: FulfillmentGroupCardProps) {
  const next = nextStatus(group);
  const cancelled = isCancelled(group);
  const steps = flowFor(group.kind).map((key) => ({ key, label: t(`admin.orders.fulfillment.${key}`) }));

  return (
    <section className="group-card">
      <div className="group-head">
        <div>
          <b>{t(`admin.orders.kind.${group.kind}`)}</b>
          <span className="sub" style={{ display: "block" }}>
            {t("admin.orders.modal.shippingLine", { method: group.shippingMethod, fee: money(group.shippingFee) })}
            {group.eta ? ` · ${t("admin.orders.modal.eta", { eta: group.eta })}` : ""}
          </span>
        </div>
        <strong>{money(groupSubtotal(group))}</strong>
      </div>
      <ul className="group-items">
        {group.items.map((line) => (
          <li key={line.name}>
            <span>{line.qty}× {line.name}</span>
            <span>{money(line.qty * line.price)}</span>
          </li>
        ))}
      </ul>
      {cancelled ? (
        <p className="sub">{t("admin.orders.modal.groupCancelled")}</p>
      ) : (
        <StatusStepper steps={steps} current={group.status} />
      )}
      {!cancelled && next && (
        <div className="group-action">
          <AdminButton variant="primary" small disabled={!canAdvance} onClick={onAdvance}>
            {t("admin.orders.modal.advance", { status: t(`admin.orders.fulfillment.${next}`) })}
          </AdminButton>
          {!canAdvance && <span className="sub">{t("admin.orders.modal.locked")}</span>}
        </div>
      )}
      {!cancelled && !next && <p className="sub group-done">✓ {t("admin.orders.modal.finished")}</p>}
    </section>
  );
}
