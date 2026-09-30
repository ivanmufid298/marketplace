import { t } from "@/lib/i18n";
import { VISIT_SERIES } from "@/lib/mock/admin";
import { StatsChartCard } from "./stats-chart-card";

export function VisitChart() {
  return (
    <StatsChartCard
      title={t("admin.dashboard.visitChart.title")}
      subtitles={{ monthly: t("admin.dashboard.visitChart.subMonthly"), yearly: t("admin.dashboard.visitChart.subYearly") }}
      series={VISIT_SERIES}
      gradientId="visit-area"
    />
  );
}
