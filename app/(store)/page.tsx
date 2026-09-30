import { Categories } from "@/components/store/categories";
import { Hero } from "@/components/store/hero";
import { HotPromo } from "@/components/store/hot-promo";
import { ProductSection } from "@/components/store/product-section";

export default function HomePage() {
  return (
    <main className="shell">
      <Hero />
      <Categories />
      <HotPromo />
      <ProductSection />
    </main>
  );
}
