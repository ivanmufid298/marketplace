import { t } from "@/lib/i18n";
import { SALES_SERIES } from "@/lib/mock/admin";
import { StatsChartCard } from "./stats-chart-card";

export function SalesChart() {
  return (
    <StatsChartCard
      title={t("admin.dashboard.chart.title")}
      subtitles={{ monthly: t("admin.dashboard.chart.subMonthly"), yearly: t("admin.dashboard.chart.subYearly") }}
      series={SALES_SERIES}
      gradientId="sales-area"
    />
  );
}
