"use client";

import { Toast } from "../../atoms/toast";
import { useUi } from "@/shared/ui-state/ui-provider";

export function StoreToast() {
  const { toast } = useUi();
  return <Toast message={toast} />;
}
