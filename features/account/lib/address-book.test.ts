// Run with `npm run test:ui`. The rules of an address book (the demo follows them in this browser; the database keeps the
// same ones in triggers, covered by the SQL tests).
import { describe, expect, it } from "vitest";
import { addAddress, forDisplay, removeAddress, setDefaultAddress, updateAddress } from "./address-book";
import { MAX_ADDRESSES, type AddressInput, type SavedAddress } from "./types";

const input = (label: string, over: Partial<AddressInput> = {}): AddressInput => ({ label, recipientName: "Ana", phone: "0811000111", address: "Jl. Mawar 1", city: "Jakarta", postcode: "12345", note: "", ...over });
const saved = (id: string, isDefault = false): SavedAddress => ({ id, label: id, recipientName: "Ana", phone: "0811000111", address: "Jl", city: "Jkt", postcode: "1", note: "", isDefault, destinationId: null, destinationLabel: null });
const defaults = (book: SavedAddress[]) => book.filter((a) => a.isDefault).map((a) => a.id).join(",");
function fill(n: number) {
  let book: SavedAddress[] = [];
  for (let i = 1; i <= n; i++) {
    const r = addAddress(book, input(`A${i}`), `a${i}`);
    if (!r.ok) throw new Error("fill");
    book = r.value.book;
  }
  return book;
}

describe("adding", () => {
  it("makes the first address the default whatever was asked", () => {
    const r = addAddress([], input("Rumah", { isDefault: false }), "a1");
    expect(r.ok && r.value.added.isDefault).toBe(true);
    expect(r.ok && defaults(r.value.book)).toBe("a1");
  });
  it("keeps the default when a later address does not ask for it, and moves it when it does", () => {
    const first = addAddress([], input("Rumah"), "a1");
    if (!first.ok) throw new Error("x");
    const second = addAddress(first.value.book, input("Kantor"), "a2");
    expect(second.ok && defaults(second.value.book)).toBe("a1");
    expect(second.ok && second.value.added.isDefault).toBe(false);
    const third = addAddress(first.value.book, input("Kos", { isDefault: true }), "a3");
    expect(third.ok && defaults(third.value.book)).toBe("a3");
    expect(third.ok && third.value.book.filter((a) => a.isDefault)).toHaveLength(1);
  });
  it("saves the trimmed text, with a copy of the book (the one given is not changed)", () => {
    const before: SavedAddress[] = [];
    const r = addAddress(before, input("  Rumah  ", { recipientName: " Ana " }), "a1");
    expect(r.ok && r.value.added).toMatchObject({ label: "Rumah", recipientName: "Ana", note: "" });
    expect(before).toEqual([]);
  });
  it("refuses an address that is not valid, and an eleventh one", () => {
    expect(addAddress([], input("", {}), "a1")).toEqual({ ok: false, error: "invalid" });
    expect(addAddress([], input("Rumah", { phone: "1" }), "a1")).toEqual({ ok: false, error: "invalid" });
    expect(addAddress(fill(MAX_ADDRESSES), input("Lagi"), "z")).toEqual({ ok: false, error: "tooMany" });
    expect(addAddress(fill(MAX_ADDRESSES - 1), input("Muat"), "z").ok).toBe(true);
  });
  it("checks validity before the limit, so a bad address in a full book says what is wrong with it", () => {
    expect(addAddress(fill(MAX_ADDRESSES), input("", {}), "z")).toEqual({ ok: false, error: "invalid" });
  });
});

describe("the place of an address", () => {
  it("is kept when an address is added with one, and empty when it is not", () => {
    const placed = addAddress([], input("A", { destinationId: 17536, destinationLabel: "CIPETE UTARA" }), "a1");
    expect(placed.ok && placed.value.added).toMatchObject({ destinationId: 17536, destinationLabel: "CIPETE UTARA" });
    const plain = addAddress([], input("A"), "a1");
    expect(plain.ok && plain.value.added).toMatchObject({ destinationId: null, destinationLabel: null });
  });
  it("is changed or taken away by an update that says so, and left alone by one that does not", () => {
    const book = [{ ...saved("a1", true), destinationId: 7, destinationLabel: "Lama" }];
    const changed = updateAddress(book, "a1", input("x", { destinationId: 9, destinationLabel: "Baru" }));
    expect(changed.ok && changed.value[0]).toMatchObject({ destinationId: 9, destinationLabel: "Baru" });
    const cleared = updateAddress(book, "a1", input("x", { destinationId: null, destinationLabel: null }));
    expect(cleared.ok && cleared.value[0]).toMatchObject({ destinationId: null, destinationLabel: null });
    const left = updateAddress(book, "a1", input("x"));
    expect(left.ok && left.value[0]).toMatchObject({ destinationId: 7, destinationLabel: "Lama" });
  });
});

describe("updating", () => {
  const book = [saved("a1", true), saved("a2")];
  it("changes the fields and trims them, leaving the default where it was", () => {
    const r = updateAddress(book, "a2", input("  Kantor baru ", { city: "Bandung" }));
    expect(r.ok && r.value.find((a) => a.id === "a2")).toMatchObject({ label: "Kantor baru", city: "Bandung", isDefault: false });
    expect(r.ok && defaults(r.value)).toBe("a1");
  });
  it("moves the default when asked, and never takes it away when not", () => {
    const moved = updateAddress(book, "a2", input("x", { isDefault: true }));
    expect(moved.ok && defaults(moved.value)).toBe("a2");
    const kept = updateAddress(book, "a1", input("x", { isDefault: false }));
    expect(kept.ok && defaults(kept.value)).toBe("a1");
    const untouched = updateAddress(book, "a1", input("x"));
    expect(untouched.ok && defaults(untouched.value)).toBe("a1");
  });
  it("says when the address is not there or the new text is not valid", () => {
    expect(updateAddress(book, "nope", input("x"))).toEqual({ ok: false, error: "notFound" });
    expect(updateAddress(book, "a1", input("x", { address: "" }))).toEqual({ ok: false, error: "invalid" });
  });
});

describe("removing", () => {
  it("hands the default to the most recently saved address that is left", () => {
    const r = removeAddress([saved("a1"), saved("a2"), saved("a3", true)], "a3");
    expect(r.ok && defaults(r.value)).toBe("a2");
    expect(r.ok && r.value.map((a) => a.id)).toEqual(["a1", "a2"]);
  });
  it("leaves the default alone when another address goes", () => {
    const r = removeAddress([saved("a1", true), saved("a2")], "a2");
    expect(r.ok && defaults(r.value)).toBe("a1");
  });
  it("leaves an empty book when the last one goes, and says when the address is not there", () => {
    expect(removeAddress([saved("a1", true)], "a1")).toEqual({ ok: true, value: [] });
    expect(removeAddress([saved("a1", true)], "nope")).toEqual({ ok: false, error: "notFound" });
  });
});

describe("choosing the default", () => {
  it("moves it, leaving exactly one", () => {
    const r = setDefaultAddress([saved("a1", true), saved("a2"), saved("a3")], "a3");
    expect(r.ok && defaults(r.value)).toBe("a3");
  });
  it("says when the address is not there", () => expect(setDefaultAddress([saved("a1", true)], "x")).toEqual({ ok: false, error: "notFound" }));
});

describe("how the book is shown", () => {
  it("puts the default first, then the newest", () => {
    expect(forDisplay([saved("a1"), saved("a2", true), saved("a3"), saved("a4")]).map((a) => a.id)).toEqual(["a2", "a4", "a3", "a1"]);
  });
  it("does not reorder the book it was given", () => {
    const book = [saved("a1"), saved("a2", true)];
    forDisplay(book);
    expect(book.map((a) => a.id)).toEqual(["a1", "a2"]);
  });
});
