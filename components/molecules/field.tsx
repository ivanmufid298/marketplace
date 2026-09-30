import type { ReactNode } from "react";

type FieldProps = {
  label: ReactNode;
  /** Id of the control inside, so the label is clickable. */
  htmlFor?: string;
  /** Span the full form width. */
  full?: boolean;
  children: ReactNode;
};

/** Label plus form control, shared by checkout and admin modal forms. */
export function Field({ label, htmlFor, full = false, children }: FieldProps) {
  return (
    <div className={`field${full ? " full" : ""}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}
