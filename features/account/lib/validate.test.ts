// Run with `npm run test:ui`. What makes an address good enough to save: the same sizes the database holds.
import { describe, expect, it } from "vitest";
import { addressLine, cleanAddress, validateAddress } from "./validate";
import type { AddressInput } from "./types";

const good: AddressInput = { label: "Rumah", recipientName: "Ana Putri", phone: "0811000111", address: "Jl. Mawar 1", city: "Jakarta", postcode: "12345", note: "" };

describe("validateAddress", () => {
  it("accepts a complete address, with or without a courier note", () => {
    expect(validateAddress(good)).toEqual({});
    expect(validateAddress({ ...good, note: "Titip satpam" })).toEqual({});
  });
  it("asks for every required field, and treats spaces as empty", () => {
    expect(validateAddress({ ...good, label: "", recipientName: "  ", phone: "", address: " ", city: "", postcode: "" })).toEqual({
      label: "required", recipientName: "required", phone: "required", address: "required", city: "required", postcode: "required",
    });
  });
  it("says a phone number that is too short is too short, not missing", () => {
    expect(validateAddress({ ...good, phone: "1234" })).toEqual({ phone: "tooShort" });
    expect(validateAddress({ ...good, phone: "12345" })).toEqual({});
  });
  it("accepts exactly the limit and refuses one more, counted after trimming", () => {
    const edge: [keyof AddressInput, number][] = [["label", 30], ["recipientName", 120], ["phone", 30], ["address", 500], ["city", 100], ["postcode", 10], ["note", 200]];
    for (const [field, max] of edge) {
      expect(validateAddress({ ...good, [field]: "1".repeat(max) }), `${field} at the limit`).toEqual({});
      expect(validateAddress({ ...good, [field]: "1".repeat(max + 1) }), `${field} over the limit`).toEqual({ [field]: "tooLong" });
      expect(validateAddress({ ...good, [field]: `  ${"1".repeat(max)}  ` }), `${field} with spaces around`).toEqual({});
    }
  });
});

describe("cleanAddress", () => {
  it("trims every text and keeps the default flag only when it was given", () => {
    expect(cleanAddress({ label: " Rumah ", recipientName: " Ana ", phone: " 0811 ", address: " Jl ", city: " Jkt ", postcode: " 1 ", note: " x " })).toStrictEqual({ label: "Rumah", recipientName: "Ana", phone: "0811", address: "Jl", city: "Jkt", postcode: "1", note: "x" });
    expect(cleanAddress({ ...good, isDefault: false })).toHaveProperty("isDefault", false);
    expect(cleanAddress({ ...good, isDefault: true })).toHaveProperty("isDefault", true);
  });
});

describe("the place of an address", () => {
  const withPlace = (id: unknown, label: unknown) => cleanAddress({ ...good, destinationId: id as number, destinationLabel: label as string });
  it("is kept, with its name trimmed, when it is whole", () => {
    expect(withPlace(17536, " CIPETE UTARA ")).toMatchObject({ destinationId: 17536, destinationLabel: "CIPETE UTARA" });
  });
  it("is not mentioned at all when it was not given, so an update leaves it as it is", () => {
    const clean = cleanAddress(good);
    expect(clean).not.toHaveProperty("destinationId");
    expect(clean).not.toHaveProperty("destinationLabel");
  });
  it("is taken away when it is asked to be, or when it is not whole (an id without a name, a name without an id, an id that is not a positive whole number)", () => {
    for (const [id, label] of [[null, null], [5, ""], [5, "  "], [5, null], [null, "X"], [0, "X"], [-1, "X"], [1.5, "X"], ["5", "X"]]) {
      expect(withPlace(id, label), `${String(id)}/${String(label)}`).toMatchObject({ destinationId: null, destinationLabel: null });
    }
  });
  it("keeps a name of at most 200 characters", () => {
    expect(withPlace(5, "x".repeat(250)).destinationLabel).toHaveLength(200);
  });
});

describe("addressLine", () => {
  it("is street, city, postcode", () => expect(addressLine(good)).toBe("Jl. Mawar 1, Jakarta, 12345"));
});
