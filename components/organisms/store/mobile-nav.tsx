"use client";

import { useCart } from "@/features/cart";
import { t } from "@/lib/i18n";
import { Icon } from "../../atoms/icon";
import { MobileTab } from "../../molecules/mobile-tab";
import { useCatalog } from "@/features/catalog";
import { useUi } from "@/shared/ui-state/ui-provider";

type MobileNavMode = "home" | "category" | "saved" | "orders" | "cart";

export function MobileNav() {
  const { panels, setPanel } = useUi();
  const { savedOnly, showSaved, showAll } = useCatalog();
  const { cartCount } = useCart();
  const mobileNav = (mode: MobileNavMode) => {
    if (mode === "category") return setPanel("categorySheet", true);
    if (mode === "cart") return setPanel("drawer", true);
    if (mode === "orders") return setPanel("orders", true);
    if (mode === "saved") return showSaved();
    showAll();
  };
  const overlayOpen = panels.drawer || panels.orders || panels.categorySheet || panels.notifications;

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
