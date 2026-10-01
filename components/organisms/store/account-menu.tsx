"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { Icon } from "../../atoms/icon";
import { IconButton } from "../../atoms/icon-button";
import { useAuth } from "../../providers/auth-provider";
import { useStore } from "../../providers/store-provider";

/** Header account button: opens the login dialog for guests, a small menu for signed-in buyers. */
export function AccountMenu() {
  const { user, openLogin, signOut } = useAuth();
  const { openPanel, showToast } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) {
    return (
      <IconButton label={t("store.header.account")} className="account-btn" onClick={() => openLogin()}>
        <Icon name="user" />
      </IconButton>
    );
  }

  return (
    <div className="account" ref={ref}>
      <IconButton label={t("store.header.account")} className="account-btn signed-in" onClick={() => setOpen((o) => !o)}>
        <Icon name="user" />
      </IconButton>
      {open && (
        <div className="account-menu" role="menu">
          <div className="account-menu-head">
            <small>{t("store.auth.account.signedInAs")}</small>
            <b>{user.name}</b>
            <small>{user.email}</small>
          </div>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); openPanel("orders"); }}>{t("store.auth.account.orders")}</button>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await signOut();
              showToast(t("store.auth.signedOut"));
            }}
          >
            {t("store.auth.account.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
