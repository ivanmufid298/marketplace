import type { ReactNode } from "react";

const ICONS = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-5 15-5 16 0" /></>,
  cart: <><path d="M4 5h2l2 11h9l2-8H7" /><circle cx="10" cy="20" r="1" /><circle cx="17" cy="20" r="1" /></>,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.7-7.5 1.1-1.1a5.5 5.5 0 0 0 0-7.8Z" />,
  home: <path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
  chat: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.7-5A8 8 0 1 1 21 15Z" />,
  send: <path d="m22 2-7 20-4-9-9-4zM22 2 11 13" />,
  chevronDown: <path d="m7 10 5 5 5-5" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  back: <path d="m15 18-6-6 6-6" />,
  products: <path d="M4 7h16v13H4zM7 7V4h10v3" />,
  payments: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></>,
  reviews: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z" />,
  promos: <><path d="M20 12 12 4H4v8l8 8z" /><circle cx="8" cy="8" r="1" /></>,
  vouchers: <><path d="M3 8a2 2 0 0 0 0 4v5h18v-5a2 2 0 0 0 0-4V3H3z" /><path d="M13 7h.01M13 13h.01" /></>,
  content: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8" cy="9" r="2" /><path d="m21 15-5-5L5 20" /></>,
  shipping: <><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" /><circle cx="7" cy="19" r="2" /><circle cx="18" cy="19" r="2" /></>,
  bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  external: <path d="M14 3h7v7M10 14 21 3M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  bag: <path d="M6 7h12l1 14H5zM9 9V5a3 3 0 0 1 6 0v4" />,
  eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></>,
  mobile: <><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M11 18h2" /></>,
  desktop: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  tablet: <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M11 18h2" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

type IconProps = {
  name: IconName;
  width?: number;
  strokeWidth?: number;
  /** Fill the shape with the current colour (e.g. an active heart). */
  filled?: boolean;
};

export function Icon({ name, width, strokeWidth = 2, filled = false }: IconProps) {
  return (
    <svg width={width} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={strokeWidth} aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}
