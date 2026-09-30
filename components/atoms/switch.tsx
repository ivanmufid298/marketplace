"use client";

import { useState } from "react";

type SwitchProps = {
  label: string;
  defaultOn?: boolean;
  onChange?: (on: boolean) => void;
};

export function Switch({ label, defaultOn = false, onChange }: SwitchProps) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      type="button"
      className={`switch${on ? " on" : ""}`}
      aria-label={label}
      aria-pressed={on}
      onClick={() => {
        setOn(!on);
        onChange?.(!on);
      }}
    />
  );
}
