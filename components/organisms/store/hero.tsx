"use client";

import { t } from "@/lib/i18n";
import { Button } from "../../atoms/button";
import { useStore } from "../../providers/store-provider";

export function Hero() {
  const { scrollToProducts } = useStore();
  return (
    <section className="hero">
      <div className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow">{t("store.hero.eyebrow")}</span>
          <h1>{t("store.hero.titleLine1")}<br />{t("store.hero.titleLine2")}</h1>
          <p>{t("store.hero.text")}</p>
          <Button onClick={scrollToProducts}>{t("store.hero.cta")}</Button>
        </div>
        <div className="hero-art" role="img" aria-label={t("store.hero.imageAlt")} />
        <div className="hero-badge">{t("store.hero.badge")}</div>
      </div>
    </section>
  );
}
