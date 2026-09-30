"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAV } from "@/lib/admin-nav";
import { t } from "@/lib/i18n";
import { Icon } from "../../atoms/icon";
import { SidebarLink } from "../../molecules/sidebar-link";
import { useAdmin } from "../../providers/admin-provider";

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen, interactions } = useAdmin();
  const unread = interactions.filter((i) => i.status === "open" && i.unread > 0).length;

  return (
    <aside className={`sidebar${sidebarOpen ? " open" : ""}`} id="sidebar">
      <div className="logo">
        <span className="logo-mark">M</span>
        <div>{t("common.brand")}<small>{t("admin.shell.panel")}</small></div>
      </div>
      <nav className="nav">
        {ADMIN_NAV.map((group, i) => (
          <div key={i} style={{ display: "contents" }}>
            {group.section && <div className="nav-section">{t(group.section)}</div>}
            {group.items.map((item) => (
              <SidebarLink
                key={item.href}
                href={item.href}
                label={t(item.label)}
                icon={item.icon}
                active={pathname === item.href}
                badge={item.href === "/admin/interactions" ? unread : undefined}
                onNavigate={() => setSidebarOpen(false)}
              />
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-foot">
        <Link className="store-link" href="/">
          <Icon name="external" width={18} />
          {t("admin.shell.viewStore")}
        </Link>
      </div>
    </aside>
  );
}
