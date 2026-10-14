"use client";

import { useEffect } from "react";
import { LoginDialog, useAuth } from "@/features/auth";
import { useCart } from "@/features/cart";
import { t } from "@/lib/i18n";
import { useUi } from "@/shared/ui-state/ui-provider";

/**
 * Connects the auth module's login dialog to the storefront: the welcome toast, and where the buyer lands after signing in.
 * A user appearing while the dialog is open means sign-in worked, so it closes. The cart, the checkout, and the chat each carry
 * on their own part when the sign-in was for them; this opens "Pesanan saya" when it was for the orders.
 */
export function StoreLoginDialog() {
  const { showToast, setPanel } = useUi();
  const { user, loginOpen, intent, closeLogin } = useAuth();
  const { loaded: cartLoaded } = useCart();

  useEffect(() => {
    if (!user || !loginOpen) return;
    // The cart closes the dialog itself once this account's saved cart has loaded.
    if (intent === "cart" && !cartLoaded) return;
    closeLogin();
    if (intent === "orders") setPanel("orders", true);
  }, [user, loginOpen, intent, cartLoaded, closeLogin, setPanel]);

  return <LoginDialog onSignedIn={(name) => showToast(t("store.auth.welcome", { name }))} />;
}
