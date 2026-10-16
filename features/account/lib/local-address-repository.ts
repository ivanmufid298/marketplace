import { addAddress, forDisplay, removeAddress, setDefaultAddress, updateAddress } from "./address-book";
import type { AddressRepository, AddressResult, SavedAddress } from "./types";

// The address book of the demo, kept in this browser per account (the shop without a database).

export const LOCAL_ADDRESSES_PREFIX = "marketplace-addresses-v1:";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

const isAddress = (x: unknown): x is SavedAddress =>
  typeof x === "object" && x !== null && ["id", "label", "recipientName", "phone", "address", "city", "postcode", "note"].every((k) => typeof (x as Record<string, unknown>)[k] === "string") && typeof (x as { isDefault: unknown }).isDefault === "boolean";

export function createLocalAddressRepository(userId: string, storage: Storage = window.localStorage, newId: () => string = () => crypto.randomUUID()): AddressRepository {
  const key = LOCAL_ADDRESSES_PREFIX + userId;
  const read = (): SavedAddress[] => {
    try {
      const raw: unknown = JSON.parse(storage.getItem(key) ?? "[]");
      return Array.isArray(raw) ? raw.filter(isAddress) : [];
    } catch {
      return [];
    }
  };
  const write = (book: SavedAddress[]): AddressResult<null> => {
    try {
      storage.setItem(key, JSON.stringify(book));
      return { ok: true, value: null };
    } catch {
      return { ok: false, error: "unknown" };
    }
  };
  const apply = (result: AddressResult<SavedAddress[]>): AddressResult<null> => {
    if (!result.ok) return result;
    return write(result.value);
  };

  return {
    async list() {
      return { ok: true, value: forDisplay(read()) };
    },
    async add(input) {
      const result = addAddress(read(), input, newId());
      if (!result.ok) return result;
      const saved = write(result.value.book);
      return saved.ok ? { ok: true, value: result.value.added } : saved;
    },
    async update(id, input) {
      return apply(updateAddress(read(), id, input));
    },
    async remove(id) {
      return apply(removeAddress(read(), id));
    },
    async setDefault(id) {
      return apply(setDefaultAddress(read(), id));
    },
  };
}
