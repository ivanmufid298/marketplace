// Run with `npm run test:ui`. What the shop's settings and manual rates must satisfy: the limits the database holds.
import { describe, expect, it } from "vitest";
import { MAX_FEE, MAX_MARKUP, type ShippingSettings } from "./settings-types";
import { validateMethod, validateSettings } from "./settings-validate";

const good: ShippingSettings = { originId: 17549, originLabel: "KEBAYORAN LAMA SELATAN", couriers: ["jne", "sicepat"], freeShippingMin: 500000, markup: 0 };
const method = { label: "Reguler", note: "2–4 hari", fee: 18000, active: true };

describe("validateSettings", () => {
  it("accepts good settings, and ones with nothing chosen yet", () => {
    expect(validateSettings(good)).toEqual({});
    expect(validateSettings({ originId: null, originLabel: null, couriers: ["jne"], freeShippingMin: null, markup: -2000 })).toEqual({});
  });
  it("needs at least one courier, each one the provider has, with none twice", () => {
    expect(validateSettings({ ...good, couriers: [] })).toEqual({ couriers: true });
    expect(validateSettings({ ...good, couriers: ["jne", "unknown"] })).toEqual({ couriers: true });
    expect(validateSettings({ ...good, couriers: ["JNE"] })).toEqual({ couriers: true });
    expect(validateSettings({ ...good, couriers: ["jne", "jne"] })).toEqual({ couriers: true });
    expect(validateSettings({ ...good, couriers: ["jne", "sicepat", "jnt", "anteraja", "ninja", "pos", "tiki", "lion", "sap", "ide", "wahana"] })).toEqual({});
  });
  it("takes a free-shipping minimum of zero or more, or none at all", () => {
    expect(validateSettings({ ...good, freeShippingMin: 0 })).toEqual({});
    expect(validateSettings({ ...good, freeShippingMin: -1 })).toEqual({ freeShippingMin: true });
    expect(validateSettings({ ...good, freeShippingMin: 1.5 })).toEqual({ freeShippingMin: true });
    expect(validateSettings({ ...good, freeShippingMin: Number.NaN })).toEqual({ freeShippingMin: true });
  });
  it("takes a markup or a discount of up to a million, whole rupiah", () => {
    expect(validateSettings({ ...good, markup: MAX_MARKUP })).toEqual({});
    expect(validateSettings({ ...good, markup: -MAX_MARKUP })).toEqual({});
    expect(validateSettings({ ...good, markup: MAX_MARKUP + 1 })).toEqual({ markup: true });
    expect(validateSettings({ ...good, markup: -MAX_MARKUP - 1 })).toEqual({ markup: true });
    expect(validateSettings({ ...good, markup: 0.5 })).toEqual({ markup: true });
  });
  it("wants an origin whole: an id with its name, or neither", () => {
    expect(validateSettings({ ...good, originId: 5, originLabel: null })).toEqual({ origin: true });
    expect(validateSettings({ ...good, originId: null, originLabel: "X" })).toEqual({ origin: true });
    expect(validateSettings({ ...good, originId: 5, originLabel: "   " })).toEqual({ origin: true });
    expect(validateSettings({ ...good, originId: 0, originLabel: "X" })).toEqual({ origin: true });
    expect(validateSettings({ ...good, originId: 1.5, originLabel: "X" })).toEqual({ origin: true });
    expect(validateSettings({ ...good, originId: 5, originLabel: "x".repeat(200) })).toEqual({});
    expect(validateSettings({ ...good, originId: 5, originLabel: "x".repeat(201) })).toEqual({ origin: true });
  });
  it("names every problem at once", () => {
    expect(validateSettings({ originId: 5, originLabel: null, couriers: [], freeShippingMin: -1, markup: 9e9 })).toEqual({ origin: true, couriers: true, freeShippingMin: true, markup: true });
  });
});

describe("validateMethod", () => {
  it("accepts a good rate, with or without a note, and a fee of zero", () => {
    expect(validateMethod(method)).toEqual({});
    expect(validateMethod({ ...method, note: "", fee: 0 })).toEqual({});
  });
  it("needs a name of 1 to 60 characters, counted after trimming", () => {
    expect(validateMethod({ ...method, label: "   " })).toEqual({ label: true });
    expect(validateMethod({ ...method, label: "x".repeat(60) })).toEqual({});
    expect(validateMethod({ ...method, label: "x".repeat(61) })).toEqual({ label: true });
    expect(validateMethod({ ...method, label: ` ${"x".repeat(60)} ` })).toEqual({});
  });
  it("counts a note after trimming, as the database will hold it", () => {
    expect(validateMethod({ ...method, note: ` ${"x".repeat(120)} ` })).toEqual({});
  });
  it("takes a note of up to 120 characters", () => {
    expect(validateMethod({ ...method, note: "x".repeat(120) })).toEqual({});
    expect(validateMethod({ ...method, note: "x".repeat(121) })).toEqual({ note: true });
  });
  it("takes a whole fee from zero up to the most a rate can be", () => {
    expect(validateMethod({ ...method, fee: MAX_FEE })).toEqual({});
    expect(validateMethod({ ...method, fee: MAX_FEE + 1 })).toEqual({ fee: true });
    expect(validateMethod({ ...method, fee: -1 })).toEqual({ fee: true });
    expect(validateMethod({ ...method, fee: 1.5 })).toEqual({ fee: true });
    expect(validateMethod({ ...method, fee: Number.NaN })).toEqual({ fee: true });
  });
});
