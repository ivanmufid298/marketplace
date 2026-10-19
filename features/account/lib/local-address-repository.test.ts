// Run with `npm run test:ui`. The demo's address book: kept per account in this browser, following the book's rules.
import { beforeEach, describe, expect, it } from "vitest";
import { createLocalAddressRepository, LOCAL_ADDRESSES_PREFIX } from "./local-address-repository";
import type { AddressInput } from "./types";

const input = (label: string, over: Partial<AddressInput> = {}): AddressInput => ({ label, recipientName: "Ana", phone: "0811000111", address: "Jl. Mawar 1", city: "Jakarta", postcode: "12345", note: "", ...over });
const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };
let n = 0;
const ids = () => `id-${++n}`;
beforeEach(() => { n = 0; });

describe("the demo address book", () => {
  it("starts empty, adds addresses, and lists the default first and then the newest", async () => {
    const repo = createLocalAddressRepository("ana", memory(), ids);
    expect(await repo.list()).toEqual({ ok: true, value: [] });
    await repo.add(input("Rumah"));
    await repo.add(input("Kantor"));
    await repo.add(input("Kos"));
    const list = await repo.list();
    expect(list.ok && list.value.map((a) => `${a.label}${a.isDefault ? "*" : ""}`)).toEqual(["Rumah*", "Kos", "Kantor"]);
  });
  it("returns the address it saved", async () => {
    const repo = createLocalAddressRepository("ana", memory(), ids);
    const r = await repo.add(input("Rumah"));
    expect(r).toMatchObject({ ok: true, value: { id: "id-1", label: "Rumah", isDefault: true } });
  });
  it("keeps each account's book apart, under the account's own key", async () => {
    const store = memory();
    await createLocalAddressRepository("ana", store, ids).add(input("Rumah"));
    const bima = await createLocalAddressRepository("bima", store, ids).list();
    expect(bima).toEqual({ ok: true, value: [] });
    expect([...store.m.keys()]).toEqual([LOCAL_ADDRESSES_PREFIX + "ana"]);
  });
  it("is still there for the same account in a new repository (it survives a reload)", async () => {
    const store = memory();
    await createLocalAddressRepository("ana", store, ids).add(input("Rumah"));
    const again = await createLocalAddressRepository("ana", store, ids).list();
    expect(again.ok && again.value).toHaveLength(1);
  });
  it("updates, moves the default, and removes, following the book's rules", async () => {
    const repo = createLocalAddressRepository("ana", memory(), ids);
    await repo.add(input("Rumah"));
    await repo.add(input("Kantor"));
    expect(await repo.update("id-2", input("Kantor baru", { city: "Bandung" }))).toEqual({ ok: true, value: null });
    expect(await repo.setDefault("id-2")).toEqual({ ok: true, value: null });
    let list = await repo.list();
    expect(list.ok && list.value[0]).toMatchObject({ label: "Kantor baru", city: "Bandung", isDefault: true });
    expect(await repo.remove("id-2")).toEqual({ ok: true, value: null });
    list = await repo.list();
    expect(list.ok && list.value).toMatchObject([{ id: "id-1", isDefault: true }]);
  });
  it("answers the book's errors: invalid, too many, not found", async () => {
    const repo = createLocalAddressRepository("ana", memory(), ids);
    expect(await repo.add(input(""))).toEqual({ ok: false, error: "invalid" });
    expect(await repo.update("nope", input("x"))).toEqual({ ok: false, error: "notFound" });
    expect(await repo.remove("nope")).toEqual({ ok: false, error: "notFound" });
    expect(await repo.setDefault("nope")).toEqual({ ok: false, error: "notFound" });
    for (let i = 0; i < 10; i++) await repo.add(input(`A${i}`));
    expect(await repo.add(input("Lagi"))).toEqual({ ok: false, error: "tooMany" });
  });
  it("keeps an address's place, and gives one saved before places existed none", async () => {
    const store = memory();
    const repo = createLocalAddressRepository("ana", store, ids);
    await repo.add(input("Tujuan", { destinationId: 17536, destinationLabel: "CIPETE UTARA" }));
    store.setItem(LOCAL_ADDRESSES_PREFIX + "ana", JSON.stringify([...JSON.parse(store.getItem(LOCAL_ADDRESSES_PREFIX + "ana") ?? "[]"), { id: "old", label: "Lama", recipientName: "A", phone: "12345", address: "Jl", city: "J", postcode: "1", note: "", isDefault: false }]));
    const list = await repo.list();
    expect(list.ok && list.value.map((a) => [a.label, a.destinationId, a.destinationLabel])).toEqual([["Tujuan", 17536, "CIPETE UTARA"], ["Lama", null, null]]);
  });
  it("ignores half a place that was stored (an id with no name)", async () => {
    const store = memory();
    store.setItem(LOCAL_ADDRESSES_PREFIX + "ana", JSON.stringify([{ id: "x", label: "L", recipientName: "A", phone: "12345", address: "Jl", city: "J", postcode: "1", note: "", isDefault: true, destinationId: 5, destinationLabel: "" }]));
    const list = await createLocalAddressRepository("ana", store, ids).list();
    expect(list.ok && list.value[0]).toMatchObject({ destinationId: null, destinationLabel: null });
  });
  it("starts empty when what is stored is damaged, and ignores entries that are not addresses", async () => {
    const store = memory();
    store.setItem(LOCAL_ADDRESSES_PREFIX + "ana", "{not json");
    expect(await createLocalAddressRepository("ana", store, ids).list()).toEqual({ ok: true, value: [] });
    store.setItem(LOCAL_ADDRESSES_PREFIX + "ana", JSON.stringify([{ id: 1 }, "x", null, { id: "a", label: "L", recipientName: "R", phone: "12345", address: "A", city: "C", postcode: "1", note: "", isDefault: true }]));
    const list = await createLocalAddressRepository("ana", store, ids).list();
    expect(list.ok && list.value.map((a) => a.id)).toEqual(["a"]);
    store.setItem(LOCAL_ADDRESSES_PREFIX + "ana", JSON.stringify({ not: "a list" }));
    expect(await createLocalAddressRepository("ana", store, ids).list()).toEqual({ ok: true, value: [] });
  });
  it("says it could not save when the browser's storage refuses", async () => {
    const blocked = { getItem: () => null, setItem: () => { throw new Error("full"); } };
    const repo = createLocalAddressRepository("ana", blocked, ids);
    expect(await repo.add(input("Rumah"))).toEqual({ ok: false, error: "unknown" });
    expect(await repo.setDefault("x")).toEqual({ ok: false, error: "notFound" });
  });
});
