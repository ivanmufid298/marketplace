import type { CSSProperties } from "react";

type CloseButtonProps = {
  label: string;
  onClick: () => void;
  style?: CSSProperties;
};

export function CloseButton({ label, onClick, style }: CloseButtonProps) {
  return (
    <button type="button" className="close" aria-label={label} style={style} onClick={onClick}>
      ×
    </button>
  );
}
