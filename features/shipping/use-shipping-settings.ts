"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserSettingsServices, settingsInDatabase } from "./lib/settings-services";
import type { ManualMethod, SettingsResult, SettingsServices, ShippingSettings } from "./lib/settings-types";

// The shop's shipping settings and manual rates, for the admin screen. In the database when the build has Supabase credentials (or a fake
// is given); otherwise `database` is false and the admin keeps working with the sample screen.

export type ShippingSettingsState = {
  database: boolean;
  status: "loading" | "ready" | "error";
  settings: ShippingSettings | null;
  methods: ManualMethod[];
  reload: () => void;
  /** Saves the settings, then reads them again. */
  saveSettings: (settings: ShippingSettings) => Promise<SettingsResult<null>>;
  /** Saves one manual rate, then reads the rates again. */
  saveMethod: (code: string, change: Omit<ManualMethod, "code">) => Promise<SettingsResult<null>>;
};

export function useShippingSettings(provided?: SettingsServices): ShippingSettingsState {
  const database = provided !== undefined || settingsInDatabase();
  // Built after mount so the server render never creates a browser client.
  const [services, setServices] = useState<SettingsServices | null>(provided ?? null);
  const [loaded, setLoaded] = useState<{ status: ShippingSettingsState["status"]; settings: ShippingSettings | null; methods: ManualMethod[] }>({ status: database ? "loading" : "ready", settings: null, methods: [] });

  useEffect(() => {
    if (database && !services) setServices(createBrowserSettingsServices());
  }, [database, services]);

  const reload = useCallback(async () => {
    if (!services) return;
    setLoaded((current) => ({ ...current, status: "loading" }));
    const [settings, methods] = await Promise.all([services.repo.get(), services.repo.listMethods()]);
    setLoaded((current) => (settings.ok && methods.ok ? { status: "ready", settings: settings.value, methods: methods.value } : { ...current, status: "error" }));
  }, [services]);

  useEffect(() => {
    // Reading the settings when the screen opens is the point of this effect; the state it sets is the result.
    void reload();
  }, [reload]);

  const saveSettings = useCallback(
    async (settings: ShippingSettings): Promise<SettingsResult<null>> => {
      if (!services) return { ok: false, error: "unknown" };
      const result = await services.repo.save(settings);
      if (result.ok) await reload();
      return result;
    },
    [reload, services],
  );
  const saveMethod = useCallback(
    async (code: string, change: Omit<ManualMethod, "code">): Promise<SettingsResult<null>> => {
      if (!services) return { ok: false, error: "unknown" };
      const result = await services.repo.updateMethod(code, change);
      if (result.ok) await reload();
      return result;
    },
    [reload, services],
  );

  return { database, status: database ? loaded.status : "ready", settings: database ? loaded.settings : null, methods: database ? loaded.methods : [], reload: () => void reload(), saveSettings, saveMethod };
}
