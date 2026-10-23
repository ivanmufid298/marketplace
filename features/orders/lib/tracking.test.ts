// Run with `npm run test:ui`. What counts as a tracking number (nomor resi): the same rule the database enforces.
import { describe, expect, it } from "vitest";
import { cleanTracking, TRACKING_PATTERN } from "./tracking";

describe("cleanTracking", () => {
  it.each([
    ["JP1234567890", "JP1234567890"],
    ["  JP1234567890\n", "JP1234567890"],
    ["jp1234567890", "jp1234567890"],
    ["0012-3456-7890", "0012-3456-7890"],
    ["AB123", "AB123"],
    ["A".repeat(40), "A".repeat(40)],
  ])("keeps %j as %j", (given, kept) => expect(cleanTracking(given)).toBe(kept));
  it.each(["", "   ", "AB12", "A".repeat(41), "JP 1234567890", "JP1234567890!", "JP.123456789", "JP_123456789", "JP12345é678", "JP\n12345678"])("refuses %j", (given) => expect(cleanTracking(given)).toBeNull());
  it("is anchored: a good number inside bad text is not enough", () => {
    expect(TRACKING_PATTERN.test("!!JP1234567890")).toBe(false);
    expect(TRACKING_PATTERN.test("JP1234567890!!")).toBe(false);
  });
});
