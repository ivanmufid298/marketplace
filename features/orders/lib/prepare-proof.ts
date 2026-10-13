import { resizePhoto, ResizeFailure } from "@/features/catalog";

// A transfer proof is mostly a phone screenshot or a photo of a receipt: several MB that nobody needs. Before it is sent
// it is shrunk to WebP (at most 1600 px wide, never enlarged), which is a few hundred KB and plenty to read an amount.
// A PDF is sent as it is.

export type ProofProblem = "proofType" | "proofSize" | "proofUnreadable";

export class ProofPrepareError extends Error {
  constructor(readonly reason: ProofProblem) {
    super(`proof not usable: ${reason}`);
  }
}

const EXTENSION: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg" };

/**
 * The file to upload for a chosen proof. Throws ProofPrepareError when the file cannot be used. When the browser cannot
 * encode WebP or JPEG at all, the original is sent as it is (the caller still checks it fits).
 * @param resize injectable for tests; the real one decodes and encodes through a canvas.
 */
export async function prepareProof(file: File, resize: typeof resizePhoto = resizePhoto): Promise<File> {
  if (file.type === "application/pdf") return file;
  try {
    const photo = await resize(file);
    // The largest size is the one worth keeping: it is the original's size, or 1600 px wide for a bigger photo.
    const best = photo.variants[photo.variants.length - 1];
    const base = file.name.replace(/\.[^./\\]+$/, "") || "bukti";
    return new File([best.blob], `${base}.${EXTENSION[photo.contentType] ?? "webp"}`, { type: photo.contentType });
  } catch (error) {
    if (!(error instanceof ResizeFailure)) throw new ProofPrepareError("proofUnreadable");
    if (error.reason === "type") throw new ProofPrepareError("proofType");
    if (error.reason === "size" || error.reason === "empty") throw new ProofPrepareError("proofSize");
    if (error.reason === "encode") return file;
    throw new ProofPrepareError("proofUnreadable");
  }
}
