import type { ButtonHTMLAttributes } from "react";

const VARIANT_CLASS = {
  primary: "primary",
  secondary: "secondary",
  checkout: "checkout",
  copy: "copy-btn",
} as const;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANT_CLASS;
};

/** Storefront button. The admin dashboard uses AdminButton because its legacy CSS differs. */
export function Button({ variant = "primary", type = "button", className = "", ...props }: ButtonProps) {
  return <button type={type} className={`${VARIANT_CLASS[variant]} ${className}`.trim()} {...props} />;
}
