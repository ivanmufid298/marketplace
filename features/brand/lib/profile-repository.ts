import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SHOP_NAME, LOGO_KEY_PATTERN, type BrandError, type BrandRepository, type BrandResult } from "./types";

// The shop's profile in the database. The database lets only admins change it and holds the limits, so this code carries no permission
// checks of its own.

export type BrandDb = Pick<SupabaseClient, "from">;
type ProfileRow = { shop_name: string | null; logo_key: string | null };

export function mapBrandError(error: { code?: string | null; message?: string | null } | null | undefined): BrandError {
  if (!error) return "unknown";
  const message = (error.message ?? "").trim();
  if (!error.code && /failed to fetch|network|load failed|fetch failed/i.test(message)) return "network";
  if (error.code === "23514" || /violates check constraint/i.test(message)) return "invalidName";
  if (error.code === "42501" || /row-level security|permission denied/i.test(message)) return "forbidden";
  return "unknown";
}

export function toProfile(row: ProfileRow | null) {
  const name = row?.shop_name?.trim();
  const key = row?.logo_key ?? null;
  // A key the database would not have accepted is not a logo.
  return { name: name || DEFAULT_SHOP_NAME, logoKey: key !== null && LOGO_KEY_PATTERN.test(key) ? key : null };
}

export function createProfileRepository(db: BrandDb): BrandRepository {
  // Row Level Security hides rows without an error, so "nothing was changed" has to be checked.
  const changed = (data: unknown, error: { code?: string | null; message?: string | null } | null): BrandResult<null> => {
    if (error) return { ok: false, error: mapBrandError(error) };
    return (data as unknown[] | null)?.length ? { ok: true, value: null } : { ok: false, error: "forbidden" };
  };
  return {
    async get() {
      const { data, error } = await db.from("shop_profile").select("shop_name, logo_key").eq("id", 1).maybeSingle();
      if (error) return { ok: false, error: mapBrandError(error) };
      // No row (it should always be there) is the same as nothing set yet.
      return { ok: true, value: toProfile(data as ProfileRow | null) };
    },
    async saveName(name) {
      const { data, error } = await db.from("shop_profile").update({ shop_name: name }).eq("id", 1).select("id");
      return changed(data, error);
    },
    async saveLogoKey(key) {
      const { data, error } = await db.from("shop_profile").update({ logo_key: key }).eq("id", 1).select("id");
      return changed(data, error);
    },
  };
}
