import { t } from "@/lib/i18n";
import type { VOUCHERS } from "@/lib/mock/admin";
import { StatusBadge } from "../atoms/badges";

export function VoucherCard({ voucher: v }: { voucher: (typeof VOUCHERS)[number] }) {
  return (
    <article className="voucher">
      <div className="voucher-main">
        <span className="voucher-code">{v.code}</span>
        <p className="sub">{v.note}</p>
        <StatusBadge tone="success">{t("admin.vouchers.active")}</StatusBadge>
      </div>
      <div className="voucher-side">
        <strong>{v.value}</strong>
        <span className="sub">{v.usage}</span>
      </div>
    </article>
  );
}
