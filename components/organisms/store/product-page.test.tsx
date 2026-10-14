// Run with `npm run test:ui`. The full product page: details, photos, and the cart and wishlist actions.
import { CheckoutProvider } from "@/features/checkout";
import { CartProvider } from "@/features/cart";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/features/auth";
import { CatalogProvider } from "@/features/catalog";
import type { Product } from "@/lib/mock/store";
import { resetOrders } from "@/lib/orders-store";
import { NO_REVIEWS, type ProductReviewsData } from "@/features/reviews";
import { OrdersProvider } from "@/features/orders";
import { UiProvider } from "@/shared/ui-state/ui-provider";
import { StoreProvider, useStore } from "../../providers/store-provider";
import { ProductPage } from "./product-page";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const SESSION_KEY = "marketplace-demo-session-v1";
const photo = (n: number, alt = "") => ({ src: `https://cdn.test/${n}-800.webp`, srcSet: `https://cdn.test/${n}-400.webp 400w`, alt, width: 1600, height: 1200 });
const mug: Product = { id: 11, slug: "mug", name: "Mug Blush", cat: "Rumah", price: 89000, oldPrice: 119000, promo: "25% OFF", stock: 5, desc: "Mug keramik.", photos: [photo(1, "Mug dari depan"), photo(2)] };

function CartProbe() {
  const { cartCount } = useStore();
  return <p data-testid="cart">{cartCount}</p>;
}

function show(product: Product, signedIn = true, reviews: ProductReviewsData = NO_REVIEWS) {
  if (signedIn) window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id: "nadia", email: "n@demo.test", name: "Nadia" }));
  render(
    <AuthProvider>
      <UiProvider>
        <CatalogProvider services={{ repo: { listCatalog: async () => ({ ok: true, value: { products: [product], categories: [product.cat] } }) } }}>
          <OrdersProvider>
            <CartProvider><CheckoutProvider><StoreProvider>
            <ProductPage product={product} reviews={reviews} />
            <CartProbe />
            </StoreProvider></CheckoutProvider></CartProvider>
          </OrdersProvider>
        </CatalogProvider>
      </UiProvider>
    </AuthProvider>,
  );
}

beforeEach(() => { window.localStorage.clear(); resetOrders(); });
afterEach(cleanup);

describe("the details", () => {
  it("shows the name as the page heading, the category, the prices, the promo, stock, and description", () => {
    show(mug);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Mug Blush");
    expect(screen.getByText("Rumah")).toBeTruthy();
    expect(screen.getByText("Rp89.000")).toBeTruthy();
    expect(screen.getByText("Rp119.000").tagName).toBe("DEL");
    expect(screen.getByText("25% OFF")).toBeTruthy();
    expect(screen.getByText("Stok tersedia · 5")).toBeTruthy();
    expect(screen.getByText("Mug keramik.")).toBeTruthy();
  });
  it("warns about low stock", () => {
    show({ ...mug, stock: 2 });
    expect(screen.getByText("🔥 Stok terbatas · tinggal 2")).toBeTruthy();
  });
  it("leaves out the old price, promo, and description when there are none", () => {
    show({ ...mug, oldPrice: undefined, promo: undefined, desc: "" });
    expect(document.querySelector("del")).toBeNull();
    expect(document.querySelector(".product-page-promo")).toBeNull();
    expect(document.querySelector(".product-page-desc")).toBeNull();
  });
  it("links back to the shop", () => {
    show(mug);
    expect(screen.getByRole("link", { name: "← Kembali ke toko" }).getAttribute("href")).toBe("/");
  });
});

describe("photos", () => {
  it("shows the cover large, with its description, and one thumbnail per photo", () => {
    show(mug);
    const main = document.querySelector(".product-page-photo img")!;
    expect(main.getAttribute("src")).toBe("https://cdn.test/1-800.webp");
    expect(main.getAttribute("alt")).toBe("Mug dari depan");
    expect(screen.getAllByRole("button", { name: /Lihat foto/ })).toHaveLength(2);
  });
  it("shows another photo when its thumbnail is chosen", () => {
    show(mug);
    fireEvent.click(screen.getByRole("button", { name: "Lihat foto 2" }));
    const main = document.querySelector(".product-page-photo img")!;
    expect(main.getAttribute("src")).toBe("https://cdn.test/2-800.webp");
    expect(main.getAttribute("alt")).toBe("Mug Blush");
    expect(screen.getByRole("button", { name: "Lihat foto 2" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Lihat foto 1" }).getAttribute("aria-pressed")).toBe("false");
  });
  it("shows no thumbnails for a single photo", () => {
    show({ ...mug, photos: [photo(1)] });
    expect(screen.queryByRole("button", { name: /Lihat foto/ })).toBeNull();
  });
  it("shows an empty frame, not a broken image, when the product has no photo", () => {
    show({ ...mug, photos: [] });
    expect(document.querySelector(".product-page-photo img")).toBeNull();
    expect(document.querySelector(".product-page-photo")).not.toBeNull();
  });
});

describe("reviews", () => {
  it("says there are no reviews yet, with no sample reviews or score", () => {
    show(mug);
    expect(screen.getByRole("heading", { name: "Ulasan pembeli" })).toBeTruthy();
    expect(screen.getByText("Belum ada ulasan untuk produk ini. Ulasan muncul setelah pembeli menyelesaikan pesanan.")).toBeTruthy();
    expect(screen.queryByText("Nadia P.")).toBeNull();
    expect(document.querySelector(".review-score")).toBeNull();
  });
  it("shows the score, the bars, and the reviews it is given", () => {
    const now = Date.now();
    show(mug, true, {
      stats: { count: 2, average: 4.5, stars: [0, 0, 0, 1, 1] },
      reviews: [{ id: 1, author: "Nadia P.", rating: 5, body: "Cantik", verified: true, createdAt: new Date(now - 2 * 86_400_000).toISOString() }, { id: 2, author: "Sarah A.", rating: 4, body: "Bagus", verified: false, createdAt: new Date(now - 10 * 86_400_000).toISOString() }],
    });
    expect(document.querySelector(".score-big")!.textContent).toBe("4,5");
    expect(screen.getByText("2 ulasan")).toBeTruthy();
    expect(screen.getByText("Nadia P.")).toBeTruthy();
    expect(screen.getByText("2 hari lalu")).toBeTruthy();
    expect(screen.getByText("1 minggu lalu")).toBeTruthy();
    expect(screen.getAllByText("✓ Pembelian terverifikasi")).toHaveLength(1);
    expect(screen.queryByText("Belum ada ulasan untuk produk ini. Ulasan muncul setelah pembeli menyelesaikan pesanan.")).toBeNull();
  });
});

describe("actions", () => {
  it("adds the product to the cart for a signed-in shopper", async () => {
    show(mug);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    fireEvent.click(screen.getByRole("button", { name: "Tambah ke keranjang" }));
    expect(screen.getByTestId("cart").textContent).toBe("1");
  });
  it("saves to and removes from the wishlist", () => {
    show(mug);
    fireEvent.click(screen.getByRole("button", { name: "Simpan ke wishlist" }));
    expect(screen.getByRole("button", { name: "Hapus dari wishlist" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hapus dari wishlist" }));
    expect(screen.getByRole("button", { name: "Simpan ke wishlist" })).toBeTruthy();
  });
  it("cannot be added to the cart when sold out", () => {
    show({ ...mug, stock: 0 });
    const button = screen.getByRole("button", { name: "Stok habis" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(within(document.querySelector(".product-page-info") as HTMLElement).getAllByText("Stok habis").length).toBeGreaterThan(0);
    fireEvent.click(button);
    expect(screen.getByTestId("cart").textContent).toBe("0");
  });
});
