"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { Icon } from "../atoms/icon";

export type SelectOption = { value: string; label: string };

type SelectProps = {
  options: SelectOption[];
  /** Controlled value. Omit to let the select manage its own state. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
};

/** Styled replacement for a native select. */
export function Select({ options, value, defaultValue, onChange }: SelectProps) {
  const [inner, setInner] = useState(defaultValue ?? options[0]?.value ?? "");
  const current = value ?? inner;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const pick = (v: string) => {
    setInner(v);
    onChange?.(v);
    setOpen(false);
  };

  return (
    <div className={`custom-select${open ? " open" : ""}`} ref={ref}>
      <button type="button" className="custom-select-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{options.find((o) => o.value === current)?.label ?? t("admin.ui.selectPlaceholder")}</span>
        <Icon name="chevron" />
      </button>
      <div className="custom-select-menu" role="listbox">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="option"
            aria-selected={o.value === current}
            className={`custom-select-option${o.value === current ? " active" : ""}`}
            onClick={() => pick(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
