// Run with `npm run test:ui`. The Supabase Storage adapter, against a fake of the client's storage API.
import { describe, expect, it, vi } from "vitest";
import { createSupabasePhotoStorage, PhotoStorageError, PHOTO_BUCKET, type StorageClientLike } from "./photo-storage";

function fakeClient(result: { error: { message: string } | null } = { error: null }) {
  const upload = vi.fn(async () => result);
  const remove = vi.fn(async () => result);
  const from = vi.fn(() => ({ upload, remove }));
  return { client: { storage: { from } } as unknown as StorageClientLike, upload, remove, from };
}

describe("createSupabasePhotoStorage", () => {
  it("uploads to the product bucket without overwriting and with a long cache time", async () => {
    const { client, upload, from } = fakeClient();
    const file = new Blob(["x"], { type: "image/webp" });
    await createSupabasePhotoStorage(client, "https://x.supabase.co").upload("products/1/a-400.webp", file, "image/webp");
    expect(from).toHaveBeenCalledWith(PHOTO_BUCKET);
    expect(upload).toHaveBeenCalledWith("products/1/a-400.webp", file, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  });
  it("throws a PhotoStorageError carrying the reason when an upload fails", async () => {
    const { client } = fakeClient({ error: { message: "The resource already exists" } });
    const call = createSupabasePhotoStorage(client, "https://x.supabase.co").upload("k", new Blob(["x"]), "image/webp");
    await expect(call).rejects.toBeInstanceOf(PhotoStorageError);
    await expect(call).rejects.toThrow("The resource already exists");
  });
  it("removes files in one call", async () => {
    const { client, remove } = fakeClient();
    await createSupabasePhotoStorage(client, "https://x.supabase.co").remove(["a", "b"]);
    expect(remove).toHaveBeenCalledWith(["a", "b"]);
  });
  it("does not call the server to remove nothing", async () => {
    const { client, remove, from } = fakeClient();
    await createSupabasePhotoStorage(client, "https://x.supabase.co").remove([]);
    expect(remove).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
  it("throws when removing fails", async () => {
    const { client } = fakeClient({ error: { message: "denied" } });
    await expect(createSupabasePhotoStorage(client, "https://x.supabase.co").remove(["a"])).rejects.toBeInstanceOf(PhotoStorageError);
  });
  it("builds the public URL of an object", () => {
    const { client } = fakeClient();
    expect(createSupabasePhotoStorage(client, "https://x.supabase.co/").publicUrl("products/1/a-400.webp")).toBe("https://x.supabase.co/storage/v1/object/public/product-images/products/1/a-400.webp");
  });
  it("can target another bucket", async () => {
    const { client, from } = fakeClient();
    await createSupabasePhotoStorage(client, "https://x.supabase.co", "other").remove(["a"]);
    expect(from).toHaveBeenCalledWith("other");
  });
});
