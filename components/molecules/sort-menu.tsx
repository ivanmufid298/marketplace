"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../atoms/icon";

type SortMenuProps<V extends string> = {
  options: { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
};

export function SortMenu<V extends string>({ options, value, onChange }: SortMenuProps<V>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className={`sort-wrap${open ? " open" : ""}`} ref={ref}>
      <button type="button" className="sort-trigger" aria-expanded={open} aria-haspopup="listbox" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
        <span>{options.find((o) => o.value === value)?.label}</span>
        <Icon name="chevronDown" />
      </button>
      <div className="sort-menu" role="listbox">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`sort-option${value === o.value ? " active" : ""}`}
            role="option"
            aria-selected={value === o.value}
            onClick={() => { onChange(o.value); setOpen(false); }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
