"use client";

import { t } from "@/lib/i18n";
import { SHIPPING_SERVICES } from "@/lib/mock/admin";
import { AdminButton } from "../../atoms/admin-button";
import { SectionTop } from "../../molecules/section-top";
import { ShippingRow } from "../../molecules/shipping-row";
import { useAdmin } from "../../providers/admin-provider";

export function ShippingSettings() {
  const { openModal, showToast } = useAdmin();
  return (
    <section className="view active">
      <SectionTop title={t("admin.shipping.title")} text={t("admin.shipping.text")}>
        <AdminButton variant="primary" onClick={() => openModal("shipping")}>{t("admin.shipping.add")}</AdminButton>
      </SectionTop>
      <div className="shipping-list">
        {SHIPPING_SERVICES.map((s) => <ShippingRow key={s.name} service={s} onToggled={() => showToast(t("common.settingsUpdated"))} />)}
      </div>
    </section>
  );
}
