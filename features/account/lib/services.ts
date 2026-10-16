import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { createAddressRepository } from "./address-repository";
import type { AddressServices } from "./types";

/** True when the build has Supabase credentials, i.e. the address book lives in the database. */
export const addressesInDatabase = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());

export const createBrowserAddressServices = (): AddressServices => ({ repo: createAddressRepository(getSupabaseBrowserClient()) });
