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

describe("addressLine", () => {
  it("is street, city, postcode", () => expect(addressLine(good)).toBe("Jl. Mawar 1, Jakarta, 12345"));
});
