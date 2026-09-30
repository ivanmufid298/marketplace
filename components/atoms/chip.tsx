import type { ReactNode } from "react";

type ChipProps = {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
};

export function Chip({ active = false, onClick, children }: ChipProps) {
  return (
    <button type="button" className={`chip${active ? " active" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}
