"use client";

import { AdminProductsView } from "@/features/catalog";
import { useAdmin } from "../../providers/admin-provider";

/** The real product screen (Supabase). Wires the catalog module's view to the admin shell's toast. */
export function ProductsScreen() {
  const { showToast } = useAdmin();
  return <AdminProductsView notify={showToast} />;
}
