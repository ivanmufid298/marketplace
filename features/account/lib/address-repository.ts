import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanAddress } from "./validate";
import type { AddressInput, AddressRepository, AddressResult, AddressesError, SavedAddress } from "./types";

// The signed-in buyer's address book in the database. The database lets each buyer see and change only their own
// addresses, keeps one default, and holds the limit and the sizes, so this code carries no permission checks of its own.

export type AddressesDb = Pick<SupabaseClient, "from">;

type Row = { id: string; label: string; recipient_name: string; phone: string; address: string; city: string; postcode: string; note: string; is_default: boolean; destination_id?: number | null; destination_label?: string | null };
const COLUMNS = "id, label, recipient_name, phone, address, city, postcode, note, is_default, destination_id, destination_label";

export function toSavedAddress(row: Row): SavedAddress {
  return { id: row.id, label: row.label, recipientName: row.recipient_name, phone: row.phone, address: row.address, city: row.city, postcode: row.postcode, note: row.note ?? "", isDefault: row.is_default, destinationId: row.destination_id ?? null, destinationLabel: row.destination_label ?? null };
}

/** The database's short codes and the connection's failures, as one small set of reasons. */
export function mapAddressError(error: { code?: string | null; message?: string | null } | null | undefined): AddressesError {
  if (!error) return "unknown";
  const message = (error.message ?? "").trim();
  if (!error.code && /failed to fetch|network|load failed|fetch failed/i.test(message)) return "network";
  if (message === "too_many_addresses") return "tooMany";
  if (error.code === "23514" || /violates check constraint/i.test(message)) return "invalid";
  if (error.code === "42501" || /row-level security|permission denied/i.test(message)) return "forbidden";
  return "unknown";
}

const columns = (input: AddressInput) => {
  const a = cleanAddress(input);
  // The place is sent only when it was given: left out, an update leaves it as it is.
  const place = a.destinationId === undefined ? {} : { destination_id: a.destinationId, destination_label: a.destinationLabel ?? null };
  return { label: a.label, recipient_name: a.recipientName, phone: a.phone, address: a.address, city: a.city, postcode: a.postcode, note: a.note, ...place };
};

export function createAddressRepository(db: AddressesDb): AddressRepository {
  // Row Level Security hides rows without an error, so "nothing was changed" has to be checked.
  const changed = (data: unknown, error: { code?: string | null; message?: string | null } | null): AddressResult<null> => {
    if (error) return { ok: false, error: mapAddressError(error) };
    return (data as unknown[] | null)?.length ? { ok: true, value: null } : { ok: false, error: "notFound" };
  };

  return {
    async list() {
      const { data, error } = await db.from("addresses").select(COLUMNS).order("is_default", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false });
      if (error) return { ok: false, error: mapAddressError(error) };
      return { ok: true, value: ((data ?? []) as Row[]).map(toSavedAddress) };
    },
    async add(input) {
      const { data, error } = await db.from("addresses").insert({ ...columns(input), ...(input.isDefault === true ? { is_default: true } : {}) }).select(COLUMNS).single();
      if (error || !data) return { ok: false, error: mapAddressError(error) };
      return { ok: true, value: toSavedAddress(data as Row) };
    },
    async update(id, input) {
      // Only asking for the default is sent: the default is moved by choosing another, never switched off.
      const { data, error } = await db.from("addresses").update({ ...columns(input), ...(input.isDefault === true ? { is_default: true } : {}) }).eq("id", id).select("id");
      return changed(data, error);
    },
    async remove(id) {
      const { data, error } = await db.from("addresses").delete().eq("id", id).select("id");
      return changed(data, error);
    },
    async setDefault(id) {
      const { data, error } = await db.from("addresses").update({ is_default: true }).eq("id", id).select("id");
      return changed(data, error);
    },
  };
}
