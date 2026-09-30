"use client";

import { usePathname } from "next/navigation";
import { ADMIN_NAV } from "@/lib/admin-nav";
import { t } from "@/lib/i18n";
import { Icon } from "../../atoms/icon";
import { IconButton } from "../../atoms/icon-button";
import { useAdmin } from "../../providers/admin-provider";

export function Topbar() {
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen } = useAdmin();
  const current = ADMIN_NAV.flatMap((g) => g.items).find((i) => i.href === pathname);

  return (
    <header className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <IconButton label={t("admin.shell.openMenu")} className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
          <Icon name="menu" />
        </IconButton>
        <div className="page-title">
          <h1>{current ? t(current.title) : t("admin.shell.fallbackTitle")}</h1>
          <p>{t("admin.shell.subtitle")}</p>
        </div>
      </div>
      <div className="top-actions">
        <IconButton label={t("admin.shell.notifications")}>
          <span className="dot" />
          <Icon name="bell" />
        </IconButton>
        <div className="profile">
          <span className="avatar">FA</span>
          <div><b>{t("admin.shell.profileName")}</b><span>{t("admin.shell.profileRole")}</span></div>
        </div>
      </div>
    </header>
  );
}
