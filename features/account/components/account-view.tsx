"use client";

import { t } from "@/lib/i18n";
import { useAuth } from "@/features/auth";
import { Button } from "@/components/atoms/button";
import { AddressBook } from "./address-book";
import { ChangePasswordForm } from "./change-password-form";

/** The buyer's account page: who they are, their saved addresses, and changing the password. */
export function AccountView() {
  const { user, ready, openLogin } = useAuth();
  if (!ready) return <main className="shell account-page"><p className="co-note" role="status">{t("store.account.addresses.loading")}</p></main>;
  if (!user) {
    return (
      <main className="shell account-page">
        <h1>{t("store.account.title")}</h1>
        <p className="co-note">{t("store.account.signIn")}</p>
        <Button onClick={() => openLogin()}>{t("store.account.signInAction")}</Button>
      </main>
    );
  }
  return (
    <main className="shell account-page">
      <h1>{t("store.account.title")}</h1>
      <section className="account-section account-profile">
        <dl>
          <div><dt>{t("store.account.name")}</dt><dd>{user.name}</dd></div>
          <div><dt>{t("store.account.email")}</dt><dd>{user.email}</dd></div>
        </dl>
      </section>
      <AddressBook />
      <ChangePasswordForm />
    </main>
  );
}
