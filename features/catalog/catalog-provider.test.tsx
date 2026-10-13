// Run with `npm run test:ui`. Where the catalog comes from: the database when there are credentials (or a fake is
// given), the sample products otherwise, plus loading, failing, and trying again.
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UiProvider } from "@/shared/ui-state/ui-provider";
import type { Product } from "@/lib/mock/store";
import { CatalogProvider, useCatalog } from "./catalog-provider";
import type { StorefrontServices } from "./lib/storefront-services";

const dbProduct = (id: number, name: string, cat = "Rumah"): Product => ({ id, name, cat, price: 1000 * id, stock: 3, desc: "", photos: [] });

function Probe() {
  const { status, products, categories, reload, getProduct } = useCatalog();
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="names">{products.map((p) => p.name).join("|")}</p>
      <p data-testid="categories">{categories.join("|")}</p>
      <p data-testid="found">{getProduct(11)?.name ?? "none"}</p>
      <button onClick={reload}>reload</button>
    </div>
  );
}

function services(listCatalog: StorefrontServices["repo"]["listCatalog"]): StorefrontServices {
  return { repo: { listCatalog } };
}
const show = (s?: StorefrontServices) => render(<UiProvider><CatalogProvider services={s}><Probe /></CatalogProvider></UiProvider>);
const text = (id: string) => screen.getByTestId(id).textContent;

beforeEach(() => vi.unstubAllEnvs());
afterEach(cleanup);

describe("the sample catalog (no database)", () => {
  it("is ready on the first render with the six sample products and four categories", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    show();
    expect(text("status")).toBe("ready");
    expect(text("names")!.split("|")).toHaveLength(6);
    expect(text("categories")).toBe("Rumah|Fashion|Elektronik|Kecantikan");
  });
});

describe("the database catalog", () => {
  it("starts loading with nothing in it, then shows what the database returned", async () => {
    let finish: (v: Awaited<ReturnType<StorefrontServices["repo"]["listCatalog"]>>) => void = () => {};
    show(services(() => new Promise((resolve) => { finish = resolve; })));
    expect(text("status")).toBe("loading");
    expect(text("names")).toBe("");
    expect(text("categories")).toBe("");
    await act(async () => finish({ ok: true, value: { products: [dbProduct(11, "Mug"), dbProduct(12, "Tote", "Fashion")], categories: ["Rumah", "Fashion"] } }));
    expect(text("status")).toBe("ready");
    expect(text("names")).toBe("Mug|Tote");
    expect(text("categories")).toBe("Rumah|Fashion");
    expect(text("found")).toBe("Mug");
  });

  it("is ready and empty for a store with no products", async () => {
    show(services(async () => ({ ok: true, value: { products: [], categories: [] } })));
    await waitFor(() => expect(text("status")).toBe("ready"));
    expect(text("names")).toBe("");
  });

  it("reports an error instead of showing the sample products, and loads again on request", async () => {
    const listCatalog = vi.fn<StorefrontServices["repo"]["listCatalog"]>()
      .mockResolvedValueOnce({ ok: false, error: { kind: "network" } })
      .mockResolvedValueOnce({ ok: true, value: { products: [dbProduct(11, "Mug")], categories: ["Rumah"] } });
    show(services(listCatalog));
    await waitFor(() => expect(text("status")).toBe("error"));
    expect(text("names")).toBe("");
    await act(async () => screen.getByRole("button", { name: "reload" }).click());
    await waitFor(() => expect(text("status")).toBe("ready"));
    expect(text("names")).toBe("Mug");
    expect(listCatalog).toHaveBeenCalledTimes(2);
  });

  it("goes back to loading while it reloads", async () => {
    let finish: (v: Awaited<ReturnType<StorefrontServices["repo"]["listCatalog"]>>) => void = () => {};
    const listCatalog = vi.fn<StorefrontServices["repo"]["listCatalog"]>()
      .mockResolvedValueOnce({ ok: false, error: { kind: "network" } })
      .mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    show(services(listCatalog));
    await waitFor(() => expect(text("status")).toBe("error"));
    await act(async () => screen.getByRole("button", { name: "reload" }).click());
    expect(text("status")).toBe("loading");
    await act(async () => finish({ ok: true, value: { products: [], categories: [] } }));
    expect(text("status")).toBe("ready");
  });
});

describe("with credentials but no fake", () => {
  it("builds the browser services and reads from them", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    const listCatalog = vi.fn(async () => ({ ok: true as const, value: { products: [dbProduct(11, "Mug")], categories: ["Rumah"] } }));
    vi.doMock("./lib/storefront-services", async (original) => ({ ...(await original<typeof import("./lib/storefront-services")>()), createBrowserStorefrontServices: () => ({ repo: { listCatalog } }) }));
    vi.resetModules();
    const { CatalogProvider: Fresh, useCatalog: useFresh } = await import("./catalog-provider");
    function FreshProbe() {
      const { status, products } = useFresh();
      return <p data-testid="fresh">{status}:{products.map((p) => p.name).join("|")}</p>;
    }
    const { UiProvider: FreshUi } = await import("@/shared/ui-state/ui-provider");
    render(<FreshUi><Fresh><FreshProbe /></Fresh></FreshUi>);
    await waitFor(() => expect(screen.getByTestId("fresh").textContent).toBe("ready:Mug"));
    vi.doUnmock("./lib/storefront-services");
    vi.resetModules();
  });
});
