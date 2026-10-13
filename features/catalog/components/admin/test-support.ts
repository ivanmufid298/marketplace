// Shared fixtures for the admin product screen tests: an in-memory stand-in for the repository, storage, and resize,
// so a test can fill in the form, save, and look at the result without a network or a real image.
import { vi } from "vitest";
import { slugify } from "../../lib/product-form";
import type { AdminProduct, Category, ProductPhoto } from "../../lib/product-repository";
import type { ResizedPhoto } from "../../lib/resize-image";
import type { CatalogServices } from "../../lib/services";

export const category = (over: Partial<Category> = {}): Category => ({ id: 1, name: "Rumah", slug: "rumah", sortOrder: 0, isActive: true, ...over });
export const photo = (id: number, over: Partial<ProductPhoto> = {}): ProductPhoto => ({ id, objectKey: `products/1/photo${id}aaaa.webp`, alt: "", sortOrder: id, width: 1600, height: 1200, ...over });
export const product = (over: Partial<AdminProduct> = {}): AdminProduct => ({
  id: 1, slug: "mug-blush-daily", name: "Mug Blush Daily", description: "Halus", categoryId: 1, categoryName: "Rumah", price: 89000, compareAtPrice: null, stock: 5,
  weightGram: 350, badge: null, status: "active", sortOrder: 0, photos: [], ...over,
});
export const resizedPhoto = (sourceWidth = 4000): ResizedPhoto => ({
  extension: "webp", contentType: "image/webp", sourceWidth, sourceHeight: Math.round(sourceWidth * 0.75),
  variants: [400, 800, 1600].map((target) => ({ target: target as 400, width: Math.min(target, sourceWidth), height: Math.round(Math.min(target, sourceWidth) * 0.75), blob: new Blob(["x"], { type: "image/webp" }) })),
});

const ok = <T,>(value: T) => ({ ok: true as const, value });
const failure = (kind: string) => ({ ok: false as const, error: { kind } as never });

export function makeFakeServices(initial: { products?: AdminProduct[]; categories?: Category[] } = {}) {
  let products = (initial.products ?? []).map((p) => ({ ...p, photos: [...p.photos] }));
  let categories = [...(initial.categories ?? [category()])];
  let nextProduct = 100;
  let nextCategory = 50;
  let nextPhoto = 500;
  let uuid = 0;

  const catName = (id: number) => categories.find((c) => c.id === id)?.name ?? "";
  const find = (id: number) => products.find((p) => p.id === id);

  const repo = {
    listCategories: vi.fn(async () => ok([...categories])),
    listProducts: vi.fn(async () => ok(products.map((p) => ({ ...p })))),
    getProduct: vi.fn(async (id: number) => { const p = find(id); return p ? ok({ ...p, photos: [...p.photos].sort((a, b) => a.sortOrder - b.sortOrder) }) : failure("notFound"); }),
    createProduct: vi.fn(async (input: Omit<AdminProduct, "id" | "slug" | "categoryName" | "photos" | "sortOrder" | "categoryId"> & { categoryId: number }) => {
      const created: AdminProduct = { ...input, id: nextProduct++, slug: slugify(input.name), categoryName: catName(input.categoryId), sortOrder: 0, photos: [] } as AdminProduct;
      products = [...products, created];
      return ok(created);
    }),
    updateProduct: vi.fn(async (id: number, input: Partial<AdminProduct>) => {
      const current = find(id);
      if (!current) return failure("notFound");
      const updated = { ...current, ...input, categoryName: catName((input.categoryId ?? current.categoryId)) } as AdminProduct;
      products = products.map((p) => (p.id === id ? updated : p));
      return ok(updated);
    }),
    setStatus: vi.fn(async (id: number, status: AdminProduct["status"]) => {
      const current = find(id);
      if (!current) return failure("notFound");
      const updated = { ...current, status };
      products = products.map((p) => (p.id === id ? updated : p));
      return ok(updated);
    }),
    createCategory: vi.fn(async (name: string) => {
      const created: Category = { id: nextCategory++, name: name.trim(), slug: slugify(name), sortOrder: 0, isActive: true };
      categories = [...categories, created];
      return ok(created);
    }),
    addPhoto: vi.fn(async (productId: number, input: { objectKey: string; alt: string; sortOrder: number; width: number | null; height: number | null }) => {
      const added: ProductPhoto = { id: nextPhoto++, ...input };
      products = products.map((p) => (p.id === productId ? { ...p, photos: [...p.photos, added] } : p));
      return ok(added);
    }),
    removePhoto: vi.fn(async (photoId: number) => {
      products = products.map((p) => ({ ...p, photos: p.photos.filter((ph) => ph.id !== photoId) }));
      return ok(null);
    }),
    updatePhotoAlt: vi.fn(async () => ok(null)),
    setPhotoOrder: vi.fn(async (ids: number[]) => {
      products = products.map((p) => ({ ...p, photos: p.photos.map((ph) => (ids.includes(ph.id) ? { ...ph, sortOrder: ids.indexOf(ph.id) } : ph)) }));
      return ok(null);
    }),
  };
  const storage = {
    upload: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    publicUrl: (key: string) => `https://cdn.test/${key}`,
  };
  const resize = vi.fn(async (_file: File) => resizedPhoto());
  const services = {
    repo,
    storage,
    resize,
    newId: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`,
  } as unknown as CatalogServices;

  return { services, repo, storage, resize, state: () => ({ products, categories }) };
}

export type FakeServices = ReturnType<typeof makeFakeServices>;
