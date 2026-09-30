"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import { CHART_AXIS, CHART_DATA } from "@/lib/mock/admin";

export function SalesChart() {
  const [mode, setMode] = useState<keyof typeof CHART_DATA>("monthly");
  const data = CHART_DATA[mode];
  const sub = mode === "monthly" ? t("admin.dashboard.chart.subMonthly") : t("admin.dashboard.chart.subYearly");

  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h3>{t("admin.dashboard.chart.title")}</h3>
          <span className="sub">{sub}</span>
        </div>
        <div className="segmented">
          <button type="button" className={mode === "monthly" ? "active" : ""} onClick={() => setMode("monthly")}>{t("admin.dashboard.chart.monthly")}</button>
          <button type="button" className={mode === "yearly" ? "active" : ""} onClick={() => setMode("yearly")}>{t("admin.dashboard.chart.yearly")}</button>
        </div>
      </div>
      <div className="chart">
        <div className="chart-grid" />
        {CHART_AXIS.map((label, i) => (
          <span key={label} className="axis axis-y" style={{ bottom: `${i * 50}%` }}>{label}</span>
        ))}
        <svg viewBox="0 0 600 240" preserveAspectRatio="none">
          <defs>
            <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#df7895" stopOpacity=".28" />
              <stop offset="1" stopColor="#df7895" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="area" d={data.area} />
          <polyline points={data.points} />
          {data.dots.map(([cx, cy]) => <circle key={cx} cx={cx} cy={cy} r="5" />)}
        </svg>
        <div className="chart-labels">{data.labels.map((l) => <span key={l}>{l}</span>)}</div>
      </div>
    </article>
  );
}
