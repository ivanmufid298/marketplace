// Run with `npm run test:ui`. The account page against a fake address book and a fake sign-in: what the buyer sees, and what
// happens when they add, change, choose, and delete addresses and change their password.
import { renderToString } from "react-dom/server";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/features/auth";
import { UiProvider, useUi } from "@/shared/ui-state/ui-provider";
import { AddressesProvider } from "./addresses-provider";
import { AccountView } from "./components/account-view";
import { MAX_ADDRESSES, type AddressInput, type AddressRepository, type AddressResult, type AddressServices, type SavedAddress } from "./lib/types";

const SESSION_KEY = "marketplace-demo-session-v1";
const saved = (id: string, over: Partial<SavedAddress> = {}): SavedAddress => ({ id, label: `Alamat ${id}`, recipientName: "Ana Putri", phone: "0811000111", address: "Jl. Mawar 1", city: "Jakarta", postcode: "12345", note: "", isDefault: false, destinationId: null, destinationLabel: null, ...over });

function fakeRepo(initial: SavedAddress[], over: Partial<AddressRepository> = {}) {
  let book = initial;
  const repo = {
    list: vi.fn(async () => ({ ok: true as const, value: book })),
    add: vi.fn(async (i: AddressInput) => { const a = saved(`n${book.length + 1}`, { label: i.label, recipientName: i.recipientName, isDefault: book.length === 0 || i.isDefault === true }); book = [...(i.isDefault ? book.map((b) => ({ ...b, isDefault: false })) : book), a]; return { ok: true as const, value: a }; }),
    update: vi.fn(async (id: string, i: AddressInput) => { book = book.map((b) => (b.id === id ? { ...b, label: i.label, city: i.city, isDefault: b.isDefault || i.isDefault === true } : i.isDefault ? { ...b, isDefault: false } : b)); return { ok: true as const, value: null }; }),
    remove: vi.fn(async (id: string) => { book = book.filter((b) => b.id !== id); return { ok: true as const, value: null }; }),
    setDefault: vi.fn(async (id: string) => { book = book.map((b) => ({ ...b, isDefault: b.id === id })); return { ok: true as const, value: null }; }),
    ...over,
  };
  return { services: { repo } as AddressServices, repo };
}
function Toast() { return <p data-testid="toast">{useUi().toast}</p>; }
function show(initial: SavedAddress[] = [], over: Partial<AddressRepository> = {}, signedIn = true) {
  if (signedIn) window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id: "nadia", email: "nadia@demo.test", name: "Nadia Putri" }));
  const { services, repo } = fakeRepo(initial, over);
  render(<AuthProvider><UiProvider><AddressesProvider services={services}><AccountView /><Toast /></AddressesProvider></UiProvider></AuthProvider>);
  return repo;
}
const toast = () => screen.getByTestId("toast").textContent;
const card = (label: string) => screen.getByText(label).closest("li") as HTMLElement;
const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
/** Fills the address in by hand: the form asks for a place from the search first, and fields for the city and postcode only on request. */
const byHand = () => fireEvent.click(screen.getByRole("button", { name: "Isi manual" }));
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

beforeEach(() => { window.localStorage.clear(); vi.unstubAllEnvs(); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); });
afterEach(cleanup);

describe("who sees the page", () => {
  it("asks a visitor to sign in", async () => {
    show([], {}, false);
    await flush();
    expect(screen.getByText("Masuk untuk melihat akunmu.")).toBeTruthy();
    expect(screen.queryByText("Alamat saya")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Masuk" }));
    expect(screen.queryByText("Alamat saya")).toBeNull();
  });
  it("shows a signed-in buyer's name and email, their addresses, and the password form", async () => {
    show([saved("a1", { isDefault: true })]);
    expect(await screen.findByText("Alamat a1")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Akun saya" })).toBeTruthy();
    expect(screen.getByText("Nadia Putri")).toBeTruthy();
    expect(screen.getByText("nadia@demo.test")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Ganti kata sandi" })).toBeTruthy();
  });
});

describe("the address list", () => {
  it("shows each address with its recipient, phone, and line, and marks the main one", async () => {
    show([saved("a1", { isDefault: true, note: "Titip satpam" }), saved("a2", { city: "Bandung" })]);
    await screen.findByText("Alamat a1");
    const main = card("Alamat a1");
    expect(main.textContent).toContain("Ana Putri · 0811000111");
    expect(main.textContent).toContain("Jl. Mawar 1, Jakarta, 12345");
    expect(main.textContent).toContain("Titip satpam");
    expect(within(main).getByText("Utama")).toBeTruthy();
    expect(within(card("Alamat a2")).queryByText("Utama")).toBeNull();
    expect(card("Alamat a2").textContent).toContain("Bandung");
  });
  it("says there are none yet, offering to add one, and says it is loading and when it failed", async () => {
    show([]);
    expect(await screen.findByText("Belum ada alamat. Tambahkan satu supaya checkout lebih cepat.")).toBeTruthy();
    cleanup();
    show([], { list: () => new Promise(() => {}) as never });
    expect((await screen.findByRole("status")).textContent).toBe("Memuat alamat…");
    cleanup();
    const repo = show([], { list: vi.fn().mockResolvedValueOnce({ ok: false, error: "network" }).mockResolvedValue({ ok: true, value: [saved("a1", { isDefault: true })] }) as never });
    expect((await screen.findByRole("alert")).textContent).toContain("Alamat belum bisa dimuat.");
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(await screen.findByText("Alamat a1")).toBeTruthy();
    expect(repo.list).toHaveBeenCalledTimes(2);
  });
});

describe("adding an address", () => {
  it("opens the form straight away when there is none, with the account's name filled in", async () => {
    show([]);
    await flush();
    fireEvent.click(await screen.findByRole("button", { name: "Tambah alamat" }));
    expect((screen.getByLabelText("Nama penerima") as HTMLInputElement).value).toBe("Nadia Putri");
  });
  it("names what is missing, field by field, and saves nothing", async () => {
    const repo = show([]);
    fireEvent.click(await screen.findByRole("button", { name: "Tambah alamat" }));
    type("Nama penerima", "");
    fireEvent.click(screen.getByRole("button", { name: "Simpan alamat" }));
    expect(screen.getAllByText("Wajib diisi.").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText("Pilih lokasi dari hasil pencarian, atau isi manual.")).toBeTruthy();
    byHand();
    fireEvent.click(screen.getByRole("button", { name: "Simpan alamat" }));
    expect(screen.getAllByText("Wajib diisi.").length).toBeGreaterThanOrEqual(6);
    expect(screen.queryByText("Pilih lokasi dari hasil pencarian, atau isi manual.")).toBeNull();
    type("Nomor telepon", "123");
    fireEvent.click(screen.getByRole("button", { name: "Simpan alamat" }));
    expect(screen.getByText("Terlalu pendek (minimal 5 karakter).")).toBeTruthy();
    type("Catatan untuk kurir (opsional)", "x".repeat(201));
    fireEvent.click(screen.getByRole("button", { name: "Simpan alamat" }));
    expect(screen.getByText("Terlalu panjang (maksimal 200 karakter).")).toBeTruthy();
    expect(repo.add).not.toHaveBeenCalled();
  });
  it("puts the cursor in the first field that needs attention", async () => {
    show([]);
    fireEvent.click(await screen.findByRole("button", { name: "Tambah alamat" }));
    byHand();
    type("Label alamat", "Rumah");
    fireEvent.click(screen.getByRole("button", { name: "Simpan alamat" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Nomor telepon"));
  });
  it("does not save twice when the buyer taps twice while it is saving", async () => {
    let finish: (v: AddressResult<SavedAddress>) => void = () => {};
    const repo = show([], { add: vi.fn(() => new Promise((resolve) => { finish = resolve as never; })) as never });
    fireEvent.click(await screen.findByRole("button", { name: "Tambah alamat" }));
    byHand();
    type("Label alamat", "Rumah"); type("Nomor telepon", "0811000111"); type("Alamat lengkap", "Jl"); type("Kota / kecamatan", "J"); type("Kode pos", "1");
    const form = screen.getByRole("button", { name: "Simpan alamat" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(repo.add).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Menyimpan…" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish({ ok: true, value: saved("n1", { isDefault: true }) }));
  });
  it("clears a field's complaint as soon as the buyer types in it again", async () => {
    show([]);
    fireEvent.click(await screen.findByRole("button", { name: "Tambah alamat" }));
    fireEvent.click(screen.getByRole("button", { name: "Simpan alamat" }));
    const before = screen.getAllByText("Wajib diisi.").length;
    type("Label alamat", "Rumah");
    expect(screen.getAllByText("Wajib diisi.").length).toBe(before - 1);
  });
  it("saves a complete address (trimmed), says so, and shows it in the list as the main one", async () => {
    const repo = show([]);
    fireEvent.click(await screen.findByRole("button", { name: "Tambah alamat" }));
    byHand();
    type("Label alamat", "  Rumah ");
    type("Nomor telepon", "0811000111");
    type("Alamat lengkap", "Jl. Mawar 1");
    type("Kota / kecamatan", "Jakarta");
    type("Kode pos", "12345");
    fireEvent.click(screen.getByRole("button", { name: "Simpan alamat" }));
    await waitFor(() => expect(toast()).toBe("Alamat disimpan"));
    expect(repo.add).toHaveBeenCalledWith(expect.objectContaining({ label: "  Rumah ", recipientName: "Nadia Putri" }));
    expect(await screen.findByText("Rumah")).toBeTruthy();
    expect(within(card("Rumah")).getByText("Utama")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Simpan alamat" })).toBeNull();
  });
  it("offers to make a later address the main one, and does it when ticked", async () => {
    const repo = show([saved("a1", { isDefault: true })]);
    fireEvent.click(await screen.findByRole("button", { name: "Tambah alamat" }));
    expect(screen.getByRole("button", { name: "Batal" })).toBeTruthy();
    byHand();
    type("Label alamat", "Kantor"); type("Nomor telepon", "0811000111"); type("Alamat lengkap", "Jl. Kantor 2"); type("Kota / kecamatan", "Jakarta"); type("Kode pos", "12345");
    fireEvent.click(screen.getByLabelText("Jadikan alamat utama"));
    fireEvent.click(screen.getByRole("button", { name: "Simpan alamat" }));
    await waitFor(() => expect(toast()).toBe("Alamat disimpan"));
    expect(repo.add).toHaveBeenCalledWith(expect.objectContaining({ label: "Kantor", isDefault: true }));
    await waitFor(() => expect(within(card("Kantor")).getByText("Utama")).toBeTruthy());
    expect(within(card("Alamat a1")).queryByText("Utama")).toBeNull();
  });
  it("does not offer the main-address box for the very first address", async () => {
    show([]);
    fireEvent.click(await screen.findByRole("button", { name: "Tambah alamat" }));
    expect(screen.queryByLabelText("Jadikan alamat utama")).toBeNull();
    expect(screen.queryByRole("button", { name: "Batal" })).toBeNull();
  });
  it("shows what the database said when saving fails, keeps the form, and lets the buyer cancel", async () => {
    show([saved("a1", { isDefault: true })], { add: async () => ({ ok: false as const, error: "tooMany" as const }) });
    fireEvent.click(await screen.findByRole("button", { name: "Tambah alamat" }));
    byHand();
    type("Label alamat", "X"); type("Nomor telepon", "0811000111"); type("Alamat lengkap", "Jl"); type("Kota / kecamatan", "J"); type("Kode pos", "1");
    fireEvent.click(screen.getByRole("button", { name: "Simpan alamat" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Alamat sudah mencapai batas 10. Hapus satu dulu.");
    expect(screen.getByLabelText("Label alamat")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(screen.queryByLabelText("Label alamat")).toBeNull();
  });
  it("stops offering to add at the limit, and says why", async () => {
    show(Array.from({ length: MAX_ADDRESSES }, (_, i) => saved(`a${i + 1}`, { isDefault: i === 0 })));
    await screen.findByText("Alamat a1");
    expect(screen.queryByRole("button", { name: "Tambah alamat" })).toBeNull();
    expect(screen.getByText("Kamu sudah menyimpan 10 alamat, batas maksimal. Hapus satu untuk menambah yang baru.")).toBeTruthy();
  });
});

describe("changing, choosing, and deleting", () => {
  it("opens the form with the address's own values, and saves the change", async () => {
    const repo = show([saved("a1", { isDefault: true }), saved("a2")]);
    await screen.findByText("Alamat a2");
    fireEvent.click(within(card("Alamat a2")).getByRole("button", { name: "Ubah" }));
    expect((screen.getByLabelText("Label alamat") as HTMLInputElement).value).toBe("Alamat a2");
    type("Label alamat", "Kantor");
    type("Kota / kecamatan", "Bandung");
    fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
    await waitFor(() => expect(toast()).toBe("Alamat diperbarui"));
    expect(repo.update).toHaveBeenCalledWith("a2", expect.objectContaining({ label: "Kantor", city: "Bandung" }));
    expect(await screen.findByText("Kantor")).toBeTruthy();
  });
  it("can make an address the main one while changing it, but not the one that already is", async () => {
    const repo = show([saved("a1", { isDefault: true }), saved("a2")]);
    await screen.findByText("Alamat a2");
    fireEvent.click(within(card("Alamat a1")).getByRole("button", { name: "Ubah" }));
    expect(screen.queryByLabelText("Jadikan alamat utama")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    fireEvent.click(within(card("Alamat a2")).getByRole("button", { name: "Ubah" }));
    fireEvent.click(screen.getByLabelText("Jadikan alamat utama"));
    fireEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
    await waitFor(() => expect(repo.update).toHaveBeenCalledWith("a2", expect.objectContaining({ isDefault: true })));
    await waitFor(() => expect(within(card("Alamat a2")).getByText("Utama")).toBeTruthy());
  });
  it("makes another address the main one with one tap, and offers it only on the others", async () => {
    const repo = show([saved("a1", { isDefault: true }), saved("a2")]);
    await screen.findByText("Alamat a2");
    expect(within(card("Alamat a1")).queryByRole("button", { name: "Jadikan utama" })).toBeNull();
    fireEvent.click(within(card("Alamat a2")).getByRole("button", { name: "Jadikan utama" }));
    await waitFor(() => expect(toast()).toBe("Alamat utama diganti"));
    expect(repo.setDefault).toHaveBeenCalledWith("a2");
    await waitFor(() => expect(within(card("Alamat a2")).getByText("Utama")).toBeTruthy());
  });
  it("asks before deleting, on the address itself, and deletes nothing until the buyer says yes", async () => {
    const repo = show([saved("a1", { isDefault: true }), saved("a2")]);
    await screen.findByText("Alamat a2");
    fireEvent.click(within(card("Alamat a2")).getByRole("button", { name: "Hapus" }));
    expect(within(card("Alamat a2")).getByText('Hapus alamat "Alamat a2"?')).toBeTruthy();
    expect(within(card("Alamat a1")).getByRole("button", { name: "Hapus" })).toBeTruthy();
    expect(repo.remove).not.toHaveBeenCalled();
    fireEvent.click(within(card("Alamat a2")).getByRole("button", { name: "Batal" }));
    expect(within(card("Alamat a2")).getByRole("button", { name: "Hapus" })).toBeTruthy();
    fireEvent.click(within(card("Alamat a2")).getByRole("button", { name: "Hapus" }));
    fireEvent.click(within(card("Alamat a2")).getByRole("button", { name: "Ya, hapus" }));
    await waitFor(() => expect(toast()).toBe("Alamat dihapus"));
    expect(repo.remove).toHaveBeenCalledWith("a2");
    await waitFor(() => expect(screen.queryByText("Alamat a2")).toBeNull());
  });
  it("hands the main mark on when the main address is deleted", async () => {
    show([saved("a1", { isDefault: true }), saved("a2")], { remove: async function () { return { ok: true as const, value: null }; } });
    await screen.findByText("Alamat a2");
    fireEvent.click(within(card("Alamat a1")).getByRole("button", { name: "Hapus" }));
    expect(within(card("Alamat a1")).getByText('Hapus alamat "Alamat a1"?')).toBeTruthy();
  });
  it("tells the buyer when a change is refused, and leaves the list alone", async () => {
    show([saved("a1", { isDefault: true }), saved("a2")], { setDefault: async () => ({ ok: false as const, error: "network" as const }), remove: async () => ({ ok: false as const, error: "notFound" as const }) });
    await screen.findByText("Alamat a2");
    fireEvent.click(within(card("Alamat a2")).getByRole("button", { name: "Jadikan utama" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Tidak bisa terhubung. Periksa koneksi lalu coba lagi.");
    fireEvent.click(within(card("Alamat a2")).getByRole("button", { name: "Hapus" }));
    fireEvent.click(within(card("Alamat a2")).getByRole("button", { name: "Ya, hapus" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Alamat tidak ditemukan. Muat ulang halaman."));
    expect(screen.getByText("Alamat a2")).toBeTruthy();
    // Nothing was done, so there is no "deleted" message, and the question is gone.
    expect(toast()).toBe("");
    expect(within(card("Alamat a2")).queryByRole("button", { name: "Ya, hapus" })).toBeNull();
  });
});

describe("before it is known who is signed in", () => {
  it("shows that it is loading, not the invitation to sign in (so a signed-in buyer does not see a flash of it)", () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id: "nadia", email: "nadia@demo.test", name: "Nadia Putri" }));
    const html = renderToString(<AuthProvider><UiProvider><AddressesProvider services={fakeRepo([]).services}><AccountView /></AddressesProvider></UiProvider></AuthProvider>);
    expect(html).toContain("Memuat alamat…");
    expect(html).not.toContain("Masuk untuk melihat akunmu.");
  });
});

describe("changing the password", () => {
  const fillPasswords = (current: string, next: string, confirm: string) => {
    type("Kata sandi saat ini", current);
    type("Kata sandi baru", next);
    type("Ulangi kata sandi baru", confirm);
    fireEvent.click(screen.getByRole("button", { name: "Ganti kata sandi" }));
  };
  it("asks for all three, at least 8 characters, and the same twice, before asking the server", async () => {
    show([]);
    await screen.findByRole("heading", { name: "Ganti kata sandi" });
    fireEvent.click(screen.getByRole("button", { name: "Ganti kata sandi" }));
    expect(screen.getByRole("alert").textContent).toBe("Lengkapi semua kolom dulu.");
    fillPasswords("lama-1234", "pendek", "pendek");
    expect(screen.getByRole("alert").textContent).toBe("Kata sandi minimal 8 karakter.");
    fillPasswords("lama-1234", "baru-12345", "beda-12345");
    expect(screen.getByRole("alert").textContent).toBe("Kedua kata sandi belum sama.");
  });
  it("in the demo it just says it was changed, says nothing real changed, and empties the fields", async () => {
    show([]);
    await screen.findByRole("heading", { name: "Ganti kata sandi" });
    expect(screen.getByText("Mode demo: tidak ada kata sandi sungguhan yang diganti.")).toBeTruthy();
    fillPasswords("lama-1234", "baru-12345", "baru-12345");
    expect((await screen.findByRole("status")).textContent).toBe("Kata sandi sudah diganti.");
    expect((screen.getByLabelText("Kata sandi saat ini") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Kata sandi baru") as HTMLInputElement).value).toBe("");
  });
});
