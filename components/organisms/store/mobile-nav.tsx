"use client";

import { t } from "@/lib/i18n";
import { Icon } from "../../atoms/icon";
import { MobileTab } from "../../molecules/mobile-tab";
import { useStore } from "../../providers/store-provider";

export function MobileNav() {
  const { mobileTab, mobileNav, cartCount } = useStore();
  return (
    <nav className="mobile-nav" aria-label={t("store.mobileNav.label")}>
      <MobileTab label={t("store.mobileNav.home")} icon={<Icon name="home" />} active={mobileTab === "home"} onClick={() => mobileNav("home")} />
      <MobileTab label={t("store.mobileNav.category")} icon={<Icon name="grid" />} active={mobileTab === "category"} onClick={() => mobileNav("category")} />
      <MobileTab label={t("store.mobileNav.wishlist")} icon={<Icon name="heart" />} active={mobileTab === "saved"} onClick={() => mobileNav("saved")} />
      <MobileTab label={t("store.mobileNav.cart")} icon={<Icon name="cart" />} active={mobileTab === "cart"} badge={cartCount} onClick={() => mobileNav("cart")} />
    </nav>
  );
}
