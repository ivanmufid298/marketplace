import { cleanAddress, validateAddress } from "./validate";
import { MAX_ADDRESSES, type AddressInput, type AddressResult, type SavedAddress } from "./types";

// The rules of an address book, as plain functions over a list (oldest first). The database keeps the same rules in
// triggers; this is what the demo (no database) follows, so both behave the same way.

type Book = SavedAddress[];

const only = (book: Book, id: string) => book.some((a) => a.id === id);
const makeDefault = (book: Book, id: string): Book => book.map((a) => ({ ...a, isDefault: a.id === id }));

export function addAddress(book: Book, input: AddressInput, id: string): AddressResult<{ book: Book; added: SavedAddress }> {
  if (Object.keys(validateAddress(input)).length > 0) return { ok: false, error: "invalid" };
  if (book.length >= MAX_ADDRESSES) return { ok: false, error: "tooMany" };
  const clean = cleanAddress(input);
  // The first address is the default whatever was asked.
  const added: SavedAddress = { id, label: clean.label, recipientName: clean.recipientName, phone: clean.phone, address: clean.address, city: clean.city, postcode: clean.postcode, note: clean.note, isDefault: book.length === 0 || clean.isDefault === true };
  const next = added.isDefault ? makeDefault([...book, added], id) : [...book, added];
  return { ok: true, value: { book: next, added } };
}

export function updateAddress(book: Book, id: string, input: AddressInput): AddressResult<Book> {
  if (!only(book, id)) return { ok: false, error: "notFound" };
  if (Object.keys(validateAddress(input)).length > 0) return { ok: false, error: "invalid" };
  const clean = cleanAddress(input);
  const changed = book.map((a) => (a.id === id ? { ...a, label: clean.label, recipientName: clean.recipientName, phone: clean.phone, address: clean.address, city: clean.city, postcode: clean.postcode, note: clean.note } : a));
  // Asking for the default moves it; not asking leaves things as they are (the default is never taken away, only moved).
  return { ok: true, value: clean.isDefault === true ? makeDefault(changed, id) : changed };
}

export function removeAddress(book: Book, id: string): AddressResult<Book> {
  const target = book.find((a) => a.id === id);
  if (!target) return { ok: false, error: "notFound" };
  const left = book.filter((a) => a.id !== id);
  // The default goes to the most recently saved address that is left.
  return { ok: true, value: target.isDefault && left.length > 0 ? makeDefault(left, left[left.length - 1].id) : left };
}

export function setDefaultAddress(book: Book, id: string): AddressResult<Book> {
  return only(book, id) ? { ok: true, value: makeDefault(book, id) } : { ok: false, error: "notFound" };
}

/** How the book is shown: the default first, then the newest. */
export const forDisplay = (book: Book): Book => [...book].reverse().sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
