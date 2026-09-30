import type { IconName } from "@/components/atoms/icon";
import type { MessageKey } from "@/lib/i18n";

export type AdminNavItem = {
  href: string;
  /** Sidebar label. */
  label: MessageKey;
  /** Page title shown in the top bar. */
  title: MessageKey;
  icon: IconName;
};

export type AdminNavGroup = {
  section?: MessageKey;
  items: AdminNavItem[];
};

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    items: [{ href: "/admin", label: "admin.nav.dashboard", title: "admin.titles.dashboard", icon: "grid" }],
  },
  {
    section: "admin.nav.sectionSales",
    items: [
      { href: "/admin/products", label: "admin.nav.products", title: "admin.titles.products", icon: "products" },
      { href: "/admin/orders", label: "admin.nav.orders", title: "admin.titles.orders", icon: "package" },
      { href: "/admin/payments", label: "admin.nav.payments", title: "admin.titles.payments", icon: "payments" },
      { href: "/admin/interactions", label: "admin.nav.interactions", title: "admin.titles.interactions", icon: "chat" },
      { href: "/admin/reviews", label: "admin.nav.reviews", title: "admin.titles.reviews", icon: "reviews" },
    ],
  },
  {
    section: "admin.nav.sectionMarketing",
    items: [
      { href: "/admin/promos", label: "admin.nav.promos", title: "admin.titles.promos", icon: "promos" },
      { href: "/admin/vouchers", label: "admin.nav.vouchers", title: "admin.titles.vouchers", icon: "vouchers" },
      { href: "/admin/content", label: "admin.nav.content", title: "admin.titles.content", icon: "content" },
    ],
  },
  {
    section: "admin.nav.sectionSettings",
    items: [{ href: "/admin/shipping", label: "admin.nav.shipping", title: "admin.titles.shipping", icon: "shipping" }],
  },
];
