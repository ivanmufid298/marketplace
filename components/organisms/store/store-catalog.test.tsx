// Run with `npm run test:ui`. The shop's catalog sections reading from a database-backed catalog: loading, failing,
// an empty store, products with and without photos, and the category menus built from the products.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogProvider, useCatalog } from "@/features/catalog";
import type { Product } from "@/lib/mock/store";
import { UiProvider } from "@/shared/ui-state/ui-provider";
import { CategoryNav } from "./category-nav";
import { CategorySheet } from "./category-sheet";
import { HotPromoSection } from "./hot-promo-section";
import { ProductSection } from "./product-section";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

/** Shows which product the side panel would be open for. */
function PanelProbe() {
  const { selected } = useCatalog();
  return <p data-testid="panel">{selected?.name ?? "closed"}</p>;
}

/** Pretends the screen is, or is not, a phone. */
function screenIs(phone: boolean) {
  window.matchMedia = vi.fn((query: string) => ({ matches: phone && query === "(max-width: 500px)", media: query })) as never;
}

type Catalog = { products: Product[]; categories: string[] };
const photo = { src: "https://cdn.test/a-800.webp", srcSet: "https://cdn.test/a-400.webp 400w", alt: "", width: 1600, height: 1200 };
const mug: Product = { id: 11, name: "Mug Blush", cat: "Rumah", price: 89000, oldPrice: 119000, promo: "25% OFF", tag: "Best seller", stock: 2, desc: "", photos: [photo] };
const tote: Product = { id: 12, name: "Tote Canvas", cat: "Fashion", price: 129000, stock: 9, desc: "", photos: [] };

function show(listCatalog: () => Promise<{ ok: true; value: Catalog } | { ok: false; error: { kind: "network" } }>) {
  render(
    <UiProvider>
      <CatalogProvider services={{ repo: { listCatalog } as never }}>
        <CategoryNav />
        <CategorySheet />
        <HotPromoSection />
        <ProductSection />
        <PanelProbe />
      </CatalogProvider>
    </UiProvider>,
  );
}
const loaded = (products: Product[], categories: string[]) => async () => ({ ok: true as const, value: { products, categories } });
beforeEach(() => push.mockClear());
afterEach(() => {
  cleanup();
  // @ts-expect-error -- jsdom has no matchMedia; put it back to that
  delete window.matchMedia;
});

describe("product list states", () => {
  it("says it is loading, and shows no products or empty message meanwhile", () => {
    show(() => new Promise(() => {}));
    expect(screen.getByRole("status").textContent).toBe("Memuat produk…");
    expect(screen.queryByText("Produk yang kamu cari belum ditemukan.")).toBeNull();
    expect(screen.queryByText("Produk segera hadir. Silakan kembali lagi nanti.")).toBeNull();
  });
  it("shows the error with a retry that loads again", async () => {
    const list = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: { kind: "network" } })
      .mockResolvedValueOnce({ ok: true, value: { products: [mug], categories: ["Rumah"] } });
    show(list);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Produk belum bisa dimuat.");
    fireEvent.click(within(alert).getByRole("button", { name: "Coba lagi" }));
    await screen.findByRole("heading", { name: "Mug Blush" });
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("says the store has no products yet, not that a search found nothing", async () => {
    show(loaded([], []));
    expect(await screen.findByText("Produk segera hadir. Silakan kembali lagi nanti.")).toBeTruthy();
    expect(screen.queryByText("Produk yang kamu cari belum ditemukan.")).toBeNull();
  });
  it("says nothing was found when a category has no match but the store has products", async () => {
    show(loaded([mug], ["Rumah", "Fashion"]));
    await screen.findByRole("heading", { name: "Mug Blush" });
    fireEvent.click(screen.getByRole("button", { name: "Fashion" }));
    expect(screen.getByText("Produk yang kamu cari belum ditemukan.")).toBeTruthy();
  });
});

describe("product cards", () => {
  it("shows a photo, the tag, and no shop or rating line for a database product", async () => {
    show(loaded([mug], ["Rumah"]));
    const card = (await screen.findByRole("heading", { name: "Mug Blush" })).closest("article")!;
    const img = card.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://cdn.test/a-800.webp");
    expect(within(card).getByText("Best seller")).toBeTruthy();
    expect(card.querySelector(".shop")).toBeNull();
    expect(card.querySelector(".rating")).toBeNull();
    expect(within(card).getByText("🔥 Tinggal 2")).toBeTruthy();
  });
  it("shows a plain box for a product without photos, and no tag when it has none", async () => {
    show(loaded([tote], ["Fashion"]));
    const card = (await screen.findByRole("heading", { name: "Tote Canvas" })).closest("article")!;
    expect(card.querySelector("img")).toBeNull();
    expect(card.querySelector(".tag")).toBeNull();
    expect(card.querySelector(".photo")!.className).toContain("has-photo");
  });
});

describe("promo section", () => {
  it("lists only products on promo", async () => {
    show(loaded([mug, tote], ["Rumah", "Fashion"]));
    await screen.findByRole("heading", { name: "Mug Blush" });
    const hot = document.querySelector(".hot-list")!;
    expect(within(hot as HTMLElement).getByText("Mug Blush")).toBeTruthy();
    expect(within(hot as HTMLElement).queryByText("Tote Canvas")).toBeNull();
  });
  it("is left out entirely when nothing is on promo", async () => {
    show(loaded([tote], ["Fashion"]));
    await screen.findByRole("heading", { name: "Tote Canvas" });
    expect(document.querySelector(".hot-section")).toBeNull();
  });
});

describe("category menus", () => {
  it("offer only the categories that have products, in the order given", async () => {
    show(loaded([mug, tote], ["Fashion", "Rumah"]));
    await screen.findByRole("heading", { name: "Mug Blush" });
    const nav = within(screen.getByRole("navigation"));
    expect(nav.getAllByRole("button").map((b) => b.textContent)).toEqual(["Semua", "Fashion", "Rumah"]);
    const sheet = within(document.querySelector(".sheet-options") as HTMLElement);
    expect(sheet.getAllByRole("button", { hidden: true }).map((b) => b.textContent)).toEqual(["Semua produk", "Fashion", "Rumah"]);
  });
  it("filter the list by the category chosen", async () => {
    show(loaded([mug, tote], ["Rumah", "Fashion"]));
    await screen.findByRole("heading", { name: "Mug Blush" });
    fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: "Fashion" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Mug Blush" })).toBeNull());
    expect(screen.getByRole("heading", { name: "Tote Canvas" })).toBeTruthy();
  });
});

describe("tapping a product", () => {
  const withSlug: Product = { ...mug, slug: "mug-blush" };
  const sampleLike: Product = { ...tote, slug: undefined };

  it("opens the product's own page on a phone, not the side panel", async () => {
    screenIs(true);
    show(loaded([withSlug], ["Rumah"]));
    fireEvent.click((await screen.findByRole("heading", { name: "Mug Blush" })).closest("article")!);
    expect(push).toHaveBeenCalledWith("/produk/mug-blush");
    expect(screen.getByTestId("panel").textContent).toBe("closed");
  });
  it("opens the side panel on a bigger screen and stays on the list", async () => {
    screenIs(false);
    show(loaded([withSlug], ["Rumah"]));
    fireEvent.click((await screen.findByRole("heading", { name: "Mug Blush" })).closest("article")!);
    expect(screen.getByTestId("panel").textContent).toBe("Mug Blush");
    expect(push).not.toHaveBeenCalled();
  });
  it("opens the side panel on a phone for a product that has no address", async () => {
    screenIs(true);
    show(loaded([sampleLike], ["Fashion"]));
    fireEvent.click((await screen.findByRole("heading", { name: "Tote Canvas" })).closest("article")!);
    expect(screen.getByTestId("panel").textContent).toBe("Tote Canvas");
    expect(push).not.toHaveBeenCalled();
  });
  it("uses the side panel when the browser cannot measure the screen", async () => {
    show(loaded([withSlug], ["Rumah"]));
    fireEvent.click((await screen.findByRole("heading", { name: "Mug Blush" })).closest("article")!);
    expect(screen.getByTestId("panel").textContent).toBe("Mug Blush");
    expect(push).not.toHaveBeenCalled();
  });
  it("measures the screen at the tap, so turning the phone needs no refresh", async () => {
    screenIs(false);
    show(loaded([withSlug], ["Rumah"]));
    const card = (await screen.findByRole("heading", { name: "Mug Blush" })).closest("article")!;
    screenIs(true);
    fireEvent.click(card);
    expect(push).toHaveBeenCalledWith("/produk/mug-blush");
  });
  it("does the same from the promo list", async () => {
    screenIs(true);
    show(loaded([withSlug], ["Rumah"]));
    await screen.findByRole("heading", { name: "Mug Blush" });
    fireEvent.click(within(document.querySelector(".hot-list") as HTMLElement).getByRole("button"));
    expect(push).toHaveBeenCalledWith("/produk/mug-blush");
    expect(screen.getByTestId("panel").textContent).toBe("closed");
    screenIs(false);
    fireEvent.click(within(document.querySelector(".hot-list") as HTMLElement).getByRole("button"));
    expect(screen.getByTestId("panel").textContent).toBe("Mug Blush");
  });
});
