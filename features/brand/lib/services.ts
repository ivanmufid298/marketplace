import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { createSupabaseLogoStorage } from "./logo-storage";
import { createProfileRepository } from "./profile-repository";
import type { BrandServices } from "./types";

/** True when the build has Supabase credentials, i.e. the profile lives in the database. */
export const brandInDatabase = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());

export function createBrowserBrandServices(): BrandServices {
  const client = getSupabaseBrowserClient();
  return { repo: createProfileRepository(client), storage: createSupabaseLogoStorage(client, process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""), newId: () => crypto.randomUUID() };
}
