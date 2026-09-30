import type { ReactNode } from "react";
import { AdminModal } from "../organisms/admin/admin-modal";
import { AdminToast } from "../organisms/admin/admin-toast";
import { Sidebar } from "../organisms/admin/sidebar";
import { Topbar } from "../organisms/admin/topbar";
import { AdminProvider } from "../providers/admin-provider";

/** Page frame shared by every admin route: sidebar, top bar, and the create/edit modal. */
export function AdminTemplate({ children }: { children: ReactNode }) {
  return (
    <div className="admin">
      <AdminProvider>
        <div className="app">
          <Sidebar />
          <main className="main">
            <Topbar />
            <div className="content">{children}</div>
          </main>
        </div>
        <AdminModal />
        <AdminToast />
      </AdminProvider>
    </div>
  );
}
