/** The couriers the shipping provider can quote, by the code it uses. The shop picks which of them it offers. */
export const COURIERS = [
  { code: "jne", name: "JNE" },
  { code: "sicepat", name: "SiCepat" },
  { code: "jnt", name: "J&T Express" },
  { code: "anteraja", name: "AnterAja" },
  { code: "ninja", name: "Ninja Xpress" },
  { code: "pos", name: "Pos Indonesia" },
  { code: "tiki", name: "TIKI" },
  { code: "lion", name: "Lion Parcel" },
  { code: "sap", name: "SAP Express" },
  { code: "ide", name: "ID Express" },
  { code: "wahana", name: "Wahana" },
] as const;
export const COURIER_CODES: readonly string[] = COURIERS.map((c) => c.code);
/** The couriers offered until the shop chooses others. */
export const DEFAULT_COURIERS = ["jne", "sicepat", "jnt", "anteraja"] as const;

/** The most the shop can add to (or take off) every shipping cost, in rupiah. */
export const MAX_MARKUP = 1_000_000;
/** The most a manual rate can be, in rupiah. */
export const MAX_FEE = 10_000_000;

/** How the shop sends parcels. */
export type ShippingSettings = {
  /** The shipping provider's id for where parcels leave from; null until the shop says. Present exactly when `originLabel` is. */
  originId: number | null;
  originLabel: string | null;
  /** Provider courier codes the shop offers. At least one. */
  couriers: string[];
  /** Shipping is free for an order of at least this many rupiah; null: never free. */
  freeShippingMin: number | null;
  /** Rupiah added to every quoted shipping cost; negative when the shop pays part of it. */
  markup: number;
};

/** One of the shop's own rates, used when the provider cannot be asked (or an address has no place) and for the sample checkout. */
export type ManualMethod = { code: string; label: string; note: string; fee: number; active: boolean };

export type SettingsError = "network" | "forbidden" | "invalid" | "unknown";
export type SettingsResult<T> = { ok: true; value: T } | { ok: false; error: SettingsError };

export interface SettingsRepository {
  get(): Promise<SettingsResult<ShippingSettings>>;
  save(settings: ShippingSettings): Promise<SettingsResult<null>>;
  listMethods(): Promise<SettingsResult<ManualMethod[]>>;
  updateMethod(code: string, change: Omit<ManualMethod, "code">): Promise<SettingsResult<null>>;
}
export type SettingsServices = { repo: SettingsRepository };
