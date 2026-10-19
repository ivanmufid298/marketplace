/** One address in a buyer's address book. */
export type SavedAddress = {
  id: string;
  /** What the buyer calls it: "Rumah", "Kantor". */
  label: string;
  recipientName: string;
  phone: string;
  address: string;
  city: string;
  postcode: string;
  /** A note for the courier. May be empty. */
  note: string;
  /** The address checkout picks first. There is exactly one when the book is not empty. */
  isDefault: boolean;
  /** The shipping provider's id for the place, chosen from a search; null for an address filled in by hand (priced with the shop's own rates). */
  destinationId: number | null;
  /** The name the place was found under ("CIPETE UTARA, KEBAYORAN BARU, ..."). Present exactly when `destinationId` is. */
  destinationLabel: string | null;
};

/** What the buyer fills in. `isDefault` true makes it the default; it cannot be used to take the default away (choose another instead). */
export type AddressInput = Omit<SavedAddress, "id" | "isDefault" | "destinationId" | "destinationLabel"> & {
  isDefault?: boolean;
  /** Left out, the place is left as it is (nothing for a new address); `null` takes it away. Given, both must be given. */
  destinationId?: number | null;
  destinationLabel?: string | null;
};

/** The same limits the database holds (and an order's address), so a saved address is always one an order will accept. */
export const ADDRESS_LIMITS = { label: 30, recipientName: 120, phoneMin: 5, phoneMax: 30, address: 500, city: 100, postcode: 10, note: 200, destinationLabel: 200 } as const;
/** How many addresses one account may keep. */
export const MAX_ADDRESSES = 10;

export type AddressesError = "network" | "forbidden" | "tooMany" | "invalid" | "notFound" | "unknown";
export type AddressResult<T> = { ok: true; value: T } | { ok: false; error: AddressesError };

/** What the screens use to read and write the book, in the database or (in the demo) in this browser. */
export interface AddressRepository {
  /** The default first, then the newest. */
  list(): Promise<AddressResult<SavedAddress[]>>;
  add(input: AddressInput): Promise<AddressResult<SavedAddress>>;
  update(id: string, input: AddressInput): Promise<AddressResult<null>>;
  remove(id: string): Promise<AddressResult<null>>;
  setDefault(id: string): Promise<AddressResult<null>>;
}
export type AddressServices = { repo: AddressRepository };
