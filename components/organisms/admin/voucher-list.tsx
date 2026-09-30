"use client";

import { t } from "@/lib/i18n";
import { VOUCHERS } from "@/lib/mock/admin";
import { AdminButton } from "../../atoms/admin-button";
import { SectionTop } from "../../molecules/section-top";
import { VoucherCard } from "../../molecules/voucher-card";
import { useAdmin } from "../../providers/admin-provider";

export function VoucherList() {
  const { openModal } = useAdmin();
  return (
    <section className="view active">
      <SectionTop title={t("admin.vouchers.title")} text={t("admin.vouchers.text")}>
        <AdminButton variant="primary" onClick={() => openModal("voucher")}>{t("admin.vouchers.add")}</AdminButton>
      </SectionTop>
      <div>{VOUCHERS.map((v) => <VoucherCard key={v.code} voucher={v} />)}</div>
    </section>
  );
}
