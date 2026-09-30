import type { ReactNode } from "react";

type IconButtonProps = {
  label: string;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
};

export function IconButton({ label, onClick, className = "", children }: IconButtonProps) {
  return (
    <button type="button" className={`icon-btn ${className}`.trim()} aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}
