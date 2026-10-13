import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProofStorage } from "./order-repository";

export const PROOF_BUCKET = "payment-proofs";

/** The private payment-proofs bucket in Supabase Storage. A file is never overwritten: every proof is kept. */
export function createSupabaseProofStorage(client: Pick<SupabaseClient, "storage">): ProofStorage {
  return {
    async upload(path, file, contentType) {
      const { error } = await client.storage.from(PROOF_BUCKET).upload(path, file, { contentType, upsert: false });
      // The message is turned into a reason (network, not allowed, ...) by the caller.
      if (error) throw new Error(error.message);
    },
    async remove(path) {
      await client.storage.from(PROOF_BUCKET).remove([path]);
    },
  };
}
