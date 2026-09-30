"use client";

import { t } from "@/lib/i18n";
import { Icon } from "../../atoms/icon";
import { MobileTab } from "../../molecules/mobile-tab";
import { useStore } from "../../providers/store-provider";

export function MobileNav() {
  const { panels, savedOnly, mobileNav, cartCount } = useStore();
  const overlayOpen = panels.drawer || panels.orders || panels.categorySheet;

  return (
    <nav className="mobile-nav" aria-label={t("store.mobileNav.label")}>
      <MobileTab label={t("store.mobileNav.home")} icon={<Icon name="home" />} active={!overlayOpen && !savedOnly} onClick={() => mobileNav("home")} />
      <MobileTab label={t("store.mobileNav.category")} icon={<Icon name="grid" />} active={panels.categorySheet} onClick={() => mobileNav("category")} />
      <MobileTab label={t("store.mobileNav.wishlist")} icon={<Icon name="heart" />} active={!overlayOpen && savedOnly} onClick={() => mobileNav("saved")} />
      <MobileTab label={t("store.mobileNav.orders")} icon={<Icon name="package" />} active={panels.orders} onClick={() => mobileNav("orders")} />
      <MobileTab label={t("store.mobileNav.cart")} icon={<Icon name="cart" />} active={panels.drawer} badge={cartCount} onClick={() => mobileNav("cart")} />
    </nav>
  );
}
