/** A place a parcel can go to, as the shipping provider knows it. The id is the provider's, and is what a rate lookup needs. */
export type Destination = {
  id: number;
  /** "KEBAYORAN LAMA SELATAN, KEBAYORAN LAMA, JAKARTA SELATAN, DKI JAKARTA, 12240" */
  label: string;
  province: string;
  city: string;
  district: string;
  subdistrict: string;
  postcode: string;
};

/** One way to send a parcel, as the provider quotes it. */
export type ProviderRate = {
  /** The provider's courier code: "jne", "sicepat", "jnt", "anteraja". */
  courier: string;
  courierName: string;
  /** "REG", "BEST". */
  service: string;
  description: string;
  /** Rupiah, a whole number. */
  fee: number;
  /** "1-2 day"; empty when the provider does not say. */
  etd: string;
};

/**
 * Why the provider could not answer. `quota`: the day's free hits are used up. `unavailable`: it is down or too slow.
 * `rejected`: it refused our key. `invalid`: it did not accept what was asked. `notConfigured`: there is no key.
 */
export type ProviderError = "quota" | "unavailable" | "rejected" | "invalid" | "notConfigured";
export type ProviderResult<T> = { ok: true; value: T } | { ok: false; error: ProviderError };

export interface ShippingProvider {
  searchDestinations(query: string, limit?: number): Promise<ProviderResult<Destination[]>>;
  quote(input: { originId: number; destinationId: number; weightGram: number; couriers: string[] }): Promise<ProviderResult<ProviderRate[]>>;
}
