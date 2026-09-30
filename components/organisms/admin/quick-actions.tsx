"use client";

import { t } from "@/lib/i18n";
import { useAdmin, type ModalType } from "../../providers/admin-provider";

const ACTIONS = [
  { type: "product", glyph: "＋" },
  { type: "promo", glyph: "％" },
  { type: "voucher", glyph: "V" },
  { type: "banner", glyph: "▣" },
] as const satisfies readonly { type: ModalType; glyph: string }[];

export function QuickActions() {
  const { openModal } = useAdmin();
  return (
    <article className="card">
      <div className="card-head"><h3>{t("admin.dashboard.quick.title")}</h3></div>
      <div className="quick-grid">
        {ACTIONS.map(({ type, glyph }) => (
          <button key={type} type="button" className="quick" onClick={() => openModal(type)}>
            <span>{glyph}</span>
            <b>{t(`admin.dashboard.quick.${type}`)}</b>
            <small>{t(`admin.dashboard.quick.${type}Sub`)}</small>
          </button>
        ))}
      </div>
    </article>
  );
}
