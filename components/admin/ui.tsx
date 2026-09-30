"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PaymentStatus } from "@/lib/admin-data";
import { PAYMENT_STATUS_TEXT } from "@/lib/admin-data";

export const ICONS = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
  products: <path d="M4 7h16v13H4zM7 7V4h10v3" />,
  payments: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></>,
  interactions: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.7-5A8 8 0 1 1 21 15Z" />,
  reviews: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z" />,
  promos: <><path d="M20 12 12 4H4v8l8 8z" /><circle cx="8" cy="8" r="1" /></>,
  vouchers: <><path d="M3 8a2 2 0 0 0 0 4v5h18v-5a2 2 0 0 0 0-4V3H3z" /><path d="M13 7h.01M13 13h.01" /></>,
  content: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8" cy="9" r="2" /><path d="m21 15-5-5L5 20" /></>,
  shipping: <><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" /><circle cx="7" cy="19" r="2" /><circle cx="18" cy="19" r="2" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  external: <path d="M14 3h7v7M10 14 21 3M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6" />,
  back: <path d="m15 18-6-6 6-6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  bag: <path d="M6 7h12l1 14H5zM9 9V5a3 3 0 0 1 6 0v4" />,
  chevron: <path d="m6 9 6 6 6-6" />,
} as const;

export function Icon({ name, width, strokeWidth = 2 }: { name: keyof typeof ICONS; width?: number; strokeWidth?: number }) {
  return (
    <svg width={width} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
      {ICONS[name]}
    </svg>
  );
}

export function SearchBar({ value, onChange, placeholder, id }: { value: string; onChange: (v: string) => void; placeholder: string; id?: string }) {
  return (
    <label className="searchbar">
      <Icon name="search" />
      <input id={id} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function StatusBadge({ status }: { status: PaymentStatus }) {
  return <span className={`status ${status}`}>{PAYMENT_STATUS_TEXT[status]}</span>;
}

/** Toggle switch. Controlled when `on`/`onChange` are given, otherwise manages its own state. */
export function Switch({ label, defaultOn = false, onChange, className = "" }: { label: string; defaultOn?: boolean; onChange?: (on: boolean) => void; className?: string }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      type="button"
      className={`switch${on ? " on" : ""} ${className}`.trim()}
      aria-label={label}
      aria-pressed={on}
      onClick={() => {
        setOn(!on);
        onChange?.(!on);
      }}
    />
  );
}

export type Option = { value: string; label: string };

export function Select({ options, value, defaultValue, onChange, name }: { options: Option[]; value?: string; defaultValue?: string; onChange?: (v: string) => void; name?: string }) {
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
      {name && <input type="hidden" name={name} value={current} />}
      <button type="button" className="custom-select-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{options.find((o) => o.value === current)?.label ?? "Pilih opsi"}</span>
        <Icon name="chevron" />
      </button>
      <div className="custom-select-menu" role="listbox">
        {options.map((o) => (
          <button key={o.value} type="button" role="option" aria-selected={o.value === current} className={`custom-select-option${o.value === current ? " active" : ""}`} onClick={() => pick(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SectionTop({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className="section-top">
      <div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      {children}
    </div>
  );
}
