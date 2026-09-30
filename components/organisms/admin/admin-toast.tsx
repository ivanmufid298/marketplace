"use client";

import { Toast } from "../../atoms/toast";
import { useAdmin } from "../../providers/admin-provider";

export function AdminToast() {
  const { toast } = useAdmin();
  return <Toast message={toast} />;
}
