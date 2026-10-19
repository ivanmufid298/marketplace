// Run with `npm run test:ui`. The address step of the checkout: picking from the saved addresses, adding the first or another
// one, following changes to the address book, and what is restored when a half-done checkout is picked up again.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddressesProvider, useAddresses, MAX_ADDRESSES, type AddressInput, type AddressRepository, type AddressServices, type SavedAddress } from "@/features/account";
import { AuthProvider } from "@/features/auth";
import { CartProvider, useCart } from "@/features/cart";
import { CatalogProvider } from "@/features/catalog";
import { CheckoutProvider, useCheckout } from "@/features/checkout";
import { OrdersProvider } from "@/features/orders";
import { products } from "@/lib/mock/store";
import { UiProvider, useUi } from "@/shared/ui-state/ui-provider";
import { CheckoutFlow } from "./checkout-flow";

const SESSION_KEY = "marketplace-demo-session-v1";
const saved = (id: string, over: Partial<SavedAddress> = {}): SavedAddress => ({ id, label: `Alamat ${id}`, recipientName: `Penerima ${id}`, phone: "0811000111", address: `Jl. ${id}`, city: "Jakarta", postcode: "12345", note: "", isDefault: false, destinationId: null, destinationLabel: null, ...over });

function fakeRepo(initial: SavedAddress[], over: Partial<AddressRepository> = {}) {
  let book = initial;
  const repo = {
    list: vi.fn(async () => ({ ok: true as const, value: book })),
    add: vi.fn(async (i: AddressInput) => { const a = saved(`n${book.length + 1}`, { label: i.label, recipientName: i.recipientName, address: i.address, isDefault: book.length === 0 }); book = [...book, a]; return { ok: true as const, value: a }; }),
    update: vi.fn(async (id: string, i: AddressInput) => { book = book.map((b) => (b.id === id ? { ...b, address: i.address, recipientName: i.recipientName } : b)); return { ok: true as const, value: null }; }),
    remove: vi.fn(async (id: string) => { const gone = book.find((b) => b.id === id); book = book.filter((b) => b.id !== id); if (gone?.isDefault && book[0]) book = book.map((b, i) => ({ ...b, isDefault: i === 0 })); return { ok: true as const, value: null }; }),
    setDefault: vi.fn(async () => ({ ok: true as const, value: null })),
    ...over,
  };
  return { services: { repo } as AddressServices, repo };
}

function Probe() {
  const { addToCart } = useCart();
  const { startCheckout, checkoutStep, selectedAddressId, address, finishOrder } = useCheckout();
  const { panels } = useUi();
  const book = useAddresses();
  return (
    <>
      <button onClick={() => addToCart(products[0])}>add-to-cart</button>
      <button onClick={() => startCheckout()}>start</button>
      <button onClick={() => finishOrder()}>finish</button>
      <button onClick={() => void book.update("a2", { label: "x", recipientName: "Diubah", phone: "0811000111", address: "Jl. Baru 9", city: "Jakarta", postcode: "12345", note: "" })}>edit-a2</button>
      <button onClick={() => void book.remove("a2")}>remove-a2</button>
      <output data-testid="state">{JSON.stringify({ step: checkoutStep, selected: selectedAddressId, name: address.fullName, street: address.address, note: address.note, open: panels.checkout })}</output>
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId("state").textContent ?? "{}");
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

async function open(initial: SavedAddress[], over: Partial<AddressRepository> = {}, before: () => void = () => {}) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id: "nadia", email: "n@demo.test", name: "Nadia Putri" }));
  before();
  const { services, repo } = fakeRepo(initial, over);
  render(
    <AuthProvider><UiProvider><CatalogProvider><OrdersProvider><CartProvider><AddressesProvider services={services}><CheckoutProvider><Probe /><CheckoutFlow /></CheckoutProvider></AddressesProvider></CartProvider></OrdersProvider></CatalogProvider></UiProvider></AuthProvider>,
  );
  await flush();
  fireEvent.click(screen.getByText("add-to-cart")); await flush();
  fireEvent.click(screen.getByText("start")); await flush();
  return repo;
}
const stepOne = () => document.querySelectorAll(".co-page")[0] as HTMLElement;
const next = () => within(stepOne()).getByRole("button", { name: "Pilih pengiriman" }) as HTMLButtonElement;
const type = (label: string, value: string) => fireEvent.change(within(stepOne()).getByLabelText(label), { target: { value } });
const byHand = () => fireEvent.click(within(stepOne()).getByRole("button", { name: "Isi manual" }));
const fillNew = (label = "Kantor") => {
  byHand(); type("Label alamat", label); type("Nomor telepon", "0811000111"); type("Alamat lengkap", "Jl. Kantor 2"); type("Kota / kecamatan", "Jakarta"); type("Kode pos", "12345"); };

beforeEach(() => { Element.prototype.scrollTo = vi.fn() as never; window.localStorage.clear(); vi.unstubAllEnvs(); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); });
afterEach(cleanup);

describe("a buyer with no saved address yet", () => {
  it("is asked to add one, with their name filled in, and cannot continue before they have", async () => {
    await open([]);
    expect(within(stepOne()).getByRole("heading", { name: "Tambahkan alamat pengiriman" })).toBeTruthy();
    expect(within(stepOne()).getByText("Alamat ini tersimpan di akunmu, jadi lain kali tinggal dipilih.")).toBeTruthy();
    expect((within(stepOne()).getByLabelText("Nama penerima") as HTMLInputElement).value).toBe("Nadia Putri");
    expect(next().disabled).toBe(true);
  });
  it("names what is missing and saves nothing", async () => {
    const repo = await open([]);
    fireEvent.click(within(stepOne()).getByRole("button", { name: "Simpan alamat" }));
    // The name is already filled in from the account, and the city and postcode are asked for only when filling in by hand.
    expect(within(stepOne()).getAllByText("Wajib diisi.").length).toBeGreaterThanOrEqual(3);
    expect(within(stepOne()).getByText("Pilih lokasi dari hasil pencarian, atau isi manual.")).toBeTruthy();
    expect(repo.add).not.toHaveBeenCalled();
  });
  it("saves it to the address book, chooses it, and lets the buyer go on", async () => {
    const repo = await open([]);
    fillNew("Rumah");
    fireEvent.click(within(stepOne()).getByRole("button", { name: "Simpan alamat" }));
    await waitFor(() => expect(state().selected).toBe("n1"));
    expect(repo.add).toHaveBeenCalledWith(expect.objectContaining({ label: "Rumah", address: "Jl. Kantor 2" }));
    expect(state().street).toBe("Jl. Kantor 2");
    await waitFor(() => expect(next().disabled).toBe(false));
    expect(within(stepOne()).getByRole("radio", { name: /Rumah/ }) as HTMLInputElement).toHaveProperty("checked", true);
    fireEvent.click(next());
    expect(state().step).toBe(2);
  });
  it("tells the buyer what went wrong when saving fails, and stays on the form", async () => {
    await open([], { add: async () => ({ ok: false as const, error: "network" as const }) });
    fillNew();
    fireEvent.click(within(stepOne()).getByRole("button", { name: "Simpan alamat" }));
    expect((await within(stepOne()).findByRole("alert")).textContent).toBe("Tidak bisa terhubung. Periksa koneksi lalu coba lagi.");
    expect(state().selected).toBeNull();
    expect(next().disabled).toBe(true);
  });
});

describe("a buyer with saved addresses", () => {
  const book = [saved("a1"), saved("a2", { isDefault: true, note: "Titip satpam" }), saved("a3")];
  it("sees them as choices, with the main one already chosen and marked", async () => {
    await open(book);
    expect(within(stepOne()).getByRole("heading", { name: "Pilih alamat pengiriman" })).toBeTruthy();
    const radios = within(stepOne()).getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((r) => r.checked)).toEqual([false, true, false]);
    expect(state()).toMatchObject({ selected: "a2", name: "Penerima a2", street: "Jl. a2", note: "Titip satpam" });
    const choice = within(stepOne()).getByRole("radio", { name: /Alamat a2/ }).closest("label")!;
    expect(choice.textContent).toContain("Utama");
    expect(choice.textContent).toContain("Penerima a2 · 0811000111");
    expect(choice.textContent).toContain("Jl. a2, Jakarta, 12345");
    expect(choice.textContent).toContain("Titip satpam");
    expect(next().disabled).toBe(false);
  });
  it("chooses the first one when none is marked main", async () => {
    await open([saved("a1"), saved("a2")]);
    expect(state().selected).toBe("a1");
  });
  it("sends the order to the address chosen, not the one that was main", async () => {
    await open(book);
    fireEvent.click(within(stepOne()).getByRole("radio", { name: /Alamat a3/ }));
    expect(state()).toMatchObject({ selected: "a3", name: "Penerima a3", street: "Jl. a3", note: "" });
    expect(within(stepOne()).getByRole("radio", { name: /Alamat a3/ }).closest("label")!.className).toContain("selected");
    expect(within(stepOne()).getByRole("radio", { name: /Alamat a2/ }).closest("label")!.className).not.toContain("selected");
    fireEvent.click(next());
    expect(state().step).toBe(2);
  });
  it("adds another address from the step, chooses it, and closes the form", async () => {
    const repo = await open(book);
    fireEvent.click(within(stepOne()).getByRole("button", { name: "Tambah alamat baru" }));
    fillNew("Kantor");
    fireEvent.click(within(stepOne()).getByRole("button", { name: "Simpan alamat" }));
    await waitFor(() => expect(state().selected).toBe("n4"));
    expect(repo.add).toHaveBeenCalledTimes(1);
    expect(within(stepOne()).queryByLabelText("Label alamat")).toBeNull();
    expect(within(stepOne()).getAllByRole("radio")).toHaveLength(4);
  });
  it("can back out of adding one", async () => {
    await open(book);
    fireEvent.click(within(stepOne()).getByRole("button", { name: "Tambah alamat baru" }));
    fireEvent.click(within(stepOne()).getByRole("button", { name: "Batal" }));
    expect(within(stepOne()).queryByLabelText("Label alamat")).toBeNull();
    expect(state().selected).toBe("a2");
  });
  it("offers the address book page, and leaves the checkout when the buyer goes there", async () => {
    await open(book);
    const link = within(stepOne()).getByRole("link", { name: "Kelola alamat" });
    expect(link.getAttribute("href")).toBe("/akun");
    expect(state().open).toBe(true);
    fireEvent.click(link);
    expect(state().open).toBe(false);
  });
  it("stops offering to add one at the limit", async () => {
    await open(Array.from({ length: MAX_ADDRESSES }, (_, i) => saved(`a${i + 1}`, { isDefault: i === 0 })));
    expect(within(stepOne()).queryByRole("button", { name: "Tambah alamat baru" })).toBeNull();
    expect(within(stepOne()).getByRole("link", { name: "Kelola alamat" })).toBeTruthy();
  });
});

describe("the step follows the address book", () => {
  const book = [saved("a1", { isDefault: true }), saved("a2")];
  it("picks up a change to the chosen address", async () => {
    await open(book);
    fireEvent.click(within(stepOne()).getByRole("radio", { name: /Alamat a2/ }));
    fireEvent.click(screen.getByText("edit-a2"));
    await waitFor(() => expect(state().street).toBe("Jl. Baru 9"));
    expect(state().name).toBe("Diubah");
  });
  it("falls back to the main address when the chosen one is deleted", async () => {
    await open(book);
    fireEvent.click(within(stepOne()).getByRole("radio", { name: /Alamat a2/ }));
    fireEvent.click(screen.getByText("remove-a2"));
    await waitFor(() => expect(state().selected).toBe("a1"));
    expect(state().street).toBe("Jl. a1");
  });
  it("says it is loading, and cannot continue, until the book has been read", async () => {
    let finish: (v: { ok: true; value: SavedAddress[] }) => void = () => {};
    await open([], { list: () => new Promise((resolve) => { finish = resolve as never; }) as never });
    expect(within(stepOne()).getByRole("status").textContent).toBe("Memuat alamatmu…");
    expect(next().disabled).toBe(true);
    await act(async () => finish({ ok: true, value: [saved("a1", { isDefault: true })] }));
    expect(state().selected).toBe("a1");
    expect(next().disabled).toBe(false);
  });
  it("says so when the book cannot be read, and reads again on request", async () => {
    const list = vi.fn().mockResolvedValueOnce({ ok: false, error: "network" }).mockResolvedValue({ ok: true, value: [saved("a1", { isDefault: true })] });
    await open([], { list: list as never });
    expect((await within(stepOne()).findByRole("alert")).textContent).toContain("Alamat belum bisa dimuat.");
    fireEvent.click(within(stepOne()).getByRole("button", { name: "Coba lagi" }));
    await waitFor(() => expect(state().selected).toBe("a1"));
  });
  const three = [saved("a1"), saved("a2", { isDefault: true, note: "Titip satpam" }), saved("a3")];
  it("chooses the main address again for the next order, after one is finished", async () => {
    await open(three);
    fireEvent.click(within(stepOne()).getByRole("radio", { name: /Alamat a1/ }));
    expect(state()).toMatchObject({ selected: "a1", street: "Jl. a1" });
    fireEvent.click(screen.getByText("finish"));
    await waitFor(() => expect(state()).toMatchObject({ selected: "a2", name: "Penerima a2", street: "Jl. a2", note: "Titip satpam" }));
  });
  it("keeps what it chose in the half-done checkout it saves", async () => {
    await open(three);
    fireEvent.click(within(stepOne()).getByRole("radio", { name: /Alamat a3/ }));
    fireEvent.click(next());
    await flush();
    const draft = JSON.parse(window.localStorage.getItem("marketplace-checkout-v1:nadia") ?? "null");
    expect(draft).toMatchObject({ step: 2, addressId: "a3", address: { address: "Jl. a3", fullName: "Penerima a3" } });
  });
});

describe("picking a half-done checkout up again", () => {
  const draft = (addressId: string) => () => {
    window.localStorage.setItem("marketplace-cart-v2:nadia", JSON.stringify([{ id: 1, qty: 1 }]));
    window.localStorage.setItem("marketplace-checkout-v1:nadia", JSON.stringify({ step: 2, address: { fullName: "Lama", phone: "0811000111", address: "Jl. Lama", city: "Jakarta", postcode: "12345", note: "" }, addressId, shipping: "regular" }));
  };
  async function reopen(initial: SavedAddress[], addressId: string) {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id: "nadia", email: "n@demo.test", name: "Nadia Putri" }));
    draft(addressId)();
    const { services } = fakeRepo(initial);
    render(<AuthProvider><UiProvider><CatalogProvider><OrdersProvider><CartProvider><AddressesProvider services={services}><CheckoutProvider><Probe /><CheckoutFlow /></CheckoutProvider></AddressesProvider></CartProvider></OrdersProvider></CatalogProvider></UiProvider></AuthProvider>);
    await flush();
    await flush();
  }
  it("keeps the saved address that was chosen, with the details it has now", async () => {
    await reopen([saved("a1", { isDefault: true }), saved("a2")], "a2");
    expect(state()).toMatchObject({ step: 2, selected: "a2", street: "Jl. a2" });
  });
  it("chooses the main address instead when the chosen one has been deleted since", async () => {
    await reopen([saved("a1", { isDefault: true })], "a2");
    expect(state()).toMatchObject({ step: 2, selected: "a1", street: "Jl. a1" });
  });
});
