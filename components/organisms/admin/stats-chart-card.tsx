"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import type { ChartSeries } from "@/lib/mock/admin";
import { LineChart } from "../../molecules/line-chart";

type StatsChartCardProps = {
  title: string;
  /** Subtitle under the title for each period, e.g. "Januari–Juni 2026". */
  subtitles: { monthly: string; yearly: string };
  series: ChartSeries;
  gradientId: string;
};

/** Card with a monthly/yearly toggle around a line chart. */
export function StatsChartCard({ title, subtitles, series, gradientId }: StatsChartCardProps) {
  const [mode, setMode] = useState<keyof ChartSeries>("monthly");

  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h3>{title}</h3>
          <span className="sub">{subtitles[mode]}</span>
        </div>
        <div className="segmented">
          <button type="button" className={mode === "monthly" ? "active" : ""} onClick={() => setMode("monthly")}>{t("admin.dashboard.chart.monthly")}</button>
          <button type="button" className={mode === "yearly" ? "active" : ""} onClick={() => setMode("yearly")}>{t("admin.dashboard.chart.yearly")}</button>
        </div>
      </div>
      <LineChart period={series[mode]} gradientId={gradientId} />
    </article>
  );
}
