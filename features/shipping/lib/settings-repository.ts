import type { SupabaseClient } from "@supabase/supabase-js";
import { COURIER_CODES, DEFAULT_COURIERS, type ManualMethod, type SettingsError, type SettingsRepository, type SettingsResult, type ShippingSettings } from "./settings-types";

// The shop's shipping settings and manual rates in the database. The database lets only admins change them and holds the limits, so this
// code carries no permission checks of its own.

export type SettingsDb = Pick<SupabaseClient, "from">;

type SettingsRow = { origin_destination_id: number | null; origin_label: string | null; couriers: string[] | null; free_shipping_min: number | null; shipping_markup: number | null };
type MethodRow = { code: string; label: string; note: string | null; fee: number; is_active: boolean };

export function mapSettingsError(error: { code?: string | null; message?: string | null } | null | undefined): SettingsError {
  if (!error) return "unknown";
  const message = (error.message ?? "").trim();
  if (!error.code && /failed to fetch|network|load failed|fetch failed/i.test(message)) return "network";
  if (error.code === "23514" || /violates check constraint/i.test(message)) return "invalid";
  if (error.code === "42501" || /row-level security|permission denied/i.test(message)) return "forbidden";
  return "unknown";
}

export function toSettings(row: SettingsRow): ShippingSettings {
  const couriers = (row.couriers ?? []).filter((c) => COURIER_CODES.includes(c));
  const whole = row.origin_destination_id !== null && row.origin_destination_id !== undefined && Boolean(row.origin_label);
  return {
    originId: whole ? Number(row.origin_destination_id) : null,
    originLabel: whole ? row.origin_label : null,
    couriers: couriers.length > 0 ? couriers : [...DEFAULT_COURIERS],
    freeShippingMin: row.free_shipping_min === null || row.free_shipping_min === undefined ? null : Number(row.free_shipping_min),
    markup: Number(row.shipping_markup ?? 0),
  };
}

export const toMethod = (row: MethodRow): ManualMethod => ({ code: row.code, label: row.label, note: row.note ?? "", fee: Number(row.fee), active: row.is_active });

export function createSettingsRepository(db: SettingsDb): SettingsRepository {
  // Row Level Security hides rows without an error, so "nothing was changed" has to be checked.
  const changed = (data: unknown, error: { code?: string | null; message?: string | null } | null): SettingsResult<null> => {
    if (error) return { ok: false, error: mapSettingsError(error) };
    return (data as unknown[] | null)?.length ? { ok: true, value: null } : { ok: false, error: "forbidden" };
  };
  return {
    async get() {
      const { data, error } = await db.from("shop_settings").select("origin_destination_id, origin_label, couriers, free_shipping_min, shipping_markup").eq("id", 1).maybeSingle();
      if (error) return { ok: false, error: mapSettingsError(error) };
      // No row (it should always be there) is the same as nothing set yet.
      return { ok: true, value: toSettings((data ?? {}) as SettingsRow) };
    },
    async save(s) {
      const { data, error } = await db
        .from("shop_settings")
        .update({ origin_destination_id: s.originId, origin_label: s.originId === null ? null : s.originLabel, couriers: s.couriers, free_shipping_min: s.freeShippingMin, shipping_markup: s.markup })
        .eq("id", 1)
        .select("id");
      return changed(data, error);
    },
    async listMethods() {
      const { data, error } = await db.from("shipping_methods").select("code, label, note, fee, is_active").order("sort_order", { ascending: true }).order("code", { ascending: true });
      if (error) return { ok: false, error: mapSettingsError(error) };
      return { ok: true, value: ((data ?? []) as MethodRow[]).map(toMethod) };
    },
    async updateMethod(code, change) {
      const { data, error } = await db.from("shipping_methods").update({ label: change.label.trim(), note: change.note.trim(), fee: change.fee, is_active: change.active }).eq("code", code).select("code");
      return changed(data, error);
    },
  };
}
