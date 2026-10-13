// Run with `npm run test:ui`. The private proofs bucket: files go to the right bucket and are never overwritten.
import { describe, expect, it, vi } from "vitest";
import { createSupabaseProofStorage, PROOF_BUCKET } from "./proof-storage";

function client(uploadError: { message: string } | null = null) {
  const upload = vi.fn(async () => ({ data: null, error: uploadError }));
  const remove = vi.fn(async () => ({ data: null, error: null }));
  const from = vi.fn(() => ({ upload, remove }));
  return { client: { storage: { from } } as never, upload, remove, from };
}

describe("createSupabaseProofStorage", () => {
  it("uploads to the private payment-proofs bucket without overwriting, keeping the file's type", async () => {
    const { client: c, upload, from } = client();
    const file = new File(["x"], "b.png", { type: "image/png" });
    await createSupabaseProofStorage(c).upload("orders/o-1/a.png", file, "image/png");
    expect(PROOF_BUCKET).toBe("payment-proofs");
    expect(from).toHaveBeenCalledWith("payment-proofs");
    expect(upload).toHaveBeenCalledWith("orders/o-1/a.png", file, { contentType: "image/png", upsert: false });
  });
  it("throws with the storage message when the upload is refused", async () => {
    const { client: c } = client({ message: "new row violates row-level security policy" });
    await expect(createSupabaseProofStorage(c).upload("orders/o-1/a.png", new File(["x"], "b.png"), "image/png")).rejects.toThrow("new row violates row-level security policy");
  });
  it("removes a file from the same bucket", async () => {
    const { client: c, remove, from } = client();
    await createSupabaseProofStorage(c).remove("orders/o-1/a.png");
    expect(from).toHaveBeenCalledWith("payment-proofs");
    expect(remove).toHaveBeenCalledWith(["orders/o-1/a.png"]);
  });
});
