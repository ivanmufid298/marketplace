"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAdmin } from "./admin-provider";
import { Icon, ICONS } from "./ui";

type NavItem = { href: string; title: string; label: string; icon: keyof typeof ICONS };

const NAV: { section?: string; items: NavItem[] }[] = [
  { items: [{ href: "/admin", title: "Dashboard", label: "Dashboard", icon: "dashboard" }] },
  {
    section: "Penjualan",
    items: [
      { href: "/admin/products", title: "Etalase Produk", label: "Etalase", icon: "products" },
      { href: "/admin/payments", title: "Pembayaran", label: "Pembayaran", icon: "payments" },
      { href: "/admin/interactions", title: "Interactions", label: "Interactions", icon: "interactions" },
      { href: "/admin/reviews", title: "Reviews", label: "Reviews", icon: "reviews" },
    ],
  },
  {
    section: "Marketing",
    items: [
      { href: "/admin/promos", title: "Promo & Scheduler", label: "Promo", icon: "promos" },
      { href: "/admin/vouchers", title: "Voucher", label: "Voucher", icon: "vouchers" },
      { href: "/admin/content", title: "Banner & Popup", label: "Banner & Popup", icon: "content" },
    ],
  },
  { section: "Pengaturan", items: [{ href: "/admin/shipping", title: "Pengaturan Ongkir", label: "Ongkir", icon: "shipping" }] },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen, interactions } = useAdmin();
  const current = NAV.flatMap((g) => g.items).find((i) => i.href === pathname);
  const unread = interactions.filter((i) => i.status === "open" && i.unread > 0).length;

  return (
    <div className="app">
      <aside className={`sidebar${sidebarOpen ? " open" : ""}`} id="sidebar">
        <div className="logo">
          <span className="logo-mark">M</span>
          <div>BRAND NAME<small>ADMIN PANEL</small></div>
        </div>
        <nav className="nav">
          {NAV.map((group, gi) => (
            <div key={gi} style={{ display: "contents" }}>
              {group.section && <div className="nav-section">{group.section}</div>}
              {group.items.map((item) => (
                <Link key={item.href} href={item.href} className={`nav-btn${pathname === item.href ? " active" : ""}`} onClick={() => setSidebarOpen(false)}>
                  <Icon name={item.icon} />
                  {item.label}
                  {item.icon === "interactions" && unread > 0 && (
                    <span style={{ marginLeft: "auto", background: "var(--pink)", color: "var(--wine)", padding: "2px 7px", borderRadius: 999, fontSize: 10 }}>{unread}</span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <Link className="store-link" href="/">
            <Icon name="external" width={18} />
            Lihat marketplace
          </Link>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="icon-btn menu-toggle" aria-label="Buka menu" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <Icon name="menu" />
            </button>
            <div className="page-title">
              <h1>{current?.title ?? "Admin"}</h1>
              <p>Ringkasan performa marketplace hari ini</p>
            </div>
          </div>
          <div className="top-actions">
            <button className="icon-btn" aria-label="Notifikasi">
              <span className="dot" />
              <Icon name="bell" />
            </button>
            <div className="profile">
              <span className="avatar">FA</span>
              <div><b>Admin</b><span>Super admin</span></div>
            </div>
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
