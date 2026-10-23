import type { ReactNode } from "react";
import { AuthProvider } from "@/features/auth";
import { BrandProvider } from "@/features/brand";
import { authMode } from "@/features/auth/server";
import { NotificationsProvider } from "@/features/notifications";
import { AdminModal } from "../organisms/admin/admin-modal";
import { AdminToast } from "../organisms/admin/admin-toast";
import { DemoBanner } from "../organisms/admin/demo-banner";
import { Sidebar } from "../organisms/admin/sidebar";
import { Topbar } from "../organisms/admin/topbar";
import { AdminProvider } from "../providers/admin-provider";

/** Page frame shared by every admin panel route: sidebar, top bar, and the create/edit modal. */
export function AdminTemplate({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
    <BrandProvider>
    <NotificationsProvider>
    <AdminProvider>
      <div className="app">
        <Sidebar />
        <main className="main">
          {authMode() === "demo" && <DemoBanner />}
          <Topbar />
          <div className="content">{children}</div>
        </main>
      </div>
      <AdminModal />
      <AdminToast />
    </AdminProvider>
    </NotificationsProvider>
    </BrandProvider>
    </AuthProvider>
  );
}
