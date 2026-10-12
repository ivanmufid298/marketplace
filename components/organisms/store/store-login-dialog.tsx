"use client";

import { LoginDialog } from "@/features/auth";
import { t } from "@/lib/i18n";
import { useUi } from "@/shared/ui-state/ui-provider";

/** Connects the auth module's login dialog to the storefront toast, so auth does not depend on the store. */
export function StoreLoginDialog() {
  const { showToast } = useUi();
  return <LoginDialog onSignedIn={(name) => showToast(t("store.auth.welcome", { name }))} />;
}
