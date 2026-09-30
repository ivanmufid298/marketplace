import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminProvider } from "@/components/admin/admin-provider";
import { AdminModal, AdminToast } from "@/components/admin/modal";
import { AdminShell } from "@/components/admin/shell";
import "./admin.css";

export const metadata: Metadata = {
  title: "Admin Marketplace",
  description: "Dashboard admin untuk mengelola etalase, promo, pembayaran, pengiriman, banner, dan campaign.",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin">
      <AdminProvider>
        <AdminShell>{children}</AdminShell>
        <AdminModal />
        <AdminToast />
      </AdminProvider>
    </div>
  );
}
