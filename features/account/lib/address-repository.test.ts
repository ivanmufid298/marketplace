// Run with `npm run test:ui`. What the address book asks the database for and what it makes of the answers. Who may read or
// change which address, the default, and the limit are decided by the database and covered by the SQL tests.
import { describe, expect, it } from "vitest";
import { createAddressRepository, mapAddressError, toSavedAddress, type AddressesDb } from "./address-repository";
import type { AddressInput } from "./types";

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
  return { db: db as unknown as AddressesDb, queries };
}
const opsOf = (q: { ops: [string, unknown[]][] }, name: string) => q.ops.filter(([o]) => o === name).map(([, a]) => a);
const row = (over: Record<string, unknown> = {}) => ({ id: "a-1", label: "Rumah", recipient_name: "Ana", phone: "0811000111", address: "Jl. Mawar 1", city: "Jakarta", postcode: "12345", note: "", is_default: true, ...over });
const input = (over: Partial<AddressInput> = {}): AddressInput => ({ label: " Rumah ", recipientName: " Ana ", phone: "0811000111", address: "Jl. Mawar 1", city: "Jakarta", postcode: "12345", note: "", ...over });

describe("toSavedAddress", () => {
  it("maps a row to the app's address", () => {
    expect(toSavedAddress(row())).toStrictEqual({ id: "a-1", label: "Rumah", recipientName: "Ana", phone: "0811000111", address: "Jl. Mawar 1", city: "Jakarta", postcode: "12345", note: "", isDefault: true, destinationId: null, destinationLabel: null });
  });
  it("carries the place the address was found under, and has none for an address filled in by hand", () => {
    expect(toSavedAddress(row({ destination_id: 17536, destination_label: "CIPETE UTARA" }))).toMatchObject({ destinationId: 17536, destinationLabel: "CIPETE UTARA" });
    expect(toSavedAddress(row({ destination_id: null, destination_label: null }))).toMatchObject({ destinationId: null, destinationLabel: null });
  });
  it("turns a missing note into an empty one", () => expect(toSavedAddress(row({ note: null })).note).toBe(""));
});

describe("mapAddressError", () => {
  it("names each reason", () => {
    expect(mapAddressError({ message: "too_many_addresses", code: "P0001" })).toBe("tooMany");
    expect(mapAddressError({ code: "23514", message: "new row violates check constraint" })).toBe("invalid");
    expect(mapAddressError({ message: 'new row for relation "addresses" violates check constraint "addresses_phone_check"' })).toBe("invalid");
    expect(mapAddressError({ code: "42501", message: "x" })).toBe("forbidden");
    expect(mapAddressError({ message: "new row violates row-level security policy" })).toBe("forbidden");
    expect(mapAddressError({ message: "Failed to fetch" })).toBe("network");
    expect(mapAddressError({ code: "XX000", message: "boom" })).toBe("unknown");
    expect(mapAddressError(null)).toBe("unknown");
    expect(mapAddressError(undefined)).toBe("unknown");
  });
  it("calls a failure with a code unknown even if it sounds like the network", () => expect(mapAddressError({ code: "500", message: "network trouble" })).toBe("unknown"));
});

describe("listing", () => {
  it("asks for the default first and then the newest, and maps the rows", async () => {
    const q = fake({ data: [row(), row({ id: "a-2", is_default: false, label: "Kantor" })] });
    const result = await createAddressRepository(q.db).list();
    expect(q.queries[0].table).toBe("addresses");
    expect(opsOf(q.queries[0], "order")).toEqual([["is_default", { ascending: false }], ["created_at", { ascending: false }], ["id", { ascending: false }]]);
    expect(result.ok && result.value.map((a) => a.id)).toEqual(["a-1", "a-2"]);
    expect(String(opsOf(q.queries[0], "select")[0][0])).toContain("recipient_name");
  });
  it("is an empty book when there is nothing, and reports an error", async () => {
    expect(await createAddressRepository(fake({ data: null }).db).list()).toEqual({ ok: true, value: [] });
    expect(await createAddressRepository(fake({ error: { message: "Failed to fetch" } }).db).list()).toEqual({ ok: false, error: "network" });
  });
});

describe("adding", () => {
  it("sends the trimmed fields without the owner, and returns the saved address", async () => {
    const q = fake({ data: row() });
    const result = await createAddressRepository(q.db).add(input());
    expect(opsOf(q.queries[0], "insert")).toEqual([[{ label: "Rumah", recipient_name: "Ana", phone: "0811000111", address: "Jl. Mawar 1", city: "Jakarta", postcode: "12345", note: "" }]]);
    expect(opsOf(q.queries[0], "single")).toHaveLength(1);
    expect(result).toMatchObject({ ok: true, value: { id: "a-1", label: "Rumah" } });
  });
  it("sends the place with the address when there is one, and nothing about it when there is not", async () => {
    const withPlace = fake({ data: row() });
    await createAddressRepository(withPlace.db).add(input({ destinationId: 17536, destinationLabel: " CIPETE UTARA " }));
    expect(opsOf(withPlace.queries[0], "insert")[0][0]).toMatchObject({ destination_id: 17536, destination_label: "CIPETE UTARA" });
    const without = fake({ data: row() });
    await createAddressRepository(without.db).add(input());
    expect(opsOf(without.queries[0], "insert")[0][0]).not.toHaveProperty("destination_id");
    expect(opsOf(without.queries[0], "insert")[0][0]).not.toHaveProperty("destination_label");
  });
  it("asks for the default only when it was asked for", async () => {
    const asked = fake({ data: row() });
    await createAddressRepository(asked.db).add(input({ isDefault: true }));
    expect((opsOf(asked.queries[0], "insert")[0][0] as Record<string, unknown>).is_default).toBe(true);
    const notAsked = fake({ data: row() });
    await createAddressRepository(notAsked.db).add(input({ isDefault: false }));
    expect(opsOf(notAsked.queries[0], "insert")[0][0]).not.toHaveProperty("is_default");
  });
  it("reports the limit and an invalid address from the database", async () => {
    expect(await createAddressRepository(fake({ error: { code: "P0001", message: "too_many_addresses" } }).db).add(input())).toEqual({ ok: false, error: "tooMany" });
    expect(await createAddressRepository(fake({ error: { code: "23514", message: "check" } }).db).add(input())).toEqual({ ok: false, error: "invalid" });
    expect(await createAddressRepository(fake({ data: null }).db).add(input())).toEqual({ ok: false, error: "unknown" });
  });
});

describe("changing", () => {
  it("updates one address by id, with the default only when asked", async () => {
    const plain = fake({ data: [{ id: "a-1" }] });
    expect(await createAddressRepository(plain.db).update("a-1", input())).toEqual({ ok: true, value: null });
    expect(opsOf(plain.queries[0], "eq")).toEqual([["id", "a-1"]]);
    expect(opsOf(plain.queries[0], "update")[0][0]).not.toHaveProperty("is_default");
    const asked = fake({ data: [{ id: "a-1" }] });
    await createAddressRepository(asked.db).update("a-1", input({ isDefault: true }));
    expect((opsOf(asked.queries[0], "update")[0][0] as Record<string, unknown>).is_default).toBe(true);
  });
  it("changes the place of an address, takes it away on request, and leaves it alone when it is not mentioned", async () => {
    const set = fake({ data: [{ id: "a-1" }] });
    await createAddressRepository(set.db).update("a-1", input({ destinationId: 5, destinationLabel: "X, Y" }));
    expect(opsOf(set.queries[0], "update")[0][0]).toMatchObject({ destination_id: 5, destination_label: "X, Y" });
    const cleared = fake({ data: [{ id: "a-1" }] });
    await createAddressRepository(cleared.db).update("a-1", input({ destinationId: null, destinationLabel: null }));
    expect(opsOf(cleared.queries[0], "update")[0][0]).toMatchObject({ destination_id: null, destination_label: null });
    const left = fake({ data: [{ id: "a-1" }] });
    await createAddressRepository(left.db).update("a-1", input());
    expect(opsOf(left.queries[0], "update")[0][0]).not.toHaveProperty("destination_id");
  });
  it("chooses the default by setting only that flag", async () => {
    const q = fake({ data: [{ id: "a-2" }] });
    expect(await createAddressRepository(q.db).setDefault("a-2")).toEqual({ ok: true, value: null });
    expect(opsOf(q.queries[0], "update")).toEqual([[{ is_default: true }]]);
    expect(opsOf(q.queries[0], "eq")).toEqual([["id", "a-2"]]);
  });
  it("deletes one address by id", async () => {
    const q = fake({ data: [{ id: "a-2" }] });
    expect(await createAddressRepository(q.db).remove("a-2")).toEqual({ ok: true, value: null });
    expect(opsOf(q.queries[0], "delete")).toHaveLength(1);
    expect(opsOf(q.queries[0], "eq")).toEqual([["id", "a-2"]]);
  });
  it("says not found when nothing was changed, since security rules hide rows without an error", async () => {
    for (const run of [(r: ReturnType<typeof createAddressRepository>) => r.update("x", input()), (r: ReturnType<typeof createAddressRepository>) => r.remove("x"), (r: ReturnType<typeof createAddressRepository>) => r.setDefault("x")]) {
      expect(await run(createAddressRepository(fake({ data: [] }).db))).toEqual({ ok: false, error: "notFound" });
      expect(await run(createAddressRepository(fake({ data: null }).db))).toEqual({ ok: false, error: "notFound" });
    }
  });
  it("reports a database error for each change", async () => {
    const err = { error: { code: "42501", message: "permission denied" } };
    expect(await createAddressRepository(fake(err).db).update("x", input())).toEqual({ ok: false, error: "forbidden" });
    expect(await createAddressRepository(fake(err).db).remove("x")).toEqual({ ok: false, error: "forbidden" });
    expect(await createAddressRepository(fake(err).db).setDefault("x")).toEqual({ ok: false, error: "forbidden" });
  });
});
