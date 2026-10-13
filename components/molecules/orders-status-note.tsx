import { t } from "@/lib/i18n";
import { AdminButton } from "../atoms/admin-button";

/** "Memuat pesanan…" or the load error with a retry; nothing once the orders are there. */
export function OrdersStatusNote({ status, onRetry }: { status: "loading" | "ready" | "error"; onRetry: () => void }) {
  if (status === "ready") return null;
  return status === "loading" ? (
    <p className="sub" role="status" style={{ margin: "0 0 14px" }}>{t("admin.orders.loading")}</p>
  ) : (
    <p className="sub" role="alert" style={{ margin: "0 0 14px" }}>
      {t("admin.orders.loadError")} <AdminButton small onClick={onRetry}>{t("admin.orders.retry")}</AdminButton>
    </p>
  );
}
