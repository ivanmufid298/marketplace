import Link from "next/link";
import type { ReactNode } from "react";

type MetricCardProps = {
  label: string;
  value: string;
  note: string;
  icon?: ReactNode;
  /** Render the note as a warning (red). */
  warn?: boolean;
  /** Makes the whole card a link to where the number can be acted on. */
  href?: string;
};

export function MetricCard({ label, value, note, icon, warn = false, href }: MetricCardProps) {
  const body = (
    <>
      <div className="metric-top">
        <span>{label}</span>
        {icon && <span className="metric-icon">{icon}</span>}
      </div>
      <strong>{value}</strong>
      <span className={`trend${warn ? " down" : ""}`}>{note}</span>
    </>
  );
  return href ? <Link className="metric metric-link" href={href}>{body}</Link> : <article className="metric">{body}</article>;
}
