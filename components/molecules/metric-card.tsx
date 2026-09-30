import type { ReactNode } from "react";

type MetricCardProps = {
  label: string;
  value: string;
  note: string;
  icon?: ReactNode;
  /** Render the note as a warning (red). */
  warn?: boolean;
};

export function MetricCard({ label, value, note, icon, warn = false }: MetricCardProps) {
  return (
    <article className="metric">
      <div className="metric-top">
        <span>{label}</span>
        {icon && <span className="metric-icon">{icon}</span>}
      </div>
      <strong>{value}</strong>
      <span className={`trend${warn ? " down" : ""}`}>{note}</span>
    </article>
  );
}
