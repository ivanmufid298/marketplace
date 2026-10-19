// Run with `npm run test:ui`. Reading an amount of rupiah as a person types it.
import { describe, expect, it } from "vitest";
import { groupRupiah, parseRupiah } from "./rupiah";

describe("parseRupiah", () => {
  it("reads plain digits and the dots people group them with", () => {
    expect(parseRupiah("18000")).toBe(18000);
    expect(parseRupiah("18.000")).toBe(18000);
    expect(parseRupiah("1.250.000")).toBe(1250000);
    expect(parseRupiah("0")).toBe(0);
  });
  it("drops spaces and an Rp in front, in either case", () => {
    expect(parseRupiah("Rp 18.000")).toBe(18000);
    expect(parseRupiah(" rp18000 ")).toBe(18000);
    expect(parseRupiah("2 000")).toBe(2000);
  });
  it("is null for anything that is not a whole number: empty, letters, a comma, a decimal point that is really a thousands dot is fine but a comma is not", () => {
    for (const bad of ["", "  ", "Rp", "abc", "18,5", "18,000", "1e3", "--5", "5-", "+5"]) expect(parseRupiah(bad), bad).toBeNull();
  });
  it("is null for a minus unless negative amounts are allowed", () => {
    expect(parseRupiah("-2000")).toBeNull();
    expect(parseRupiah("-2.000", { allowNegative: true })).toBe(-2000);
    expect(parseRupiah("2.000", { allowNegative: true })).toBe(2000);
    expect(parseRupiah("-", { allowNegative: true })).toBeNull();
  });
  it("is null for a number too big to be exact", () => expect(parseRupiah("9".repeat(20))).toBeNull());
});

describe("groupRupiah", () => {
  it("groups digits with dots, the Indonesian way", () => {
    expect(groupRupiah(18000)).toBe("18.000");
    expect(groupRupiah(1250000)).toBe("1.250.000");
    expect(groupRupiah(0)).toBe("0");
  });
});
