"use client";

import { useEffect, type ReactNode } from "react";
import { t, type MessageKey } from "@/lib/i18n";
import { PRODUCT_CATEGORIES } from "@/lib/mock/admin";
import { AdminButton } from "../../atoms/admin-button";
import { CloseButton } from "../../atoms/close-button";
import { Field } from "../../molecules/field";
import { SchedulerBox } from "../../molecules/scheduler-box";
import { Select, type SelectOption } from "../../molecules/select";
import { useAdmin, type ModalType } from "../../providers/admin-provider";

type OptionKey = Extract<MessageKey, `admin.modal.options.${string}`>;

const options = (...keys: OptionKey[]): SelectOption[] => keys.map((key) => ({ value: key, label: t(key) }));
const categoryOptions = (): SelectOption[] => PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }));

const FORMS: Record<ModalType, () => ReactNode> = {
  product: () => (
    <>
      <Field full label={t("admin.modal.product.name")}><input required placeholder={t("admin.modal.product.namePlaceholder")} /></Field>
      <Field label={t("admin.modal.product.category")}><Select options={categoryOptions()} /></Field>
      <Field label={t("admin.modal.product.price")}><input required inputMode="numeric" placeholder={t("admin.modal.product.pricePlaceholder")} /></Field>
      <Field label={t("admin.modal.product.stock")}><input required inputMode="numeric" placeholder={t("admin.modal.product.stockPlaceholder")} /></Field>
      <Field label={t("admin.modal.product.status")}><Select options={options("admin.modal.options.statusActive", "admin.modal.options.statusDraft")} /></Field>
      <Field full label={t("admin.modal.product.description")}><textarea placeholder={t("admin.modal.product.descriptionPlaceholder")} /></Field>
    </>
  ),
  promo: () => (
    <>
      <Field full label={t("admin.modal.promo.name")}><input required placeholder={t("admin.modal.promo.namePlaceholder")} /></Field>
      <Field label={t("admin.modal.promo.type")}>
        <Select options={options("admin.modal.options.percentage", "admin.modal.options.nominal", "admin.modal.options.freeShipping")} />
      </Field>
      <Field label={t("admin.modal.promo.value")}><input required placeholder={t("admin.modal.promo.valuePlaceholder")} /></Field>
      <Field full label={t("admin.modal.promo.appliesTo")}>
        <Select options={options("admin.modal.options.allProducts", "admin.modal.options.someCategories", "admin.modal.options.someProducts")} />
      </Field>
      <SchedulerBox />
    </>
  ),
  voucher: () => (
    <>
      <Field full label={t("admin.modal.voucher.code")}><input required placeholder={t("admin.modal.voucher.codePlaceholder")} style={{ textTransform: "uppercase" }} /></Field>
      <Field label={t("admin.modal.voucher.kind")}><Select options={options("admin.modal.options.percentage", "admin.modal.options.nominal")} /></Field>
      <Field label={t("admin.modal.voucher.value")}><input required placeholder={t("admin.modal.voucher.valuePlaceholder")} /></Field>
      <Field label={t("admin.modal.voucher.minSpend")}><input placeholder={t("admin.modal.voucher.minSpendPlaceholder")} /></Field>
      <Field label={t("admin.modal.voucher.quota")}><input placeholder={t("admin.modal.voucher.quotaPlaceholder")} /></Field>
      <SchedulerBox />
    </>
  ),
  banner: () => (
    <>
      <Field full label={t("admin.modal.banner.title")}><input required placeholder={t("admin.modal.banner.titlePlaceholder")} /></Field>
      <Field full label={t("admin.modal.banner.subtitle")}><textarea placeholder={t("admin.modal.banner.subtitlePlaceholder")} /></Field>
      <Field full label={t("admin.modal.banner.image")}><input type="file" accept="image/*" /></Field>
      <Field label={t("admin.modal.banner.ctaText")}><input placeholder={t("admin.modal.banner.ctaTextPlaceholder")} /></Field>
      <Field label={t("admin.modal.banner.ctaTarget")}><input placeholder={t("admin.modal.banner.ctaTargetPlaceholder")} /></Field>
      <SchedulerBox />
    </>
  ),
  popup: () => (
    <>
      <Field full label={t("admin.modal.popup.name")}><input required placeholder={t("admin.modal.popup.namePlaceholder")} /></Field>
      <Field full label={t("admin.modal.popup.poster")}><input type="file" accept="image/*" /></Field>
      <Field label={t("admin.modal.popup.trigger")}>
        <Select options={options("admin.modal.options.triggerOpen", "admin.modal.options.triggerDelay", "admin.modal.options.triggerExit")} />
      </Field>
      <Field label={t("admin.modal.popup.frequency")}>
        <Select options={options("admin.modal.options.oncePerSession", "admin.modal.options.oncePerDay", "admin.modal.options.always")} />
      </Field>
      <Field full label={t("admin.modal.popup.target")}>
        <Select options={options("admin.modal.options.allPages", "admin.modal.options.homeOnly", "admin.modal.options.productPages")} />
      </Field>
      <SchedulerBox />
    </>
  ),
  shipping: () => (
    <>
      <Field full label={t("admin.modal.shipping.name")}><input required placeholder={t("admin.modal.shipping.namePlaceholder")} /></Field>
      <Field label={t("admin.modal.shipping.baseRate")}><input required placeholder={t("admin.modal.shipping.baseRatePlaceholder")} /></Field>
      <Field label={t("admin.modal.shipping.eta")}><input required placeholder={t("admin.modal.shipping.etaPlaceholder")} /></Field>
      <Field full label={t("admin.modal.shipping.freeMin")}><input placeholder={t("admin.modal.shipping.freeMinPlaceholder")} /></Field>
    </>
  ),
};

export function AdminModal() {
  const { modal, closeModal, showToast } = useAdmin();

  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeModal();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modal, closeModal]);

  return (
    <div className={`modal-backdrop${modal ? " open" : ""}`} onClick={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="modal">
        <div className="modal-head">
          <h2>{modal ? t(`admin.modal.titles.${modal}`) : t("admin.modal.fallbackTitle")}</h2>
          <CloseButton label={t("common.close")} onClick={closeModal} />
        </div>
        {/* Keyed by type so every open starts from a blank form. */}
        <form
          key={modal ?? "none"}
          onSubmit={(e) => {
            e.preventDefault();
            closeModal();
            showToast(t("admin.modal.saved"));
          }}
        >
          <div className="modal-body"><div className="fields">{modal ? FORMS[modal]() : null}</div></div>
          <div className="modal-foot">
            <AdminButton onClick={closeModal}>{t("common.cancel")}</AdminButton>
            <AdminButton variant="primary" type="submit">{t("common.save")}</AdminButton>
          </div>
        </form>
      </div>
    </div>
  );
}
