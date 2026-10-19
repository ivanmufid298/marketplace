import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { createSettingsRepository } from "./settings-repository";
import type { SettingsServices } from "./settings-types";

/** True when the build has Supabase credentials, i.e. the settings live in the database. */
export const settingsInDatabase = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());

export const createBrowserSettingsServices = (): SettingsServices => ({ repo: createSettingsRepository(getSupabaseBrowserClient()) });
