import { publicObjectUrl } from "./image-variants";

// Where product photo files live. The rest of the module talks to this small interface, so moving from Supabase
// Storage to Cloudflare R2 later (PRD 4) means writing one more adapter and nothing else.

export type PhotoStorage = {
  /** Stores one file. Never overwrites: a key that already exists is an error. */
  upload(key: string, blob: Blob, contentType: string): Promise<void>;
  /** Removes files. Keys that do not exist are not an error. */
  remove(keys: string[]): Promise<void>;
  publicUrl(key: string): string;
};

export class PhotoStorageError extends Error {
  constructor(readonly operation: "upload" | "remove", detail: string) {
    super(`photo storage ${operation} failed: ${detail}`);
  }
}

/** The part of the Supabase client that this adapter uses, so tests can stand in for it. */
export type StorageClientLike = {
  storage: {
    from(bucket: string): {
      upload(path: string, body: Blob, options: { contentType: string; cacheControl: string; upsert: boolean }): PromiseLike<{ error: { message: string } | null }>;
      remove(paths: string[]): PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

export const PHOTO_BUCKET = "product-images";
/** A photo's key contains a fresh random id and is never rewritten, so browsers and the CDN may keep it for a year. */
const CACHE_ONE_YEAR = "31536000";

export function createSupabasePhotoStorage(client: StorageClientLike, supabaseUrl: string, bucket = PHOTO_BUCKET): PhotoStorage {
  return {
    async upload(key, blob, contentType) {
      const { error } = await client.storage.from(bucket).upload(key, blob, { contentType, cacheControl: CACHE_ONE_YEAR, upsert: false });
      if (error) throw new PhotoStorageError("upload", error.message);
    },
    async remove(keys) {
      if (keys.length === 0) return;
      const { error } = await client.storage.from(bucket).remove(keys);
      if (error) throw new PhotoStorageError("remove", error.message);
    },
    publicUrl: (key) => publicObjectUrl(supabaseUrl, bucket, key),
  };
}
