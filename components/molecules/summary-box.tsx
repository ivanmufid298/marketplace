import type { ReactNode } from "react";

export function SummaryLine({ label, value, total = false }: { label: ReactNode; value: ReactNode; total?: boolean }) {
  return (
    <div className={`summary-line${total ? " total" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function SummaryBox({ children }: { children: ReactNode }) {
  return <div className="summary-box">{children}</div>;
}
