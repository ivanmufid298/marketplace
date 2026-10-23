import { LOGO_BUCKET, publicLogoUrl, type LogoStorage } from "./types";

/** The part of the Supabase client that this adapter uses, so tests can stand in for it. */
export type LogoStorageClient = {
  storage: {
    from(bucket: string): {
      upload(path: string, body: Blob, options: { contentType: string; cacheControl: string; upsert: boolean }): PromiseLike<{ error: { message: string } | null }>;
      remove(paths: string[]): PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

export class LogoStorageError extends Error {
  constructor(readonly operation: "upload" | "remove", detail: string) {
    super(`logo storage ${operation} failed: ${detail}`);
  }
}

/** A logo's key holds a fresh random id and is never rewritten, so browsers and the CDN may keep the file for a year. */
const CACHE_ONE_YEAR = "31536000";

export function createSupabaseLogoStorage(client: LogoStorageClient, supabaseUrl: string): LogoStorage {
  return {
    async upload(key, blob) {
      const { error } = await client.storage.from(LOGO_BUCKET).upload(key, blob, { contentType: "image/png", cacheControl: CACHE_ONE_YEAR, upsert: false });
      if (error) throw new LogoStorageError("upload", error.message);
    },
    async remove(key) {
      const { error } = await client.storage.from(LOGO_BUCKET).remove([key]);
      if (error) throw new LogoStorageError("remove", error.message);
    },
    publicUrl: (key) => publicLogoUrl(supabaseUrl, key),
  };
}
