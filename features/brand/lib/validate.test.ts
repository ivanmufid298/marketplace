// Run with `npm run test:ui`. What counts as a shop name: the same rule the database enforces.
import { describe, expect, it } from "vitest";
import { cleanName } from "./validate";

describe("cleanName", () => {
  it.each([
    ["Kith Store", "Kith Store"],
    ["  Kith  ", "Kith"],
    ["K", "K"],
    ["Toko Kith's Café ☕", "Toko Kith's Café ☕"],
    ["a".repeat(60), "a".repeat(60)],
    ["\tKith\n", "Kith"],
  ])("keeps %j as %j", (given, kept) => expect(cleanName(given)).toBe(kept));
  it.each(["", "   ", "\n\t", "a".repeat(61), `  ${"a".repeat(61)}  `])("refuses %j", (given) => expect(cleanName(given)).toBeNull());
  it("counts characters as people do, not as the text is stored: 60 pictures are 60 characters", () => {
    expect(cleanName("😀".repeat(60))).toBe("😀".repeat(60));
    expect(cleanName("😀".repeat(61))).toBeNull();
  });
});
