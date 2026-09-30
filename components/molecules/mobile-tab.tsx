import type { ReactNode } from "react";

type MobileTabProps = {
  label: string;
  icon: ReactNode;
  active: boolean;
  badge?: number;
  onClick: () => void;
};

export function MobileTab({ label, icon, active, badge, onClick }: MobileTabProps) {
  return (
    <button type="button" className={`mobile-tab${active ? " active" : ""}`} onClick={onClick}>
      {badge !== undefined && <span className="mobile-count">{badge}</span>}
      {icon}
      <span>{label}</span>
    </button>
  );
}
