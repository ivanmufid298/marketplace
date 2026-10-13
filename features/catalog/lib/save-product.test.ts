// Run with `npm run test:ui`. Saving a product from the form, step by step, with a fake repository and storage.
import { describe, expect, it, vi } from "vitest";
import type { PhotoStorage } from "./photo-storage";
import type { ProductInput } from "./product-form";
import type { AdminProduct, ProductPhoto, ProductRepository } from "./product-repository";
import type { ResizedPhoto } from "./resize-image";
import { saveProduct } from "./save-product";
import type { CatalogServices } from "./services";

const input: ProductInput = { name: "Mug", description: "", categoryId: 1, price: 1000, compareAtPrice: null, stock: 1, weightGram: 100, badge: null, status: "draft" };
const photo = (id: number, order = id): ProductPhoto => ({ id, objectKey: `products/7/key${id}aaaa.webp`, alt: "", sortOrder: order, width: 1600, height: 1200 });
const product = (photos: ProductPhoto[] = []): AdminProduct => ({
  id: 7, slug: "mug", name: "Mug", description: "", categoryId: 1, categoryName: "Rumah", price: 1000, compareAtPrice: null, stock: 1, weightGram: 100, badge: null, status: "draft", sortOrder: 0, photos,
});
const resized = (): ResizedPhoto => ({
  extension: "webp", contentType: "image/webp", sourceWidth: 2000, sourceHeight: 1500,
  variants: [400, 800, 1600].map((target) => ({ target: target as 400, width: target, height: target * 0.75, blob: new Blob(["x"], { type: "image/webp" }) })),
});
const fail = (kind: string) => ({ ok: false as const, error: { kind } as never });

function setup(over: Partial<Record<keyof ProductRepository, unknown>> = {}) {
  const log: string[] = [];
  const repo = {
    createProduct: vi.fn(async () => { log.push("create"); return { ok: true as const, value: product() }; }),
    updateProduct: vi.fn(async (id: number) => { log.push(`update ${id}`); return { ok: true as const, value: product([photo(1), photo(2), photo(3)]) }; }),
    removePhoto: vi.fn(async (id: number) => { log.push(`row-remove ${id}`); return { ok: true as const, value: null }; }),
    setPhotoOrder: vi.fn(async (ids: number[]) => { log.push(`order ${ids.join(",")}`); return { ok: true as const, value: null }; }),
    addPhoto: vi.fn(async (_p: number, ph: { objectKey: string; alt: string; sortOrder: number; width: number | null; height: number | null }) => { log.push(`row-add ${ph.sortOrder}`); return { ok: true as const, value: { id: 50 + ph.sortOrder, ...ph } }; }),
    getProduct: vi.fn(async () => { log.push("reload"); return { ok: true as const, value: product([photo(9)]) }; }),
    ...over,
  } as unknown as ProductRepository;
  const storage: PhotoStorage = {
    upload: vi.fn(async (key: string) => { log.push(`upload ${key.split("/").pop()}`); }),
    remove: vi.fn(async (keys: string[]) => { log.push(`files-remove ${keys.length}`); }),
    publicUrl: (k) => k,
  };
  const services: CatalogServices = { repo, storage, resize: vi.fn(), newId: () => "11111111-aaaa-4aaa-8aaa-111111111111" };
  return { services, repo, storage, log };
}
const base = { productId: null, input, removed: [], keptInOrder: [], added: [] };

describe("saveProduct", () => {
  it("creates a product and reloads it", async () => {
    const { services, log } = setup();
    const outcome = await saveProduct(services, base);
    expect(outcome).toMatchObject({ ok: true, created: true, warnings: [] });
    expect(log).toEqual(["create", "reload"]);
  });

  it("updates an existing product", async () => {
    const { services, repo } = setup();
    const outcome = await saveProduct(services, { ...base, productId: 7, keptInOrder: [photo(1), photo(2), photo(3)] });
    expect(outcome).toMatchObject({ ok: true, created: false });
    expect(repo.updateProduct).toHaveBeenCalledWith(7, input);
    expect(repo.createProduct).not.toHaveBeenCalled();
  });

  it("fails and does nothing else when the product itself cannot be saved", async () => {
    const { services, repo, log } = setup({ createProduct: vi.fn(async () => fail("forbidden")) });
    const outcome = await saveProduct(services, { ...base, added: [{ resized: resized(), alt: "" }] });
    expect(outcome).toEqual({ ok: false, error: { kind: "forbidden" } });
    expect(log).toEqual([]);
    expect(repo.getProduct).not.toHaveBeenCalled();
  });

  it("removes deleted photos row first, then files, before adding new ones", async () => {
    const { services, log } = setup();
    await saveProduct(services, { ...base, productId: 7, removed: [photo(2)], keptInOrder: [photo(1), photo(3)], added: [{ resized: resized(), alt: "A" }] });
    expect(log.indexOf("row-remove 2")).toBeLessThan(log.indexOf("files-remove 3"));
    expect(log.indexOf("files-remove 3")).toBeLessThan(log.findIndex((l) => l.startsWith("upload")));
  });

  it("puts new photos after the kept ones", async () => {
    const { services, repo } = setup();
    await saveProduct(services, { ...base, productId: 7, keptInOrder: [photo(1), photo(2), photo(3)], added: [{ resized: resized(), alt: "A" }, { resized: resized(), alt: "B" }] });
    expect((repo.addPhoto as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1].sortOrder)).toEqual([3, 4]);
  });

  it("saves the arranged order only when it changed", async () => {
    const same = setup();
    await saveProduct(same.services, { ...base, productId: 7, keptInOrder: [photo(1), photo(2), photo(3)] });
    expect(same.repo.setPhotoOrder).not.toHaveBeenCalled();

    const changed = setup();
    await saveProduct(changed.services, { ...base, productId: 7, keptInOrder: [photo(3), photo(1), photo(2)] });
    expect(changed.repo.setPhotoOrder).toHaveBeenCalledWith([3, 1, 2]);
  });

  it("does not count a removed photo when deciding whether the order changed", async () => {
    const { services, repo } = setup();
    await saveProduct(services, { ...base, productId: 7, removed: [photo(2)], keptInOrder: [photo(1), photo(3)] });
    expect(repo.setPhotoOrder).not.toHaveBeenCalled();
  });

  it("keeps going and warns when a photo cannot be removed", async () => {
    const { services } = setup({ removePhoto: vi.fn(async () => fail("forbidden")) });
    const outcome = await saveProduct(services, { ...base, productId: 7, removed: [photo(2)], keptInOrder: [photo(1), photo(3)] });
    expect(outcome).toMatchObject({ ok: true });
    expect(outcome.ok && outcome.warnings).toEqual([{ step: "remove", photoId: 2, error: { kind: "forbidden" } }]);
  });

  it("warns about orphan files when the row went but the files did not", async () => {
    const { services, storage } = setup();
    (storage.remove as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("nope"));
    const outcome = await saveProduct(services, { ...base, productId: 7, removed: [photo(2)], keptInOrder: [photo(1), photo(3)] });
    expect(outcome.ok && outcome.warnings).toEqual([{ step: "orphans", photoId: 2 }]);
  });

  it("keeps the product and warns when a photo upload fails", async () => {
    const { services, storage } = setup();
    (storage.upload as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("down"));
    const outcome = await saveProduct(services, { ...base, added: [{ resized: resized(), alt: "A" }, { resized: resized(), alt: "B" }] });
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.warnings).toEqual([{ step: "upload", failure: { kind: "upload" }, saved: 0, attempted: 2 }]);
  });

  it("warns when saving the order fails but still saves the new photos", async () => {
    const { services, repo } = setup({ setPhotoOrder: vi.fn(async () => fail("network")) });
    const outcome = await saveProduct(services, { ...base, productId: 7, keptInOrder: [photo(3), photo(1), photo(2)], added: [{ resized: resized(), alt: "A" }] });
    expect(outcome.ok && outcome.warnings.map((w) => w.step)).toEqual(["order"]);
    expect(repo.addPhoto).toHaveBeenCalled();
  });

  it("returns what it has when the final reload fails", async () => {
    const { services } = setup({ getProduct: vi.fn(async () => fail("network")) });
    const outcome = await saveProduct(services, base);
    expect(outcome).toMatchObject({ ok: true, product: { id: 7 } });
    expect(outcome.ok && outcome.warnings).toEqual([{ step: "reload", error: { kind: "network" } }]);
  });

  it("returns the freshly loaded product with its final photos", async () => {
    const { services } = setup();
    const outcome = await saveProduct(services, base);
    expect(outcome.ok && outcome.product.photos.map((p) => p.id)).toEqual([9]);
  });
});
