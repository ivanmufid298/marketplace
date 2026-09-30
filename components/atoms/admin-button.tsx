import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";

type AdminButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "soft" | "line";
  small?: boolean;
  /** Renders a Next.js Link instead of a button. */
  href?: string;
};

/** Admin dashboard button. The storefront uses Button because its legacy CSS differs. */
export function AdminButton({ variant = "line", small = false, href, className = "", type = "button", children, ...rest }: AdminButtonProps) {
  const classes = `btn btn-${variant}${small ? " btn-sm" : ""} ${className}`.trim();
  if (href) {
    return <Link className={classes} href={href}>{children}</Link>;
  }
  return <button type={type} className={classes} {...rest}>{children}</button>;
}
