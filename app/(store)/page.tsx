import { CategoryNav } from "@/components/organisms/store/category-nav";
import { Hero } from "@/components/organisms/store/hero";
import { HotPromoSection } from "@/components/organisms/store/hot-promo-section";
import { ProductSection } from "@/components/organisms/store/product-section";

export default function HomePage() {
  return (
    <main className="shell">
      <Hero />
      <CategoryNav />
      <HotPromoSection />
      <ProductSection />
    </main>
  );
}
