import { t } from "@/lib/i18n";

/** Shown while the admin is open without login (demo mode), so nobody mistakes it for a protected panel. */
export function DemoBanner() {
  return (
    <div className="demo-banner" role="status">
      {t("admin.demoBanner")}
    </div>
  );
}
