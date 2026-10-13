// Run with `npm run test:ui`. The product route: what it tells search engines and link previews, and what it does for
// an address with no product. The database read is replaced by a fake.
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/mock/store";

const load = vi.fn();
vi.mock("@/features/catalog/server", async (original) => ({ ...(await original<typeof import("@/features/catalog/server")>()), getStoreProductBySlug: (slug: string) => load(slug) }));
vi.mock("@/components/organisms/store/product-page", () => ({ ProductPage: ({ product, reviews }: { product: Product; reviews: { stats: { count: number } } }) => <p data-testid="page">{product.name}:{reviews.stats.count}</p> }));
const loadReviews = vi.fn();
vi.mock("@/features/reviews/server", async (original) => ({ ...(await original<typeof import("@/features/reviews/server")>()), getProductReviews: (id: number) => loadReviews(id) }));
const notFound = vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); });
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

const { generateMetadata, default: ProductRoute } = await import("./page");

const photo = { src: "https://cdn.test/1-800.webp", srcSet: "https://cdn.test/1-400.webp 400w, https://cdn.test/1-1600.webp 1600w", alt: "", width: 1600, height: 1200 };
const mug: Product = { id: 7, slug: "mug", name: "Mug Blush", cat: "Rumah", price: 89000, stock: 3, desc: "Mug keramik berglasir.", photos: [photo] };
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

const none = { stats: { count: 0, average: 0, stars: [0, 0, 0, 0, 0] }, reviews: [] };
beforeEach(() => { loadReviews.mockReset(); loadReviews.mockResolvedValue(none); load.mockReset(); notFound.mockClear(); vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://tokoku.id"); });

describe("generateMetadata", () => {
  it("titles the page with the product, describes it, and points search engines at its own address", async () => {
    load.mockResolvedValue(mug);
    const meta = await generateMetadata(params("mug"));
    expect(meta.title).toBe("Mug Blush — Marketplace");
    expect(meta.description).toBe("Mug keramik berglasir.");
    expect(meta.alternates).toEqual({ canonical: "/produk/mug" });
    expect(load).toHaveBeenCalledWith("mug");
  });
  it("gives link previews the biggest photo", async () => {
    load.mockResolvedValue(mug);
    const meta = await generateMetadata(params("mug"));
    expect(meta.openGraph).toMatchObject({ title: "Mug Blush — Marketplace", url: "/produk/mug", images: [{ url: "https://cdn.test/1-1600.webp", width: 1600, height: 1200, alt: "Mug Blush" }] });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image" });
  });
  it("makes a small preview card and no image when the product has no photo", async () => {
    load.mockResolvedValue({ ...mug, photos: [] });
    const meta = await generateMetadata(params("mug"));
    expect(meta.openGraph).not.toHaveProperty("images");
    expect(meta.twitter).toMatchObject({ card: "summary" });
  });
  it("falls back to the shop's description when the product has none", async () => {
    load.mockResolvedValue({ ...mug, desc: "" });
    expect((await generateMetadata(params("mug"))).description).toBe("Toko online barang jastip dan impor dengan palet pink dan ivory.");
  });
  it("asks search engines not to index an address with no product", async () => {
    load.mockResolvedValue(null);
    expect(await generateMetadata(params("nope"))).toEqual({ title: "Produk tidak ditemukan", robots: { index: false } });
  });
});

describe("the page", () => {
  it("shows the product and its structured data", async () => {
    load.mockResolvedValue(mug);
    const { container, getByTestId } = render(await ProductRoute(params("mug")));
    expect(getByTestId("page").textContent).toBe("Mug Blush:0");
    expect(loadReviews).toHaveBeenCalledWith(7);
    const script = container.querySelector('script[type="application/ld+json"]')!;
    const data = JSON.parse(script.textContent!);
    expect(data).toMatchObject({ "@type": "Product", name: "Mug Blush", offers: { price: 89000, priceCurrency: "IDR", url: "https://tokoku.id/produk/mug" } });
  });
  it("reports a rating to search engines only when there are real reviews", async () => {
    load.mockResolvedValue(mug);
    const without = render(await ProductRoute(params("mug")));
    expect(JSON.parse(without.container.querySelector('script[type="application/ld+json"]')!.textContent!)).not.toHaveProperty("aggregateRating");
    without.unmount();

    loadReviews.mockResolvedValue({ stats: { count: 5, average: 3.8, stars: [0, 1, 1, 1, 2] }, reviews: [] });
    const withReviews = render(await ProductRoute(params("mug")));
    const data = JSON.parse(withReviews.container.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(data.aggregateRating).toEqual({ "@type": "AggregateRating", ratingValue: 3.8, reviewCount: 5, bestRating: 5, worstRating: 1 });
    expect(data.offers.price).toBe(89000);
  });
  it("answers not found for an address with no product", async () => {
    load.mockResolvedValue(null);
    await expect(ProductRoute(params("nope"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });
  it("is rendered on every request", async () => {
    const page = await import("./page");
    expect(page.dynamic).toBe("force-dynamic");
  });
});
