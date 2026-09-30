"use client";

import { useStore } from "./store-provider";

export function Toast() {
  const { toast } = useStore();
  return (
    <div className={`toast${toast ? " show" : ""}`} role="status">
      {toast}
    </div>
  );
}
