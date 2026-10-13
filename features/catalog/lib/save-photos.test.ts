// Run with `npm run test:ui`. Saving photos touches Storage and the database, and either can fail halfway. These tests
// pin down the order of the steps and the cleanup, with a fake storage and a fake repository.
import { describe, expect, it, vi } from "vitest";
import type { PhotoStorage } from "./photo-storage";
import type { ProductPhoto } from "./product-repository";
import type { ResizedPhoto } from "./resize-image";
import { attachPhotos, removePhotoFully, type AttachDeps } from "./save-photos";

const blob = () => new Blob([new Uint8Array(5)], { type: "image/webp" });
const resized = (extension: "webp" | "jpg" = "webp"): ResizedPhoto => ({
  extension,
  contentType: extension === "webp" ? "image/webp" : "image/jpeg",
  sourceWidth: 4000,
  sourceHeight: 3000,
  variants: [
    { target: 400, width: 400, height: 300, blob: blob() },
    { target: 800, width: 800, height: 600, blob: blob() },
    { target: 1600, width: 1600, height: 1200, blob: blob() },
  ],
});

function fakeStorage(opts: { failUploadAt?: number; failRemove?: boolean } = {}) {
  const log: string[] = [];
  let uploads = 0;
  const storage: PhotoStorage = {
    async upload(key, _blob, contentType) {
      uploads++;
      if (opts.failUploadAt === uploads) throw new Error("upload failed");
      log.push(`upload ${key} ${contentType}`);
    },
    async remove(keys) {
      if (opts.failRemove) throw new Error("remove failed");
      log.push(`remove ${keys.join(",")}`);
    },
    publicUrl: (key) => `https://cdn/${key}`,
  };
  return { storage, log };
}

function fakeRepo(opts: { failAt?: number } = {}) {
  const added: { productId: number; photo: Record<string, unknown> }[] = [];
  let calls = 0;
  const repo: AttachDeps["repo"] = {
    async addPhoto(productId, photo) {
      calls++;
      if (opts.failAt === calls) return { ok: false, error: { kind: "forbidden" } };
      added.push({ productId, photo });
      return { ok: true, value: { id: 100 + calls, objectKey: photo.objectKey, alt: photo.alt, sortOrder: photo.sortOrder, width: photo.width, height: photo.height } };
    },
  };
  return { repo, added };
}

const ids = (...list: string[]) => { let i = 0; return () => list[i++]; };
const ID_A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

describe("attachPhotos", () => {
  it("uploads every size, then records the photo once with its base key", async () => {
    const { storage, log } = fakeStorage();
    const { repo, added } = fakeRepo();
    const outcome = await attachPhotos(7, 0, [{ resized: resized(), alt: "Mug" }], { storage, repo, newId: ids(ID_A) });

    expect(log).toEqual([
      `upload products/7/${ID_A}-400.webp image/webp`,
      `upload products/7/${ID_A}-800.webp image/webp`,
      `upload products/7/${ID_A}-1600.webp image/webp`,
    ]);
    expect(added).toHaveLength(1);
    expect(added[0]).toEqual({ productId: 7, photo: { objectKey: `products/7/${ID_A}.webp`, alt: "Mug", sortOrder: 0, width: 1600, height: 1200 } });
    expect(outcome.failure).toBeUndefined();
    expect(outcome.saved.map((p) => p.id)).toEqual([101]);
  });

  it("numbers new photos after the existing ones and gives each its own id", async () => {
    const { storage } = fakeStorage();
    const { repo, added } = fakeRepo();
    await attachPhotos(7, 3, [{ resized: resized(), alt: "" }, { resized: resized(), alt: "" }], { storage, repo, newId: ids(ID_A, ID_B) });
    expect(added.map((a) => [a.photo.objectKey, a.photo.sortOrder])).toEqual([[`products/7/${ID_A}.webp`, 3], [`products/7/${ID_B}.webp`, 4]]);
  });

  it("uses the JPEG extension and type when the set fell back to JPEG", async () => {
    const { storage, log } = fakeStorage();
    const { repo, added } = fakeRepo();
    await attachPhotos(7, 0, [{ resized: resized("jpg"), alt: "" }], { storage, repo, newId: ids(ID_A) });
    expect(log[0]).toBe(`upload products/7/${ID_A}-400.jpg image/jpeg`);
    expect(added[0].photo.objectKey).toBe(`products/7/${ID_A}.jpg`);
  });

  it("removes what it uploaded and records nothing when an upload fails", async () => {
    const { storage, log } = fakeStorage({ failUploadAt: 3 });
    const { repo, added } = fakeRepo();
    const outcome = await attachPhotos(7, 0, [{ resized: resized(), alt: "" }], { storage, repo, newId: ids(ID_A) });
    expect(outcome).toEqual({ saved: [], failure: { kind: "upload" } });
    expect(added).toHaveLength(0);
    expect(log.at(-1)).toBe(`remove products/7/${ID_A}-400.webp,products/7/${ID_A}-800.webp`);
  });

  it("does not call remove when the very first upload fails", async () => {
    const { storage, log } = fakeStorage({ failUploadAt: 1 });
    const { repo } = fakeRepo();
    await attachPhotos(7, 0, [{ resized: resized(), alt: "" }], { storage, repo, newId: ids(ID_A) });
    expect(log).toEqual([]);
  });

  it("removes every uploaded size when recording the photo fails, and reports that error", async () => {
    const { storage, log } = fakeStorage();
    const { repo } = fakeRepo({ failAt: 1 });
    const outcome = await attachPhotos(7, 0, [{ resized: resized(), alt: "" }], { storage, repo, newId: ids(ID_A) });
    expect(outcome).toEqual({ saved: [], failure: { kind: "forbidden" } });
    expect(log.at(-1)).toBe(`remove products/7/${ID_A}-400.webp,products/7/${ID_A}-800.webp,products/7/${ID_A}-1600.webp`);
  });

  it("keeps earlier photos when a later one fails, and does not touch their files", async () => {
    const { storage, log } = fakeStorage();
    const { repo } = fakeRepo({ failAt: 2 });
    const outcome = await attachPhotos(7, 0, [{ resized: resized(), alt: "" }, { resized: resized(), alt: "" }, { resized: resized(), alt: "" }], { storage, repo, newId: ids(ID_A, ID_B, "cccccccc-3333-4333-8333-cccccccccccc") });
    expect(outcome.saved.map((p) => p.objectKey)).toEqual([`products/7/${ID_A}.webp`]);
    expect(outcome.failure).toEqual({ kind: "forbidden" });
    expect(log.filter((l) => l.startsWith("remove")).join(" ")).not.toContain(ID_A);
    expect(log.some((l) => l.includes("cccccccc"))).toBe(false); // the third photo was never tried
  });

  it("still reports the original error when cleanup itself fails", async () => {
    const { storage } = fakeStorage({ failUploadAt: 2, failRemove: true });
    const { repo } = fakeRepo();
    const outcome = await attachPhotos(7, 0, [{ resized: resized(), alt: "" }], { storage, repo, newId: ids(ID_A) });
    expect(outcome.failure).toEqual({ kind: "upload" });
  });

  it("does nothing for an empty list", async () => {
    const { storage, log } = fakeStorage();
    const { repo } = fakeRepo();
    expect(await attachPhotos(7, 0, [], { storage, repo, newId: ids() })).toEqual({ saved: [] });
    expect(log).toEqual([]);
  });
});

describe("removePhotoFully", () => {
  const photo = (objectKey: string): ProductPhoto => ({ id: 5, objectKey, alt: "", sortOrder: 0, width: 1600, height: 1200 });
  const repoWith = (result: Awaited<ReturnType<AttachDeps["repo"]["addPhoto"]>> | { ok: true; value: null } | { ok: false; error: { kind: "forbidden" } }, order: string[]) => ({
    async removePhoto(id: number) { order.push(`row ${id}`); return result as never; },
  });

  it("removes the row first, then every size", async () => {
    const order: string[] = [];
    const storage: PhotoStorage = { upload: vi.fn(), remove: async (keys) => { order.push(`files ${keys.length}`); }, publicUrl: (k) => k };
    const outcome = await removePhotoFully(7, photo("products/7/abcdefgh.webp"), { storage, repo: repoWith({ ok: true, value: null }, order) });
    expect(outcome).toEqual({ ok: true, orphans: false });
    expect(order).toEqual(["row 5", "files 3"]);
  });

  it("keeps the files when the row cannot be removed", async () => {
    const order: string[] = [];
    const storage: PhotoStorage = { upload: vi.fn(), remove: async () => { order.push("files"); }, publicUrl: (k) => k };
    const outcome = await removePhotoFully(7, photo("products/7/abcdefgh.webp"), { storage, repo: repoWith({ ok: false, error: { kind: "forbidden" } }, order) });
    expect(outcome).toEqual({ ok: false, error: { kind: "forbidden" } });
    expect(order).toEqual(["row 5"]);
  });

  it("reports orphans when the files cannot be deleted after the row is gone", async () => {
    const storage: PhotoStorage = { upload: vi.fn(), remove: async () => { throw new Error("nope"); }, publicUrl: (k) => k };
    expect(await removePhotoFully(7, photo("products/7/abcdefgh.webp"), { storage, repo: repoWith({ ok: true, value: null }, []) })).toEqual({ ok: true, orphans: true });
  });

  it("refuses a photo that belongs to another product, without touching anything", async () => {
    const order: string[] = [];
    const storage: PhotoStorage = { upload: vi.fn(), remove: async () => { order.push("files"); }, publicUrl: (k) => k };
    for (const key of ["products/8/abcdefgh.webp", "products/70/abcdefgh.webp", "other/7/abcdefgh.webp"]) {
      expect(await removePhotoFully(7, photo(key), { storage, repo: repoWith({ ok: true, value: null }, order) })).toEqual({ ok: false, error: { kind: "forbidden" } });
    }
    expect(order).toEqual([]);
  });
});
