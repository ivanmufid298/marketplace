"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import type { PROMOS } from "@/lib/mock/admin";
import { Switch } from "../atoms/switch";

type PromoCardProps = {
  promo: (typeof PROMOS)[number];
  onToggled: () => void;
};

export function PromoCard({ promo, onToggled }: PromoCardProps) {
  const [label, setLabel] = useState(promo.label);
  return (
    <article className="promo-card">
      <h3>{promo.title}</h3>
      <p>{promo.text}</p>
      <div className="schedule">
        <Switch
          label={t("admin.promos.toggle")}
          defaultOn={promo.on}
          onChange={(on) => {
            setLabel(on ? t("admin.promos.on") : t("admin.promos.off"));
            onToggled();
          }}
        />
        <b>{label}</b>
      </div>
      <span className="sub">{promo.sub}</span>
    </article>
  );
}
