import { formatNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { VISIT_STATS } from "@/lib/mock/admin";
import { Icon } from "../../atoms/icon";
import { DeviceBar } from "../../molecules/device-bar";

/** Summary card next to the visitor chart: total visits and the device split. */
export function VisitStats() {
  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h3>{t("admin.dashboard.visits.title")}</h3>
          <span className="sub">{t("admin.dashboard.visits.period")}</span>
        </div>
      </div>
      <div className="visit-body">
        <div className="visit-numbers">
          <div>
            <span className="visit-label"><Icon name="eye" />{t("admin.dashboard.visits.total")}</span>
            <strong>{formatNumber(VISIT_STATS.visits)}</strong>
            <span className="trend">{VISIT_STATS.trend}</span>
          </div>
        </div>
        <div className="visit-devices">
          <b>{t("admin.dashboard.visits.devicesTitle")}</b>
          {VISIT_STATS.devices.map((d) => (
            <DeviceBar key={d.type} icon={d.type} label={t(`admin.dashboard.visits.device.${d.type}`)} pct={d.pct} />
          ))}
        </div>
      </div>
      <p className="sub visit-note">{t("admin.dashboard.visits.note")}</p>
    </article>
  );
}
