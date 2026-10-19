"use client";

import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import { BANK_ACCOUNT, formatAccountNumber } from "@/lib/mock/store";
import { Button } from "../../atoms/button";
import { CloseButton } from "../../atoms/close-button";
import { BankCard } from "../../molecules/bank-card";
import { ShippingOption } from "../../molecules/shipping-option";
import { StepIndicator } from "../../molecules/step-indicator";
import { SummaryBox, SummaryLine } from "../../molecules/summary-box";
import { UploadField } from "../../molecules/upload-field";
import Link from "next/link";
import { useState } from "react";
import { addressLine, MAX_ADDRESSES, AddressForm, useAddresses, type AddressInput } from "@/features/account";
import { useAuth } from "@/features/auth";
import { useCart } from "@/features/cart";
import { useCheckout } from "@/features/checkout";
import { useUi } from "@/shared/ui-state/ui-provider";

const STEPS = ["address", "shipping", "payment"] as const;

function OrderSummary() {
  const { subtotal } = useCart();
  const { shippingCost } = useCheckout();
  return (
    <SummaryBox>
      <SummaryLine label={t("store.checkout.summary.subtotal")} value={money(subtotal)} />
      <SummaryLine label={t("store.checkout.summary.shipping")} value={money(shippingCost)} />
      <SummaryLine total label={t("store.checkout.summary.total")} value={money(subtotal + shippingCost)} />
    </SummaryBox>
  );
}

function AddressStep({ active }: { active: boolean }) {
  const { user } = useAuth();
  const { addresses, status, add, reload } = useAddresses();
  const { selectedAddressId, selectAddress, goCheckoutStep } = useCheckout();
  const { closePanel } = useUi();
  const [adding, setAdding] = useState(false);
  const empty = addresses.length === 0;
  const saveNew = async (input: AddressInput) => {
    const result = await add(input);
    if (result.ok) selectAddress(result.value);
    return result;
  };

  return (
    <section className={`co-page${active ? " active" : ""}`}>
      <h3>{t(empty ? "store.checkout.address.noneTitle" : "store.checkout.address.pickTitle")}</h3>
      <p className="co-note">{t(empty ? "store.checkout.address.noneNote" : "store.checkout.address.pickNote")}</p>

      {status === "loading" && empty ? (
        <p className="co-note" role="status">{t("store.checkout.address.loading")}</p>
      ) : status === "error" && empty ? (
        <p className="login-error" role="alert">{t("store.checkout.address.loadError")} <button type="button" className="link-btn" onClick={reload}>{t("store.checkout.address.retry")}</button></p>
      ) : empty ? (
        <AddressForm defaultName={user?.name ?? ""} idPrefix="co-new-address" submitLabel={t("store.account.form.save")} onSave={saveNew} onSaved={() => undefined} />
      ) : (
        <>
          <div className="address-choices" role="radiogroup" aria-label={t("store.checkout.address.pickTitle")}>
            {addresses.map((a) => (
              <label key={a.id} className={`address-choice${a.id === selectedAddressId ? " selected" : ""}`}>
                <input type="radio" name="checkoutAddress" checked={a.id === selectedAddressId} onChange={() => selectAddress(a)} />
                <span className="address-choice-body">
                  <span className="address-card-head"><b>{a.label}</b>{a.isDefault && <span className="address-badge">{t("store.account.addresses.default")}</span>}</span>
                  <span>{a.recipientName} · {a.phone}</span>
                  <span className="address-line">{addressLine(a)}</span>
                  {a.note && <span className="sub">{a.note}</span>}
                </span>
              </label>
            ))}
          </div>
          {adding ? (
            <div className="address-new">
              <AddressForm defaultName={user?.name ?? ""} idPrefix="co-new-address" offerDefault submitLabel={t("store.account.form.save")} onSave={saveNew} onSaved={() => setAdding(false)} onCancel={() => setAdding(false)} />
            </div>
          ) : (
            <div className="address-tools">
              {addresses.length < MAX_ADDRESSES && <button type="button" className="link-btn" onClick={() => setAdding(true)}>{t("store.checkout.address.addNew")}</button>}
              <Link className="link-btn" href="/akun" onClick={() => closePanel("checkout")}>{t("store.checkout.address.manage")}</Link>
            </div>
          )}
        </>
      )}

      <div className="co-actions">
        <span />
        <Button disabled={!selectedAddressId} onClick={() => goCheckoutStep(2)}>{t("store.checkout.address.next")}</Button>
      </div>
    </section>
  );
}

function ShippingStep({ active }: { active: boolean }) {
  const { shipping, setShipping, shippingMethods, shippingSource, shippingFallback, retryShipping, goCheckoutStep } = useCheckout();
  const chosen = shippingMethods.find((m) => m.value === shipping) ?? shippingMethods[0];
  return (
    <section className={`co-page${active ? " active" : ""}`}>
      <h3>{t("store.checkout.shipping.title")}</h3>
      <p className="co-note">{t(shippingSource === "quote" ? "store.checkout.shipping.quoteNote" : "store.checkout.shipping.note")}</p>
      {shippingSource === "loading" && <p className="co-note" role="status">{t("store.checkout.shipping.loading")}</p>}
      {shippingFallback && (
        <p className="co-note" role="status">
          {t(shippingFallback === "noPlace" ? "store.checkout.shipping.noPlace" : "store.checkout.shipping.failed")}
          {shippingFallback === "failed" && <> <button type="button" className="link-btn" onClick={retryShipping}>{t("store.checkout.shipping.retry")}</button></>}
        </p>
      )}
      <div className="option-list">
        {shippingMethods.map((o) => (
          <ShippingOption key={o.value} value={o.value} label={o.label} note={o.note} price={money(o.cost)} checked={chosen?.value === o.value} onSelect={() => setShipping(o.value)} />
        ))}
      </div>
      <OrderSummary />
      <div className="co-actions">
        <Button variant="secondary" onClick={() => goCheckoutStep(1)}>{t("common.back")}</Button>
        <Button disabled={!chosen} onClick={() => goCheckoutStep(3)}>{t("store.checkout.shipping.next")}</Button>
      </div>
    </section>
  );
}

function PaymentStep({ active }: { active: boolean }) {
  const { goCheckoutStep, placeOrder, placing, proofName, setProof } = useCheckout();
  const { showToast } = useUi();
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
        accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
        onFile={(file, input) => {
          if (!setProof(file)) input.value = "";
        }}
      />
      <div className="co-actions">
        <Button variant="secondary" onClick={() => goCheckoutStep(2)}>{t("common.back")}</Button>
        <Button disabled={placing} onClick={placeOrder}>{placing ? t("store.checkout.payment.placing") : t("store.checkout.payment.placeOrder")}</Button>
      </div>
    </section>
  );
}

function SuccessStep({ active }: { active: boolean }) {
  const { orderNumber, finishOrder } = useCheckout();
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
  const { panels, closePanel } = useUi();
  const { checkoutStep: step, goCheckoutStep } = useCheckout();
  return (
    <aside className={`checkout-flow${panels.checkout ? " open" : ""}`} id="checkoutFlow" aria-hidden={!panels.checkout}>
      <div className="overlay" onClick={() => closePanel("checkout")} />
      <div className="panel">
        <div className="co-head">
          <div className="co-title">
            <h2>{t("store.checkout.title")}</h2>
            <CloseButton label={t("common.close")} onClick={() => closePanel("checkout")} />
          </div>
          <StepIndicator labels={STEPS.map((s) => t(`store.checkout.steps.${s}`))} current={step} onSelect={goCheckoutStep} />
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
