import { t } from "@/lib/i18n";
import type { SHIPPING_SERVICES } from "@/lib/mock/admin";
import { Switch } from "../atoms/switch";

type ShippingRowProps = {
  service: (typeof SHIPPING_SERVICES)[number];
  onToggled: () => void;
};

export function ShippingRow({ service: s, onToggled }: ShippingRowProps) {
  return (
    <article className="shipping-row">
      <div>
        <b>{s.name}</b>
        <span className="sub" style={{ display: "block" }}>{s.note}</span>
      </div>
      <label className="field"><span className="sub">{t("admin.shipping.baseRate")}</span><input defaultValue={s.base} /></label>
      <label className="field"><span className="sub">{t("admin.shipping.freeMin")}</span><input defaultValue={s.free} /></label>
      <Switch label={t("admin.shipping.toggle", { name: s.name.toLowerCase() })} defaultOn onChange={onToggled} />
    </article>
  );
}
