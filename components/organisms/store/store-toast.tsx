"use client";

import { Toast } from "../../atoms/toast";
import { useStore } from "../../providers/store-provider";

export function StoreToast() {
  const { toast } = useStore();
  return <Toast message={toast} />;
}
