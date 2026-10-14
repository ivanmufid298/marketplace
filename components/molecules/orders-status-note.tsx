import { t } from "@/lib/i18n";
import { AdminButton } from "../atoms/admin-button";

/** "Memuat pesanan…" or the load error with a retry; nothing once the orders are there. */
type Texts = { loading: string; error: string; retry: string };

export function OrdersStatusNote({ status, onRetry, texts }: { status: "loading" | "ready" | "error"; onRetry: () => void; texts?: Texts }) {
  const words = texts ?? { loading: t("admin.orders.loading"), error: t("admin.orders.loadError"), retry: t("admin.orders.retry") };
  if (status === "ready") return null;
  return status === "loading" ? (
    <p className="sub" role="status" style={{ margin: "0 0 14px" }}>{words.loading}</p>
  ) : (
    <p className="sub" role="alert" style={{ margin: "0 0 14px" }}>
      {words.error} <AdminButton small onClick={onRetry}>{words.retry}</AdminButton>
    </p>
  );
}
