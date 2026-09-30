import { buildChart } from "@/lib/chart";
import type { ChartPeriod } from "@/lib/mock/admin";

type LineChartProps = {
  period: ChartPeriod;
  /** Unique per chart on the page; names the area gradient. */
  gradientId: string;
};

export function LineChart({ period, gradientId }: LineChartProps) {
  const { points, area, dots } = buildChart(period.values, period.max);
  const last = period.axis.length - 1;

  return (
    <div className="chart">
      <div className="chart-grid" />
      {period.axis.map((label, i) => (
        <span key={label} className="axis axis-y" style={{ bottom: `${(i / last) * 100}%` }}>{label}</span>
      ))}
      <svg viewBox="0 0 600 240" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#df7895" stopOpacity=".28" />
            <stop offset="1" stopColor="#df7895" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="area" d={area} style={{ fill: `url(#${gradientId})` }} />
        <polyline points={points} />
        {dots.map(([cx, cy]) => <circle key={cx} cx={cx} cy={cy} r="5" />)}
      </svg>
      <div className="chart-labels">{period.labels.map((l) => <span key={l}>{l}</span>)}</div>
    </div>
  );
}
