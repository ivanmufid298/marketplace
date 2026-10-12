"use client";

import { LoginDialog } from "@/features/auth";
import { t } from "@/lib/i18n";
import { useStore } from "../../providers/store-provider";

/** Connects the auth module's login dialog to the storefront toast, so auth does not depend on the store. */
export function StoreLoginDialog() {
  const { showToast } = useStore();
  return <LoginDialog onSignedIn={(name) => showToast(t("store.auth.welcome", { name }))} />;
}
