"use client";

import { t } from "@/lib/i18n";
import { PROMOS } from "@/lib/mock/admin";
import { AdminButton } from "../../atoms/admin-button";
import { PromoCard } from "../../molecules/promo-card";
import { SectionTop } from "../../molecules/section-top";
import { useAdmin } from "../../providers/admin-provider";

export function PromoList() {
  const { openModal, showToast } = useAdmin();
  return (
    <section className="view active">
      <SectionTop title={t("admin.promos.title")} text={t("admin.promos.text")}>
        <AdminButton variant="primary" onClick={() => openModal("promo")}>{t("admin.promos.add")}</AdminButton>
      </SectionTop>
      <div className="promo-grid">
        {PROMOS.map((p) => <PromoCard key={p.title} promo={p} onToggled={() => showToast(t("common.settingsUpdated"))} />)}
      </div>
    </section>
  );
}
