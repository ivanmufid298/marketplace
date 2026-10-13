// Run with `npm run test:ui`. How long ago a review was written, as a unit and a count.
import { describe, expect, it } from "vitest";
import { timeAgo } from "./relative-time";

const NOW = Date.parse("2026-10-13T12:00:00Z");
const ago = (ms: number) => timeAgo(new Date(NOW - ms).toISOString(), NOW);
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

describe("timeAgo", () => {
  it("says now for under a minute, and for a time in the future", () => {
    expect(ago(0)).toEqual({ unit: "now", n: 0 });
    expect(ago(59_999)).toEqual({ unit: "now", n: 0 });
    expect(ago(-5 * MIN)).toEqual({ unit: "now", n: 0 });
  });
  it("counts minutes up to an hour", () => {
    expect(ago(MIN)).toEqual({ unit: "minutes", n: 1 });
    expect(ago(59 * MIN + 59_999)).toEqual({ unit: "minutes", n: 59 });
  });
  it("counts hours up to a day", () => {
    expect(ago(HOUR)).toEqual({ unit: "hours", n: 1 });
    expect(ago(DAY - 1)).toEqual({ unit: "hours", n: 23 });
  });
  it("counts days up to a week", () => {
    expect(ago(DAY)).toEqual({ unit: "days", n: 1 });
    expect(ago(7 * DAY - 1)).toEqual({ unit: "days", n: 6 });
  });
  it("counts weeks up to 30 days", () => {
    expect(ago(7 * DAY)).toEqual({ unit: "weeks", n: 1 });
    expect(ago(30 * DAY - 1)).toEqual({ unit: "weeks", n: 4 });
  });
  it("counts months up to a year", () => {
    expect(ago(30 * DAY)).toEqual({ unit: "months", n: 1 });
    expect(ago(365 * DAY - 1)).toEqual({ unit: "months", n: 12 });
  });
  it("counts years", () => {
    expect(ago(365 * DAY)).toEqual({ unit: "years", n: 1 });
    expect(ago(800 * DAY)).toEqual({ unit: "years", n: 2 });
  });
  it("says now for a time that cannot be read", () => {
    expect(timeAgo("not a date", NOW)).toEqual({ unit: "now", n: 0 });
  });
});
