"use client";

import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import { BANK_ACCOUNT, formatAccountNumber, SHIPPING_OPTIONS } from "@/lib/mock/store";
import { Button } from "../../atoms/button";
import { CloseButton } from "../../atoms/close-button";
import { BankCard } from "../../molecules/bank-card";
import { Field } from "../../molecules/field";
import { ShippingOption } from "../../molecules/shipping-option";
import { StepIndicator } from "../../molecules/step-indicator";
import { SummaryBox, SummaryLine } from "../../molecules/summary-box";
import { UploadField } from "../../molecules/upload-field";
import { useStore, type Address } from "../../providers/store-provider";

const STEPS = ["address", "shipping", "payment"] as const;

function OrderSummary() {
  const { subtotal, shippingCost } = useStore();
  return (
    <SummaryBox>
      <SummaryLine label={t("store.checkout.summary.subtotal")} value={money(subtotal)} />
      <SummaryLine label={t("store.checkout.summary.shipping")} value={money(shippingCost)} />
      <SummaryLine total label={t("store.checkout.summary.total")} value={money(subtotal + shippingCost)} />
    </SummaryBox>
  );
}

function AddressStep({ active }: { active: boolean }) {
  const { address, setAddressField, goCheckoutStep } = useStore();
  const input = (id: keyof Address, label: string, placeholder: string, props: { autoComplete?: string; inputMode?: "tel" | "numeric" } = {}) => (
    <Field label={label} htmlFor={id}>
      <input id={id} value={address[id]} placeholder={placeholder} onChange={(e) => setAddressField(id, e.target.value)} {...props} />
    </Field>
  );

  return (
    <section className={`co-page${active ? " active" : ""}`}>
      <h3>{t("store.checkout.address.title")}</h3>
      <p className="co-note">{t("store.checkout.address.note")}</p>
      <div className="fields">
        {input("fullName", t("store.checkout.address.fullName"), t("store.checkout.address.fullNamePlaceholder"), { autoComplete: "name" })}
        {input("phone", t("store.checkout.address.phone"), t("store.checkout.address.phonePlaceholder"), { inputMode: "tel" })}
        <Field full label={t("store.checkout.address.address")} htmlFor="address">
          <textarea id="address" placeholder={t("store.checkout.address.addressPlaceholder")} value={address.address} onChange={(e) => setAddressField("address", e.target.value)} />
        </Field>
        {input("city", t("store.checkout.address.city"), t("store.checkout.address.cityPlaceholder"))}
        {input("postcode", t("store.checkout.address.postcode"), t("store.checkout.address.postcodePlaceholder"), { inputMode: "numeric" })}
        <Field
          full
          htmlFor="note"
          label={<>{t("store.checkout.address.courierNote")} <span style={{ fontWeight: 400, color: "var(--muted)" }}>{t("store.checkout.address.optional")}</span></>}
        >
          <input id="note" placeholder={t("store.checkout.address.courierNotePlaceholder")} value={address.note} onChange={(e) => setAddressField("note", e.target.value)} />
        </Field>
      </div>
      <div className="co-actions">
        <span />
        <Button onClick={() => goCheckoutStep(2)}>{t("store.checkout.address.next")}</Button>
      </div>
    </section>
  );
}

function ShippingStep({ active }: { active: boolean }) {
  const { shipping, setShipping, goCheckoutStep } = useStore();
  return (
    <section className={`co-page${active ? " active" : ""}`}>
      <h3>{t("store.checkout.shipping.title")}</h3>
      <p className="co-note">{t("store.checkout.shipping.note")}</p>
      <div className="option-list">
        {SHIPPING_OPTIONS.map((o) => (
          <ShippingOption key={o.value} value={o.value} label={o.label} note={o.note} price={money(o.cost)} checked={shipping === o.value} onSelect={() => setShipping(o.value)} />
        ))}
      </div>
      <OrderSummary />
      <div className="co-actions">
        <Button variant="secondary" onClick={() => goCheckoutStep(1)}>{t("common.back")}</Button>
        <Button onClick={() => goCheckoutStep(3)}>{t("store.checkout.shipping.next")}</Button>
      </div>
    </section>
  );
}

function PaymentStep({ active }: { active: boolean }) {
  const { goCheckoutStep, placeOrder, proofName, setProof, showToast } = useStore();
  return (
    <section className={`co-page${active ? " active" : ""}`}>
      <h3>{t("store.checkout.payment.title")}</h3>
      <p className="co-note">{t("store.checkout.payment.note")}</p>
      <BankCard
        bank={BANK_ACCOUNT.bank}
        number={formatAccountNumber(BANK_ACCOUNT.number)}
        owner={BANK_ACCOUNT.owner}
        copyLabel={t("store.checkout.payment.copyAccount")}
        onCopy={() => {
          navigator.clipboard?.writeText(BANK_ACCOUNT.number);
          showToast(t("store.toast.accountCopied"));
        }}
      />
      <OrderSummary />
      <UploadField
        title={proofName ? "✓ " + proofName : t("store.checkout.payment.uploadTitle")}
        hint={t("store.checkout.payment.uploadHint")}
        accept="image/*,.pdf"
        onFile={(file, input) => {
          if (!setProof(file)) input.value = "";
        }}
      />
      <div className="co-actions">
        <Button variant="secondary" onClick={() => goCheckoutStep(2)}>{t("common.back")}</Button>
        <Button onClick={placeOrder}>{t("store.checkout.payment.placeOrder")}</Button>
      </div>
    </section>
  );
}

function SuccessStep({ active }: { active: boolean }) {
  const { orderNumber, finishOrder } = useStore();
  return (
    <section className={`co-page${active ? " active" : ""}`}>
      <div className="success">
        <div className="success-mark">✓</div>
        <h3>{t("store.checkout.success.title")}</h3>
        <p className="co-note">{t("store.checkout.success.note")}</p>
        <div className="order-id">{t("store.checkout.success.orderLabel", { number: orderNumber })}</div>
        <SummaryBox>
          <div className="summary-line"><span>{t("store.checkout.success.status")}</span><strong>{t("store.checkout.success.statusValue")}</strong></div>
          <div className="summary-line"><span>{t("store.checkout.success.eta")}</span><strong>{t("store.checkout.success.etaValue")}</strong></div>
        </SummaryBox>
        <Button style={{ marginTop: 24 }} onClick={finishOrder}>{t("store.checkout.success.backToShop")}</Button>
      </div>
    </section>
  );
}

export function CheckoutFlow() {
  const { panels, closePanel, checkoutStep: step } = useStore();
  return (
    <aside className={`checkout-flow${panels.checkout ? " open" : ""}`} id="checkoutFlow" aria-hidden={!panels.checkout}>
      <div className="overlay" onClick={() => closePanel("checkout")} />
      <div className="panel">
        <div className="co-head">
          <div className="co-title">
            <h2>{t("store.checkout.title")}</h2>
            <CloseButton label={t("common.close")} onClick={() => closePanel("checkout")} />
          </div>
          <StepIndicator labels={STEPS.map((s) => t(`store.checkout.steps.${s}`))} current={step} />
        </div>
        <div className="co-body">
          <AddressStep active={step === 1} />
          <ShippingStep active={step === 2} />
          <PaymentStep active={step === 3} />
          <SuccessStep active={step === 4} />
        </div>
      </div>
    </aside>
  );
}
