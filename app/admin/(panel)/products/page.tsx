import { ProductCatalog } from "@/components/organisms/admin/product-catalog";
import { ProductsScreen } from "@/components/organisms/admin/products-screen";
import { authMode } from "@/features/auth/server";

// Demo mode has no database, so it keeps the sample catalog. With Supabase the real screen reads and writes products.
export default function ProductsPage() {
  return authMode() === "demo" ? <ProductCatalog /> : <ProductsScreen />;
}
