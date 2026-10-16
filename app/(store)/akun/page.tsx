import type { Metadata } from "next";
import { AccountView } from "@/features/account";
import { t } from "@/lib/i18n";

// The buyer's own page: nothing here is for search engines.
export const metadata: Metadata = { title: t("store.account.metaTitle"), robots: { index: false } };

export default function AccountPage() {
  return <AccountView />;
}
