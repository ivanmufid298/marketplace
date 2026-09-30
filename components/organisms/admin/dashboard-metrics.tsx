import { t } from "@/lib/i18n";
import { DASHBOARD_METRICS } from "@/lib/mock/admin";
import { Icon } from "../../atoms/icon";
import { MetricCard } from "../../molecules/metric-card";

export function DashboardMetrics() {
  return (
    <div className="cards">
      {DASHBOARD_METRICS.map((m) => (
        <MetricCard
          key={m.key}
          label={t(`admin.dashboard.metrics.${m.key}`)}
          value={m.value}
          note={m.trend}
          warn={m.down}
          icon={m.icon === "rp" ? "Rp" : <Icon name={m.icon} />}
        />
      ))}
    </div>
  );
}
