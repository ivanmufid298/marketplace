"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { brandInDatabase, createBrowserBrandServices } from "./lib/services";
import { LogoFailure, prepareLogo, type LogoDeps } from "./lib/logo-image";
import { cleanName } from "./lib/validate";
import { DEFAULT_PROFILE, logoKeyFor, publicLogoUrl, type BrandResult, type BrandServices, type ShopProfile } from "./lib/types";

// The shop's name and logo, for every screen that shows them (the storefront header, the admin panel) and for the admin screen that changes
// them. In the database when the build has Supabase credentials (or a fake is given); otherwise the defaults, and `database` is false.

const CACHE_KEY = "marketplace-brand-v1";

export type BrandContextValue = {
  database: boolean;
  status: "loading" | "ready" | "error";
  name: string;
  /** The logo's public address, or null when the shop has none yet (the screens then show their own mark). */
  logoUrl: string | null;
  reload: () => void;
  /** Saves the shop's name, then reads it again. */
  saveName: (name: string) => Promise<BrandResult<null>>;
  /** Shrinks and stores a picked picture as the logo, then reads the profile again. The old logo file is removed. */
  uploadLogo: (file: File) => Promise<BrandResult<null>>;
  /** Takes the logo away (the screens show their own mark again). */
  removeLogo: () => Promise<BrandResult<null>>;
};

const BrandContext = createContext<BrandContextValue | null>(null);

export function useBrand(): BrandContextValue {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("useBrand must be used inside <BrandProvider>");
  return ctx;
}

function readCache(): ShopProfile | null {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "null");
    const p = raw as { name?: unknown; logoKey?: unknown } | null;
    if (p && typeof p.name === "string" && p.name && (p.logoKey === null || typeof p.logoKey === "string")) return { name: p.name, logoKey: p.logoKey as string | null };
  } catch {
    // Unreadable or blocked: start from the defaults.
  }
  return null;
}

type Props = { children: ReactNode; services?: BrandServices; logoDeps?: LogoDeps };

export function BrandProvider({ children, services: provided, logoDeps }: Props) {
  const database = provided !== undefined || brandInDatabase();
  // Built after mount so the server render never creates a browser client.
  const [services, setServices] = useState<BrandServices | null>(provided ?? null);
  const [profile, setProfile] = useState<ShopProfile>(DEFAULT_PROFILE);
  const [status, setStatus] = useState<BrandContextValue["status"]>(database ? "loading" : "ready");

  useEffect(() => {
    if (database && !services) setServices(createBrowserBrandServices());
  }, [database, services]);

  // What this browser saw last time is shown at once, so the header does not flash the default name before the answer arrives.
  useEffect(() => {
    if (!database) return;
    const cached = readCache();
    if (cached) setProfile(cached);
  }, [database]);

  const reload = useCallback(async () => {
    if (!services) return;
    setStatus((s) => (s === "ready" ? s : "loading"));
    const result = await services.repo.get();
    if (!result.ok) {
      setStatus("error");
      return;
    }
    setProfile(result.value);
    setStatus("ready");
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(result.value));
    } catch {
      // Storage blocked: the profile still works for this tab.
    }
  }, [services]);

  useEffect(() => {
    // Reading the profile when the page opens is the point of this effect; the state it sets is the result.
    void reload();
  }, [reload]);

  const saveName = useCallback(
    async (name: string): Promise<BrandResult<null>> => {
      const clean = cleanName(name);
      if (clean === null) return { ok: false, error: "invalidName" };
      if (!services) return { ok: false, error: "unknown" };
      const result = await services.repo.saveName(clean);
      if (result.ok) await reload();
      return result;
    },
    [reload, services],
  );

  const uploadLogo = useCallback(
    async (file: File): Promise<BrandResult<null>> => {
      if (!services) return { ok: false, error: "unknown" };
      let blob: Blob;
      try {
        blob = await prepareLogo(file, logoDeps);
      } catch (error) {
        return { ok: false, error: error instanceof LogoFailure ? error.reason : "logoUnreadable" };
      }
      const key = logoKeyFor(services.newId());
      try {
        await services.storage.upload(key, blob);
      } catch {
        return { ok: false, error: "unknown" };
      }
      const saved = await services.repo.saveLogoKey(key);
      if (!saved.ok) {
        // The profile does not point at the file, so nothing would ever use (or remove) it.
        await services.storage.remove(key).catch(() => undefined);
        return saved;
      }
      const previous = profile.logoKey;
      if (previous && previous !== key) await services.storage.remove(previous).catch(() => undefined);
      await reload();
      return saved;
    },
    [logoDeps, profile.logoKey, reload, services],
  );

  const removeLogo = useCallback(async (): Promise<BrandResult<null>> => {
    if (!services) return { ok: false, error: "unknown" };
    const previous = profile.logoKey;
    const saved = await services.repo.saveLogoKey(null);
    if (!saved.ok) return saved;
    if (previous) await services.storage.remove(previous).catch(() => undefined);
    await reload();
    return saved;
  }, [profile.logoKey, reload, services]);

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const value = useMemo<BrandContextValue>(
    () => ({
      database,
      status,
      name: profile.name,
      logoUrl: profile.logoKey ? (services ? services.storage.publicUrl(profile.logoKey) : publicLogoUrl(base, profile.logoKey)) : null,
      reload: () => void reload(),
      saveName,
      uploadLogo,
      removeLogo,
    }),
    [base, database, profile, reload, removeLogo, saveName, services, status, uploadLogo],
  );
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}
