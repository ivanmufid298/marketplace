// Run with `npm run test:ui`. The buyer's address book as the app reads and changes it: in the database (a fake) and, in
// the demo, in this browser.
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { AuthProvider, useAuth } from "@/features/auth";
import { AddressesProvider, useAddresses } from "./addresses-provider";
import type { AddressInput, AddressRepository, AddressServices, SavedAddress } from "./lib/types";

const SESSION_KEY = "marketplace-demo-session-v1";
const NADIA = { id: "nadia", email: "nadia@demo.test", name: "Nadia Putri" };
const saved = (id: string, over: Partial<SavedAddress> = {}): SavedAddress => ({ id, label: id, recipientName: "Ana", phone: "0811000111", address: "Jl", city: "Jkt", postcode: "1", note: "", isDefault: false, destinationId: null, destinationLabel: null, ...over });
const input = (label = "Rumah"): AddressInput => ({ label, recipientName: "Ana", phone: "0811000111", address: "Jl. Mawar 1", city: "Jakarta", postcode: "12345", note: "" });

function fakeRepo(initial: SavedAddress[] = [], over: Partial<AddressRepository> = {}) {
  let book = initial;
  const repo = {
    list: vi.fn(async () => ({ ok: true as const, value: book })),
    add: vi.fn(async (i: AddressInput) => { const a = saved(`new-${book.length + 1}`, { label: i.label }); book = [...book, a]; return { ok: true as const, value: a }; }),
    update: vi.fn(async () => ({ ok: true as const, value: null })),
    remove: vi.fn(async (id: string) => { book = book.filter((a) => a.id !== id); return { ok: true as const, value: null }; }),
    setDefault: vi.fn(async () => ({ ok: true as const, value: null })),
    ...over,
  };
  return { services: { repo } as AddressServices, repo: repo as unknown as Record<"list" | "add" | "update" | "remove" | "setDefault", Mock>, set: (b: SavedAddress[]) => { book = b; } };
}
function mount(services?: AddressServices) {
  const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider><AddressesProvider services={services}>{children}</AddressesProvider></AuthProvider>;
  return renderHook(() => ({ book: useAddresses(), auth: useAuth() }), { wrapper });
}
const signIn = () => window.localStorage.setItem(SESSION_KEY, JSON.stringify(NADIA));

beforeEach(() => { window.localStorage.clear(); vi.unstubAllEnvs(); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); });
afterEach(cleanup);

describe("the address book in the database", () => {
  it("is empty and ready for someone who is not signed in, and reads nothing", async () => {
    const { services, repo } = fakeRepo([saved("a1")]);
    const view = mount(services);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(view.result.current.book).toMatchObject({ database: true, status: "ready", addresses: [] });
    expect(repo.list).not.toHaveBeenCalled();
  });
  it("is loading from the first moment a signed-in buyer is known, then lists the book", async () => {
    signIn();
    let finish: (v: { ok: true; value: SavedAddress[] }) => void = () => {};
    const { services } = fakeRepo([], { list: () => new Promise((resolve) => { finish = resolve as never; }) as never });
    const view = mount(services);
    await waitFor(() => expect(view.result.current.auth.user?.id).toBe("nadia"));
    expect(view.result.current.book.status).toBe("loading");
    expect(view.result.current.book.addresses).toEqual([]);
    await act(async () => finish({ ok: true, value: [saved("a1", { isDefault: true })] }));
    expect(view.result.current.book.status).toBe("ready");
    expect(view.result.current.book.addresses.map((a) => a.id)).toEqual(["a1"]);
  });
  it("reports an error, keeps what it had, and reads again on request", async () => {
    signIn();
    const list = vi.fn().mockResolvedValueOnce({ ok: true, value: [saved("a1")] }).mockResolvedValueOnce({ ok: false, error: "network" }).mockResolvedValue({ ok: true, value: [saved("a1"), saved("a2")] });
    const view = mount(fakeRepo([], { list: list as never }).services);
    await waitFor(() => expect(view.result.current.book.addresses).toHaveLength(1));
    act(() => view.result.current.book.reload());
    await waitFor(() => expect(view.result.current.book.status).toBe("error"));
    expect(view.result.current.book.addresses).toHaveLength(1);
    act(() => view.result.current.book.reload());
    await waitFor(() => expect(view.result.current.book.addresses).toHaveLength(2));
    expect(view.result.current.book.status).toBe("ready");
  });
  it("starts in error, with an empty list, when the first read fails", async () => {
    signIn();
    const view = mount(fakeRepo([], { list: async () => ({ ok: false as const, error: "network" as const }) }).services);
    await waitFor(() => expect(view.result.current.book.status).toBe("error"));
    expect(view.result.current.book.addresses).toEqual([]);
  });
  it("adds an address and then shows the book as it was saved", async () => {
    signIn();
    const { services, repo } = fakeRepo([saved("a1", { isDefault: true })]);
    const view = mount(services);
    await waitFor(() => expect(view.result.current.book.addresses).toHaveLength(1));
    let result;
    await act(async () => { result = await view.result.current.book.add(input("Kantor")); });
    expect(result).toMatchObject({ ok: true, value: { label: "Kantor" } });
    expect(repo.add).toHaveBeenCalledWith(input("Kantor"));
    expect(view.result.current.book.addresses.map((a) => a.label)).toEqual(["a1", "Kantor"]);
  });
  it("changes, chooses the default, and removes, reading the book again each time", async () => {
    signIn();
    const { services, repo } = fakeRepo([saved("a1", { isDefault: true }), saved("a2")]);
    const view = mount(services);
    await waitFor(() => expect(view.result.current.book.addresses).toHaveLength(2));
    const before = repo.list.mock.calls.length;
    await act(async () => { await view.result.current.book.update("a2", input("Baru")); });
    await act(async () => { await view.result.current.book.setDefault("a2"); });
    await act(async () => { await view.result.current.book.remove("a1"); });
    expect(repo.update).toHaveBeenCalledWith("a2", input("Baru"));
    expect(repo.setDefault).toHaveBeenCalledWith("a2");
    expect(repo.remove).toHaveBeenCalledWith("a1");
    expect(repo.list.mock.calls.length).toBe(before + 3);
    expect(view.result.current.book.addresses.map((a) => a.id)).toEqual(["a2"]);
  });
  it("does not read again, and passes the reason on, when a change is refused", async () => {
    signIn();
    const { services, repo } = fakeRepo([saved("a1")], { add: async () => ({ ok: false as const, error: "tooMany" as const }), remove: async () => ({ ok: false as const, error: "notFound" as const }) });
    const view = mount(services);
    await waitFor(() => expect(view.result.current.book.addresses).toHaveLength(1));
    const reads = repo.list.mock.calls.length;
    let added, removed;
    await act(async () => { added = await view.result.current.book.add(input()); removed = await view.result.current.book.remove("a1"); });
    expect(added).toEqual({ ok: false, error: "tooMany" });
    expect(removed).toEqual({ ok: false, error: "notFound" });
    expect(repo.list.mock.calls.length).toBe(reads);
  });
  it("refuses a change from someone who is not signed in", async () => {
    const { services, repo } = fakeRepo();
    const view = mount(services);
    let result;
    await act(async () => { result = await view.result.current.book.add(input()); });
    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(repo.add).not.toHaveBeenCalled();
  });
  it("does not show one account's book to the next one that signs in", async () => {
    signIn();
    const view = mount(fakeRepo([saved("a1")]).services);
    await waitFor(() => expect(view.result.current.book.addresses).toHaveLength(1));
    await act(async () => { await view.result.current.auth.signOut(); });
    expect(view.result.current.book.addresses).toEqual([]);
  });
});

describe("a different account that signs in directly", () => {
  it("reads its own book again instead of keeping the previous account's", async () => {
    signIn();
    const { services, repo } = fakeRepo([saved("a1")]);
    const view = mount(services);
    await waitFor(() => expect(view.result.current.book.addresses).toHaveLength(1));
    const reads = repo.list.mock.calls.length;
    repo.list.mockResolvedValue({ ok: true, value: [saved("b1"), saved("b2")] });
    await act(async () => { await view.result.current.auth.signIn("bima@demo.test", "password123"); });
    await waitFor(() => expect(view.result.current.book.addresses.map((a) => a.id)).toEqual(["b1", "b2"]));
    expect(repo.list.mock.calls.length).toBe(reads + 1);
  });
  it("shows nothing of the previous account while the new one is read", async () => {
    signIn();
    const { services, repo } = fakeRepo([saved("a1")]);
    const view = mount(services);
    await waitFor(() => expect(view.result.current.book.addresses).toHaveLength(1));
    repo.list.mockImplementation(() => new Promise(() => {}) as never);
    await act(async () => { await view.result.current.auth.signIn("bima@demo.test", "password123"); });
    expect(view.result.current.book).toMatchObject({ status: "loading", addresses: [] });
  });
});

describe("the demo address book (no database)", () => {
  it("keeps the book in this browser, per account, and it survives a new mount", async () => {
    signIn();
    const first = mount();
    await waitFor(() => expect(first.result.current.auth.user?.id).toBe("nadia"));
    expect(first.result.current.book.database).toBe(false);
    await act(async () => { await first.result.current.book.add(input("Rumah")); });
    await waitFor(() => expect(first.result.current.book.addresses).toHaveLength(1));
    expect(first.result.current.book.addresses[0]).toMatchObject({ label: "Rumah", isDefault: true });
    first.unmount();
    const second = mount();
    await waitFor(() => expect(second.result.current.book.addresses).toHaveLength(1));
    expect(Object.keys(window.localStorage).some((k) => k === "marketplace-addresses-v1:nadia")).toBe(true);
  });
});
