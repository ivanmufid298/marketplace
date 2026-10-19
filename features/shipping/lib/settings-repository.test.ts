// Run with `npm run test:ui`. What the shop's settings ask the database for and what they make of the answers. Who may change them is
// decided by the database and covered by the SQL tests.
import { describe, expect, it } from "vitest";
import { createSettingsRepository, mapSettingsError, toMethod, toSettings, type SettingsDb } from "./settings-repository";

type Answer = { data?: unknown; error?: { code?: string; message?: string } | null };
function fake(answer: Answer) {
  const queries: { table: string; ops: [string, unknown[]][] }[] = [];
  const db = {
    from: (table: string) => {
      const query = { table, ops: [] as [string, unknown[]][] };
      queries.push(query);
      const chain: unknown = new Proxy({}, {
        get(_t, prop) {
          if (prop === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve({ data: answer.data ?? null, error: answer.error ?? null }).then(resolve);
          return (...args: unknown[]) => { query.ops.push([String(prop), args]); return chain; };
        },
      });
      return chain;
    },
  };
  return { db: db as unknown as SettingsDb, queries };
}
const opsOf = (q: { ops: [string, unknown[]][] }, name: string) => q.ops.filter(([o]) => o === name).map(([, a]) => a);
const row = (over: Record<string, unknown> = {}) => ({ origin_destination_id: 17549, origin_label: "KEBAYORAN LAMA SELATAN", couriers: ["jne", "sicepat"], free_shipping_min: 500000, shipping_markup: 2000, ...over });
const settings = { originId: 17549, originLabel: "KEBAYORAN LAMA SELATAN", couriers: ["jne", "ninja"], freeShippingMin: 500000, markup: -1500 };

describe("toSettings", () => {
  it("maps a row", () => expect(toSettings(row())).toStrictEqual({ originId: 17549, originLabel: "KEBAYORAN LAMA SELATAN", couriers: ["jne", "sicepat"], freeShippingMin: 500000, markup: 2000 }));
  it("is nothing chosen yet for an empty row, with the usual couriers", () => {
    expect(toSettings({ origin_destination_id: null, origin_label: null, couriers: null, free_shipping_min: null, shipping_markup: null })).toStrictEqual({ originId: null, originLabel: null, couriers: ["jne", "sicepat", "jnt", "anteraja"], freeShippingMin: null, markup: 0 });
  });
  it("has no origin when it is not whole, and drops couriers it does not know", () => {
    expect(toSettings(row({ origin_label: null }))).toMatchObject({ originId: null, originLabel: null });
    expect(toSettings(row({ origin_destination_id: null }))).toMatchObject({ originId: null, originLabel: null });
    expect(toSettings(row({ couriers: ["jne", "mystery"] })).couriers).toEqual(["jne"]);
    expect(toSettings(row({ couriers: ["mystery"] })).couriers).toEqual(["jne", "sicepat", "jnt", "anteraja"]);
  });
  it("reads numbers that came as text", () => expect(toSettings(row({ origin_destination_id: "17549", free_shipping_min: "500000", shipping_markup: "-2000" }))).toMatchObject({ originId: 17549, freeShippingMin: 500000, markup: -2000 }));
});

describe("toMethod", () => {
  it("maps a row, with an empty note when there is none", () => {
    expect(toMethod({ code: "regular", label: "Reguler", note: "2–4 hari", fee: 18000, is_active: true })).toStrictEqual({ code: "regular", label: "Reguler", note: "2–4 hari", fee: 18000, active: true });
    expect(toMethod({ code: "x", label: "X", note: null, fee: 1, is_active: false })).toMatchObject({ note: "", active: false });
  });
});

describe("mapSettingsError", () => {
  it("names each reason", () => {
    expect(mapSettingsError({ code: "23514", message: "x" })).toBe("invalid");
    expect(mapSettingsError({ message: 'violates check constraint "x"' })).toBe("invalid");
    expect(mapSettingsError({ code: "42501", message: "x" })).toBe("forbidden");
    expect(mapSettingsError({ message: "row-level security" })).toBe("forbidden");
    expect(mapSettingsError({ message: "Failed to fetch" })).toBe("network");
    expect(mapSettingsError({ code: "500", message: "network trouble" })).toBe("unknown");
    expect(mapSettingsError(null)).toBe("unknown");
  });
});

describe("reading", () => {
  it("asks for the one row and maps it", async () => {
    const q = fake({ data: row() });
    expect(await createSettingsRepository(q.db).get()).toEqual({ ok: true, value: toSettings(row()) });
    expect(q.queries[0].table).toBe("shop_settings");
    expect(opsOf(q.queries[0], "eq")).toEqual([["id", 1]]);
  });
  it("is nothing chosen yet when the row is missing, and reports an error", async () => {
    const empty = await createSettingsRepository(fake({ data: null }).db).get();
    expect(empty.ok && empty.value.originId).toBeNull();
    expect(await createSettingsRepository(fake({ error: { message: "Failed to fetch" } }).db).get()).toEqual({ ok: false, error: "network" });
  });
  it("lists the manual rates in order", async () => {
    const q = fake({ data: [{ code: "regular", label: "Reguler", note: "", fee: 18000, is_active: true }, { code: "express", label: "Express", note: null, fee: 32000, is_active: false }] });
    const result = await createSettingsRepository(q.db).listMethods();
    expect(result.ok && result.value.map((m) => [m.code, m.active])).toEqual([["regular", true], ["express", false]]);
    expect(q.queries[0].table).toBe("shipping_methods");
    expect(opsOf(q.queries[0], "order")).toEqual([["sort_order", { ascending: true }], ["code", { ascending: true }]]);
  });
});

describe("saving", () => {
  it("updates the one row with every setting, and takes the origin's name away with its id", async () => {
    const q = fake({ data: [{ id: 1 }] });
    expect(await createSettingsRepository(q.db).save(settings)).toEqual({ ok: true, value: null });
    expect(opsOf(q.queries[0], "update")).toEqual([[{ origin_destination_id: 17549, origin_label: "KEBAYORAN LAMA SELATAN", couriers: ["jne", "ninja"], free_shipping_min: 500000, shipping_markup: -1500 }]]);
    expect(opsOf(q.queries[0], "eq")).toEqual([["id", 1]]);
    const cleared = fake({ data: [{ id: 1 }] });
    await createSettingsRepository(cleared.db).save({ ...settings, originId: null, originLabel: "stale name", freeShippingMin: null });
    expect(opsOf(cleared.queries[0], "update")[0][0]).toMatchObject({ origin_destination_id: null, origin_label: null, free_shipping_min: null });
  });
  it("says it was refused when nothing was changed, since security rules hide rows without an error", async () => {
    expect(await createSettingsRepository(fake({ data: [] }).db).save(settings)).toEqual({ ok: false, error: "forbidden" });
    expect(await createSettingsRepository(fake({ data: null }).db).save(settings)).toEqual({ ok: false, error: "forbidden" });
  });
  it("reports the database's reason", async () => {
    expect(await createSettingsRepository(fake({ error: { code: "23514", message: "check" } }).db).save(settings)).toEqual({ ok: false, error: "invalid" });
  });
  it("updates a manual rate by its code, trimmed", async () => {
    const q = fake({ data: [{ code: "regular" }] });
    expect(await createSettingsRepository(q.db).updateMethod("regular", { label: " Reguler ", note: " 2–4 hari ", fee: 20000, active: false })).toEqual({ ok: true, value: null });
    expect(opsOf(q.queries[0], "update")).toEqual([[{ label: "Reguler", note: "2–4 hari", fee: 20000, is_active: false }]]);
    expect(opsOf(q.queries[0], "eq")).toEqual([["code", "regular"]]);
    expect(await createSettingsRepository(fake({ data: [] }).db).updateMethod("x", { label: "X", note: "", fee: 1, active: true })).toEqual({ ok: false, error: "forbidden" });
    expect(await createSettingsRepository(fake({ error: { code: "42501", message: "denied" } }).db).updateMethod("x", { label: "X", note: "", fee: 1, active: true })).toEqual({ ok: false, error: "forbidden" });
  });
});
