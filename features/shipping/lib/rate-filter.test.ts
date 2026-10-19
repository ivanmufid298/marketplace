// Run with `npm run test:ui`. Which services a buyer is offered and what they cost: freight and frozen goods are left out, the shop's markup
// and free shipping are applied, and the list is cheapest first.
import { describe, expect, it } from "vitest";
import { isParcelService, MAX_OPTIONS, priceOptions } from "./rate-filter";
import type { ProviderRate } from "./types";

const rate = (courier: string, service: string, fee: number, over: Partial<ProviderRate> = {}): ProviderRate => ({ courier, courierName: courier.toUpperCase(), service, description: `${service} layanan`, fee, etd: "1-2 day", ...over });

describe("isParcelService", () => {
  it("accepts ordinary parcel services", () => {
    for (const [service, description] of [["REG", "Reguler"], ["BEST", "Besok Sampai Tujuan"], ["HALU", "Harga Mulai Lima Ribu"], ["CTC", "JNE City Courier"], ["ND", "Anteraja Next Day"], ["SD", "Anteraja Same Day"], ["EZ", "Reguler"]]) {
      expect(isParcelService({ service, description }), service).toBe(true);
    }
  });
  it("leaves out freight, trucking, frozen goods, and documents, by code and by what the description says", () => {
    for (const [service, description] of [["GOKIL", "Cargo Per Kg (Minimal 10kg)"], ["MIC", "Anteraja Mini Cargo"], ["BIG", "Anteraja Cargo"], ["ICE", "Anteraja Frozen"], ["DOK", "Anteraja Document"], ["JTR", "JNE Trucking"], ["JTR<130", "JNE Trucking"], ["JTR>130", "JNE Trucking"], ["JTR>200", "JNE Trucking"], ["XYZ", "Some Cargo Service"], ["ABC", "Frozen food"], ["QQ", "Dokumen"], ["ZZ", "Air freight"]]) {
      expect(isParcelService({ service, description }), service).toBe(false);
    }
  });
  it("reads the service code in any case, with spaces around it", () => {
    expect(isParcelService({ service: " gokil ", description: "x" })).toBe(false);
    expect(isParcelService({ service: "jtr<130", description: "x" })).toBe(false);
  });
  it("does not take a service for freight just because its code contains letters of a blocked one", () => {
    expect(isParcelService({ service: "BIGBOX", description: "Reguler" })).toBe(true);
    expect(isParcelService({ service: "DOKU", description: "Reguler" })).toBe(true);
  });
});

describe("priceOptions", () => {
  const rates = [rate("jne", "CTC", 10000), rate("sicepat", "REG", 8000), rate("anteraja", "ECO", 7100), rate("jne", "JTR", 40000, { description: "JNE Trucking" }), rate("anteraja", "ICE", 22000, { description: "Anteraja Frozen" })];
  const list = (o: ReturnType<typeof priceOptions>) => o.map((x) => `${x.courier}:${x.service}:${x.fee}`);

  it("keeps the parcel services only, cheapest first, at what the courier asks when there is no markup", () => {
    expect(list(priceOptions(rates, { markup: 0, freeShipping: false }))).toEqual(["anteraja:ECO:7100", "sicepat:REG:8000", "jne:CTC:10000"]);
  });
  it("remembers what the courier asked, apart from what the buyer pays", () => {
    const [first] = priceOptions(rates, { markup: 2000, freeShipping: false });
    expect(first).toMatchObject({ fee: 9100, courierFee: 7100 });
  });
  it("adds the shop's markup to every service", () => {
    expect(list(priceOptions(rates, { markup: 2000, freeShipping: false }))).toEqual(["anteraja:ECO:9100", "sicepat:REG:10000", "jne:CTC:12000"]);
  });
  it("takes a discount off every service, never below zero", () => {
    expect(list(priceOptions(rates, { markup: -7500, freeShipping: false }))).toEqual(["anteraja:ECO:0", "sicepat:REG:500", "jne:CTC:2500"]);
    expect(list(priceOptions(rates, { markup: -999999, freeShipping: false })).every((x) => x.endsWith(":0"))).toBe(true);
  });
  it("makes the cheapest service free when shipping is free, and charges each other one only the difference", () => {
    expect(list(priceOptions(rates, { markup: 0, freeShipping: true }))).toEqual(["anteraja:ECO:0", "sicepat:REG:900", "jne:CTC:2900"]);
  });
  it("works the difference out after the markup", () => {
    expect(list(priceOptions(rates, { markup: 1000, freeShipping: true }))).toEqual(["anteraja:ECO:0", "sicepat:REG:900", "jne:CTC:2900"]);
    // A discount that already makes the two cheapest free leaves nothing more to take off.
    expect(list(priceOptions(rates, { markup: -9000, freeShipping: true }))).toEqual(["anteraja:ECO:0", "sicepat:REG:0", "jne:CTC:1000"]);
  });
  it("is an empty list when the provider has no parcel service, with or without free shipping", () => {
    expect(priceOptions([], { markup: 0, freeShipping: false })).toEqual([]);
    expect(priceOptions([], { markup: 0, freeShipping: true })).toEqual([]);
    expect(priceOptions([rate("jne", "JTR", 40000, { description: "Trucking" })], { markup: 0, freeShipping: true })).toEqual([]);
  });
  it("keeps the same service once, at its lower price, whatever the case of its code", () => {
    const twice = [rate("jne", "reg", 12000), rate("jne", "REG", 9000), rate("sicepat", "REG", 9500)];
    expect(list(priceOptions(twice, { markup: 0, freeShipping: false }))).toEqual(["jne:REG:9000", "sicepat:REG:9500"]);
  });
  it("breaks a tie by what the courier asked, then by name and service, so the order never changes", () => {
    const tied = [rate("sicepat", "REG", 8000, { courierName: "SiCepat" }), rate("jne", "REG", 8000, { courierName: "JNE" }), rate("jne", "BEST", 8000, { courierName: "JNE" })];
    expect(list(priceOptions(tied, { markup: 0, freeShipping: false }))).toEqual(["jne:BEST:8000", "jne:REG:8000", "sicepat:REG:8000"]);
    // Both cost the buyer nothing; the one the courier asked less for comes first, even though its name sorts later.
    const byAsked = [rate("a", "X", 5000, { courierName: "Zeta" }), rate("b", "Y", 7000, { courierName: "Alfa" })];
    expect(list(priceOptions(byAsked, { markup: -9000, freeShipping: false }))).toEqual(["a:X:0", "b:Y:0"]);
    expect(list(priceOptions([...byAsked].reverse(), { markup: -9000, freeShipping: false }))).toEqual(["a:X:0", "b:Y:0"]);
  });
  it("offers at most ten services, the cheapest", () => {
    const many = Array.from({ length: 15 }, (_, i) => rate("jne", `S${i}`, 1000 + i * 100));
    const out = priceOptions(many, { markup: 0, freeShipping: false });
    expect(out).toHaveLength(MAX_OPTIONS);
    expect(out[0].fee).toBe(1000);
    expect(out[9].fee).toBe(1900);
  });
  it("does not change the list it was given", () => {
    const copy = JSON.parse(JSON.stringify(rates));
    priceOptions(rates, { markup: 500, freeShipping: true });
    expect(rates).toEqual(copy);
  });
});
