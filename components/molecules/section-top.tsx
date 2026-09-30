import type { ReactNode } from "react";

type SectionTopProps = {
  title: string;
  text: string;
  /** Actions or filters shown on the right. */
  children?: ReactNode;
};

export function SectionTop({ title, text, children }: SectionTopProps) {
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
