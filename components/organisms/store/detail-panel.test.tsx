// Run with `npm run test:ui`. Which reviews the detail panel shows: the product's own (loaded) for a database
// product, and the sample reviews for the sample products of the local demo.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/features/auth";
import { CatalogProvider, useCatalog } from "@/features/catalog";
import type { Product } from "@/lib/mock/store";
import { UiProvider } from "@/shared/ui-state/ui-provider";
import { StoreProvider } from "../../providers/store-provider";
import { DetailPanel } from "./detail-panel";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/features/reviews", async (original) => ({
  ...(await original<typeof import("@/features/reviews")>()),
  ProductReviewsLoader: ({ productId }: { productId: number }) => <p data-testid="loader">reviews of {productId}</p>,
}));

const database: Product = { id: 11, slug: "mug", name: "Mug Blush", cat: "Rumah", price: 89000, stock: 5, desc: "Mug.", photos: [] };
const sample: Product = { id: 1, name: "Mug Contoh", cat: "Rumah", price: 89000, stock: 5, desc: "Mug.", pos: 0 };

function Opener({ product }: { product: Product }) {
  const { openDetail } = useCatalog();
  return <button onClick={() => openDetail(product)}>open</button>;
}
function show(product: Product) {
  render(
    <AuthProvider>
      <UiProvider>
        <CatalogProvider services={{ repo: { listCatalog: async () => ({ ok: true, value: { products: [product], categories: [product.cat] } }) } }}>
          <StoreProvider>
            <Opener product={product} />
            <DetailPanel />
          </StoreProvider>
        </CatalogProvider>
      </UiProvider>
    </AuthProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "open" }));
}
afterEach(cleanup);

describe("the reviews in the detail panel", () => {
  it("shows no reviews at all while nothing is open, so sample reviews never reach the page's HTML", async () => {
    const { container } = render(
      <AuthProvider>
        <UiProvider>
          <CatalogProvider services={{ repo: { listCatalog: async () => ({ ok: true, value: { products: [], categories: [] } }) } }}>
            <StoreProvider>
              <DetailPanel />
            </StoreProvider>
          </CatalogProvider>
        </UiProvider>
      </AuthProvider>,
    );
    await act(async () => {});
    expect(container.querySelector(".review-block")).toBeNull();
    expect(screen.queryByText("Nadia P.")).toBeNull();
    expect(screen.queryByTestId("loader")).toBeNull();
  });
  it("loads the product's own reviews for a database product, and shows no sample reviews", async () => {
    show(database);
    await act(async () => {});
    expect(screen.getByTestId("loader").textContent).toBe("reviews of 11");
    expect(screen.queryByText("Nadia P.")).toBeNull();
    expect(screen.queryByText("✓ Pembelian terverifikasi")).toBeNull();
  });
  it("keeps the sample reviews for a sample product, without loading anything", async () => {
    show(sample);
    await act(async () => {});
    expect(screen.queryByTestId("loader")).toBeNull();
    expect(screen.getByText("Nadia P.")).toBeTruthy();
    expect(screen.getByText("✓ Pembelian terverifikasi")).toBeTruthy();
  });
  it("links a database product to its own page, and a sample product to none", async () => {
    show(database);
    await act(async () => {});
    expect(screen.getByRole("link", { name: "Buka halaman produk" }).getAttribute("href")).toBe("/produk/mug");
    cleanup();
    show(sample);
    await act(async () => {});
    expect(screen.queryByRole("link", { name: "Buka halaman produk" })).toBeNull();
  });
});
