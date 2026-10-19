// Run with `npm run test:ui`. How a courier's estimate is worded for the buyer.
import { describe, expect, it } from "vitest";
import { etdText } from "./etd";

describe("etdText", () => {
  it.each([
    ["1-2 day", "1-2 hari"],
    ["3 days", "3 hari"],
    ["1 - 2 days", "1-2 hari"],
    ["2", "2 hari"],
    ["10-14 hari", "10-14 hari"],
  ])("words %j as %j", (given, shown) => expect(etdText(given)).toBe(shown));
  it.each(["", "   ", "same day", "-"])("shows nothing for %j, rather than guessing", (given) => expect(etdText(given)).toBe(""));
});
