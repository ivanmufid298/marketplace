import Link from "next/link";
import { Icon, type IconName } from "../atoms/icon";

type SidebarLinkProps = {
  href: string;
  label: string;
  icon: IconName;
  active: boolean;
  badge?: number;
  onNavigate: () => void;
};

export function SidebarLink({ href, label, icon, active, badge, onNavigate }: SidebarLinkProps) {
  return (
    <Link href={href} className={`nav-btn${active ? " active" : ""}`} onClick={onNavigate}>
      <Icon name={icon} />
      {label}
      {badge !== undefined && badge > 0 && (
        <span style={{ marginLeft: "auto", background: "var(--pink)", color: "var(--wine)", padding: "2px 7px", borderRadius: 999, fontSize: 10 }}>{badge}</span>
      )}
    </Link>
  );
}
