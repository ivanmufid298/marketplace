import type { CSSProperties, ReactNode } from "react";

/** Small pill on top of a product photo. */
export function Tag({ children }: { children: ReactNode }) {
  return <span className="tag">{children}</span>;
}

/** Amber "low stock" pill. */
export function StockBadge({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span className="low-stock" style={style}>{children}</span>;
}

export type PillTone = "pending" | "progress" | "success" | "danger";

/** Coloured status pill used on the storefront (order status). */
export function StatusPill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export type StatusTone = "pending" | "success" | "failed" | "progress" | "neutral";

/** Coloured status pill used in admin tables. */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={`status ${tone}`}>{children}</span>;
}
