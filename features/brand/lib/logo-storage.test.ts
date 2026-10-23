// Run with `npm run test:ui`. The Supabase Storage adapter for the logo, against a fake of the client's storage API.
import { describe, expect, it, vi } from "vitest";
import { createSupabaseLogoStorage, LogoStorageError, type LogoStorageClient } from "./logo-storage";

function fakeClient(result: { error: { message: string } | null } = { error: null }) {
  const upload = vi.fn(async () => result);
  const remove = vi.fn(async () => result);
  const from = vi.fn(() => ({ upload, remove }));
  return { client: { storage: { from } } as unknown as LogoStorageClient, upload, remove, from };
}

describe("createSupabaseLogoStorage", () => {
  it("uploads a PNG to the logo bucket without overwriting, with a long cache time", async () => {
    const { client, upload, from } = fakeClient();
    const blob = new Blob(["x"], { type: "image/png" });
    await createSupabaseLogoStorage(client, "https://x.supabase.co").upload("logo/a.png", blob);
    expect(from).toHaveBeenCalledWith("shop-brand");
    expect(upload).toHaveBeenCalledWith("logo/a.png", blob, { contentType: "image/png", cacheControl: "31536000", upsert: false });
  });
  it("throws a LogoStorageError with the reason when an upload fails", async () => {
    const { client } = fakeClient({ error: { message: "The resource already exists" } });
    const call = createSupabaseLogoStorage(client, "https://x.supabase.co").upload("k", new Blob(["x"]));
    await expect(call).rejects.toBeInstanceOf(LogoStorageError);
    await expect(call).rejects.toThrow("The resource already exists");
  });
  it("removes one file from the same bucket, and throws when that fails", async () => {
    const { client, remove, from } = fakeClient();
    await createSupabaseLogoStorage(client, "https://x.supabase.co").remove("logo/a.png");
    expect(from).toHaveBeenCalledWith("shop-brand");
    expect(remove).toHaveBeenCalledWith(["logo/a.png"]);
    await expect(createSupabaseLogoStorage(fakeClient({ error: { message: "nope" } }).client, "https://x.co").remove("k")).rejects.toBeInstanceOf(LogoStorageError);
  });
  it("tells the public address of a file", () => {
    expect(createSupabaseLogoStorage(fakeClient().client, "https://x.supabase.co/").publicUrl("logo/a.png")).toBe("https://x.supabase.co/storage/v1/object/public/shop-brand/logo/a.png");
  });
});
