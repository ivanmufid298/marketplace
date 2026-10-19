// Run with `npm run test:ui`. The admin's shipping screen against a fake database: what is shown, what is saved, and what the admin hears
// when something is wrong. (The sample screen is the same component without a database.)
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetDestinations, type ManualMethod, type SettingsRepository, type SettingsResult, type SettingsServices, type ShippingSettings as Settings } from "@/features/shipping";
import { AdminProvider, useAdmin } from "../../providers/admin-provider";
import { ShippingSettings } from "./shipping-settings";
import { ShippingSettingsDb } from "./shipping-settings-db";

const base: Settings = { originId: 17549, originLabel: "KEBAYORAN LAMA SELATAN, KEBAYORAN LAMA, JAKARTA SELATAN, DKI JAKARTA, 12240", couriers: ["jne", "sicepat", "jnt", "anteraja"], freeShippingMin: 500000, markup: 2000 };
const regular: ManualMethod = { code: "regular", label: "Reguler", note: "2–4 hari", fee: 18000, active: true };
const express: ManualMethod = { code: "express", label: "Express", note: "", fee: 32000, active: false };

function fake(settings: Settings = base, methods: ManualMethod[] = [regular, express], over: Partial<SettingsRepository> = {}) {
  let current = settings; let rates = methods;
  const repo = {
    get: vi.fn(async (): Promise<SettingsResult<Settings>> => ({ ok: true, value: current })),
    save: vi.fn(async (s: Settings): Promise<SettingsResult<null>> => { current = s; return { ok: true, value: null }; }),
    listMethods: vi.fn(async (): Promise<SettingsResult<ManualMethod[]>> => ({ ok: true, value: rates })),
    updateMethod: vi.fn(async (code: string, change: Omit<ManualMethod, "code">): Promise<SettingsResult<null>> => { rates = rates.map((m) => (m.code === code ? { ...m, ...change } : m)); return { ok: true, value: null }; }),
    ...over,
  };
  return { services: { repo } as SettingsServices, repo };
}
function Toast() { return <p data-testid="toast">{useAdmin().toast}</p>; }
function show(services: SettingsServices) {
  render(<AdminProvider><ShippingSettingsDb services={services} /><Toast /></AdminProvider>);
}
const toast = () => screen.getByTestId("toast").textContent;
const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const saveSettings = () => fireEvent.click(screen.getByRole("button", { name: "Simpan pengaturan" }));
const rowOf = (code: string) => document.querySelector(`[data-code="${code}"]`) as HTMLElement;

beforeEach(() => { window.localStorage.clear(); forgetDestinations(); vi.unstubAllEnvs(); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("what is shown", () => {
  it("says it is loading, then shows where parcels leave from, the couriers, the fees, and the manual rates", async () => {
    let finish: (v: SettingsResult<Settings>) => void = () => {};
    show(fake(base, [regular, express], { get: () => new Promise((resolve) => { finish = resolve as never; }) as never }).services);
    expect(screen.getByRole("status").textContent).toBe("Memuat pengaturan ongkir…");
    finish({ ok: true, value: base });
    expect(await screen.findByText("Asal pengiriman")).toBeTruthy();
    expect(screen.getByText("Kebayoran Lama Selatan")).toBeTruthy();
    expect(screen.getByText("Kebayoran Lama, Jakarta Selatan, DKI Jakarta · 12240")).toBeTruthy();
    expect(screen.queryByRole("note")).toBeNull();
    expect((screen.getByLabelText(/Gratis ongkir mulai belanja/) as HTMLInputElement).value).toBe("500.000");
    expect((screen.getByLabelText(/Tambahan ongkir per pesanan/) as HTMLInputElement).value).toBe("2.000");
    for (const name of ["JNE", "SiCepat", "J&T Express", "AnterAja"]) expect((screen.getByLabelText(name) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Ninja Xpress") as HTMLInputElement).checked).toBe(false);
    expect(within(rowOf("regular")).getByDisplayValue("Reguler")).toBeTruthy();
    expect((within(rowOf("regular")).getByLabelText("Tarif (Rp)") as HTMLInputElement).value).toBe("18.000");
    expect((within(rowOf("express")).getByLabelText("Aktif") as HTMLInputElement).checked).toBe(false);
  });
  it("warns, and shows the search, when no origin has been chosen, and shows empty boxes for no free shipping and no markup", async () => {
    show(fake({ ...base, originId: null, originLabel: null, freeShippingMin: null, markup: 0 }).services);
    expect((await screen.findByRole("note")).textContent).toContain("Belum diatur");
    expect(screen.getByRole("combobox")).toBeTruthy();
    expect((screen.getByLabelText(/Gratis ongkir mulai belanja/) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/Tambahan ongkir per pesanan/) as HTMLInputElement).value).toBe("");
  });
  it("shows an error with a retry that reads again, and nothing to edit meanwhile", async () => {
    const get = vi.fn().mockResolvedValueOnce({ ok: false, error: "network" }).mockResolvedValue({ ok: true, value: base });
    show(fake(base, [regular], { get: get as never }).services);
    expect((await screen.findByRole("alert")).textContent).toContain("Pengaturan ongkir belum bisa dimuat.");
    expect(screen.queryByText("Asal pengiriman")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(await screen.findByText("Asal pengiriman")).toBeTruthy();
  });
});

describe("saving the settings", () => {
  it("saves what was typed as whole rupiah, the couriers chosen, and the origin as it was", async () => {
    const { services, repo } = fake();
    show(services);
    await screen.findByText("Asal pengiriman");
    type(/Gratis ongkir mulai belanja/, "Rp 750.000");
    type(/Tambahan ongkir per pesanan/, "-1.500");
    fireEvent.click(screen.getByLabelText("JNE"));
    fireEvent.click(screen.getByLabelText("Ninja Xpress"));
    saveSettings();
    await waitFor(() => expect(toast()).toBe("Pengaturan ongkir disimpan"));
    expect(repo.save).toHaveBeenCalledWith({ ...base, couriers: ["sicepat", "jnt", "anteraja", "ninja"], freeShippingMin: 750000, markup: -1500 });
    // The boxes then show what the database has, written the usual way.
    await waitFor(() => expect((screen.getByLabelText(/Gratis ongkir mulai belanja/) as HTMLInputElement).value).toBe("750.000"));
    expect((screen.getByLabelText(/Tambahan ongkir per pesanan/) as HTMLInputElement).value).toBe("-1.500");
  });
  it("saves an empty free-shipping box as never free, and an empty markup as none", async () => {
    const { services, repo } = fake();
    show(services);
    await screen.findByText("Asal pengiriman");
    type(/Gratis ongkir mulai belanja/, "");
    type(/Tambahan ongkir per pesanan/, "  ");
    saveSettings();
    await waitFor(() => expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ freeShippingMin: null, markup: 0 })));
  });
  it("accepts a free-shipping minimum of zero as always free", async () => {
    const { services, repo } = fake();
    show(services);
    await screen.findByText("Asal pengiriman");
    type(/Gratis ongkir mulai belanja/, "0");
    saveSettings();
    await waitFor(() => expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ freeShippingMin: 0 })));
  });
  it("names what is wrong and saves nothing: no courier, an amount that is not whole rupiah, a markup that is too big", async () => {
    const { services, repo } = fake();
    show(services);
    await screen.findByText("Asal pengiriman");
    for (const name of ["JNE", "SiCepat", "J&T Express", "AnterAja"]) fireEvent.click(screen.getByLabelText(name));
    type(/Gratis ongkir mulai belanja/, "lima ratus");
    saveSettings();
    expect(screen.getByText("Isi dengan angka bulat rupiah, atau kosongkan.")).toBeTruthy();
    expect(repo.save).not.toHaveBeenCalled();
    type(/Gratis ongkir mulai belanja/, "500.000");
    type(/Tambahan ongkir per pesanan/, "2.000.000");
    saveSettings();
    expect(screen.getByText("Isi dengan angka bulat rupiah antara -1.000.000 dan 1.000.000.")).toBeTruthy();
    type(/Tambahan ongkir per pesanan/, "2,5");
    saveSettings();
    expect(screen.getByText("Isi dengan angka bulat rupiah antara -1.000.000 dan 1.000.000.")).toBeTruthy();
    type(/Tambahan ongkir per pesanan/, "0");
    saveSettings();
    expect(screen.getByText("Pilih paling sedikit satu kurir.")).toBeTruthy();
    expect(repo.save).not.toHaveBeenCalled();
  });
  it("names every problem at once, an unreadable amount and a missing courier together", async () => {
    show(fake().services);
    await screen.findByText("Asal pengiriman");
    for (const name of ["JNE", "SiCepat", "J&T Express", "AnterAja"]) fireEvent.click(screen.getByLabelText(name));
    type(/Gratis ongkir mulai belanja/, "lima ratus");
    saveSettings();
    expect(screen.getByText("Isi dengan angka bulat rupiah, atau kosongkan.")).toBeTruthy();
    expect(screen.getByText("Pilih paling sedikit satu kurir.")).toBeTruthy();
  });
  it("takes the complaint away once everything is right", async () => {
    const { services, repo } = fake();
    show(services);
    await screen.findByText("Asal pengiriman");
    for (const name of ["JNE", "SiCepat", "J&T Express", "AnterAja"]) fireEvent.click(screen.getByLabelText(name));
    saveSettings();
    expect(screen.getByText("Pilih paling sedikit satu kurir.")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("JNE"));
    saveSettings();
    await waitFor(() => expect(repo.save).toHaveBeenCalled());
    expect(screen.queryByText("Pilih paling sedikit satu kurir.")).toBeNull();
  });
  it("tells the admin when the database says no, and keeps what was typed", async () => {
    const { services } = fake(base, [regular], { save: async () => ({ ok: false as const, error: "forbidden" as const }) });
    show(services);
    await screen.findByText("Asal pengiriman");
    type(/Tambahan ongkir per pesanan/, "3.000");
    saveSettings();
    expect((await screen.findByText("Akun ini bukan admin, atau sesinya sudah berakhir. Masuk lagi sebagai admin.")).getAttribute("role")).toBe("alert");
    expect((screen.getByLabelText(/Tambahan ongkir per pesanan/) as HTMLInputElement).value).toBe("3.000");
    expect(toast()).toBe("");
  });
  it("takes away the old message from the database once the admin tries again", async () => {
    const save = vi.fn().mockResolvedValueOnce({ ok: false, error: "forbidden" }).mockResolvedValue({ ok: true, value: null });
    show(fake(base, [regular], { save: save as never }).services);
    await screen.findByText("Asal pengiriman");
    saveSettings();
    await screen.findByText("Akun ini bukan admin, atau sesinya sudah berakhir. Masuk lagi sebagai admin.");
    type(/Tambahan ongkir per pesanan/, "abc");
    saveSettings();
    expect(screen.queryByText("Akun ini bukan admin, atau sesinya sudah berakhir. Masuk lagi sebagai admin.")).toBeNull();
    expect(screen.getByText("Isi dengan angka bulat rupiah antara -1.000.000 dan 1.000.000.")).toBeTruthy();
  });
  it("does not save twice when pressed twice while it is saving, and says it is saving", async () => {
    let finish: (v: SettingsResult<null>) => void = () => {};
    const { services, repo } = fake(base, [regular], { save: vi.fn(() => new Promise((resolve) => { finish = resolve as never; })) as never });
    show(services);
    await screen.findByText("Asal pengiriman");
    saveSettings();
    expect((screen.getByRole("button", { name: "Menyimpan…" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Menyimpan…" }));
    expect(repo.save).toHaveBeenCalledTimes(1);
    finish({ ok: true, value: null });
    await waitFor(() => expect(toast()).toBe("Pengaturan ongkir disimpan"));
  });
});

describe("the origin", () => {
  const answers = (body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
  const place = { id: 17536, label: "CIPETE UTARA, KEBAYORAN BARU, JAKARTA SELATAN, DKI JAKARTA, 12150", province: "P", city: "C", district: "D", subdistrict: "S", postcode: "12150" };
  it("is chosen from the search and saved with its id and name", async () => {
    answers({ destinations: [place] });
    const { services, repo } = fake({ ...base, originId: null, originLabel: null });
    show(services);
    await screen.findByText("Asal pengiriman");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "cipete" } });
    fireEvent.click(await screen.findByRole("option", { name: /Cipete Utara/ }, { timeout: 2000 }));
    expect(screen.queryByRole("note")).toBeNull();
    saveSettings();
    await waitFor(() => expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ originId: 17536, originLabel: place.label })));
  });
  it("can be changed, and taken away, and is then saved as none", async () => {
    answers({ destinations: [place] });
    const { services, repo } = fake();
    show(services);
    await screen.findByText("Asal pengiriman");
    fireEvent.click(screen.getByRole("button", { name: "Ganti" }));
    expect(screen.getByRole("combobox")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain("Belum diatur");
    saveSettings();
    await waitFor(() => expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ originId: null, originLabel: null })));
  });
});

describe("the manual rates", () => {
  it("saves one rate on its own, as typed, and says which", async () => {
    const { services, repo } = fake();
    show(services);
    await screen.findByText("Asal pengiriman");
    const row = rowOf("regular");
    fireEvent.change(within(row).getByLabelText("Nama layanan"), { target: { value: "  Reguler baru " } });
    fireEvent.change(within(row).getByLabelText("Tarif (Rp)"), { target: { value: "Rp 21.000" } });
    fireEvent.change(within(row).getByLabelText("Keterangan"), { target: { value: "3–5 hari" } });
    fireEvent.click(within(row).getByLabelText("Aktif"));
    fireEvent.click(within(row).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(toast()).toBe("Tarif Reguler baru disimpan"));
    expect(repo.updateMethod).toHaveBeenCalledWith("regular", { label: "  Reguler baru ", note: "3–5 hari", fee: 21000, active: false });
    expect(repo.updateMethod).toHaveBeenCalledTimes(1);
  });
  it("names what is wrong with a rate and saves nothing: no name, a note that is too long, a fee that is not whole rupiah or too big", async () => {
    const { services, repo } = fake();
    show(services);
    await screen.findByText("Asal pengiriman");
    const row = rowOf("regular");
    const save = () => fireEvent.click(within(row).getByRole("button", { name: "Simpan" }));
    fireEvent.change(within(row).getByLabelText("Nama layanan"), { target: { value: "  " } });
    save();
    expect(within(row).getByText("Nama layanan wajib diisi, paling banyak 60 huruf.")).toBeTruthy();
    fireEvent.change(within(row).getByLabelText("Nama layanan"), { target: { value: "Reguler" } });
    fireEvent.change(within(row).getByLabelText("Keterangan"), { target: { value: "x".repeat(121) } });
    save();
    expect(within(row).getByText("Keterangan paling banyak 120 huruf.")).toBeTruthy();
    fireEvent.change(within(row).getByLabelText("Keterangan"), { target: { value: "" } });
    for (const bad of ["abc", "18,5", "", "10.000.001", "-1"]) {
      fireEvent.change(within(row).getByLabelText("Tarif (Rp)"), { target: { value: bad } });
      save();
      expect(within(row).getByText("Tarif harus angka bulat rupiah antara 0 dan 10.000.000."), bad).toBeTruthy();
    }
    expect(repo.updateMethod).not.toHaveBeenCalled();
    fireEvent.change(within(row).getByLabelText("Tarif (Rp)"), { target: { value: "0" } });
    save();
    await waitFor(() => expect(repo.updateMethod).toHaveBeenCalledWith("regular", expect.objectContaining({ fee: 0 })));
    fireEvent.change(within(row).getByLabelText("Tarif (Rp)"), { target: { value: "10.000.000" } });
    save();
    await waitFor(() => expect(repo.updateMethod).toHaveBeenCalledTimes(2));
  });
  it("does not save a rate twice when pressed twice while it is saving", async () => {
    let finish: (v: SettingsResult<null>) => void = () => {};
    const { services, repo } = fake(base, [regular], { updateMethod: vi.fn(() => new Promise((resolve) => { finish = resolve as never; })) as never });
    show(services);
    await screen.findByText("Asal pengiriman");
    const save = within(rowOf("regular")).getByRole("button", { name: "Simpan" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(repo.updateMethod).toHaveBeenCalledTimes(1);
    expect((save as HTMLButtonElement).disabled).toBe(true);
    finish({ ok: true, value: null });
    await waitFor(() => expect(toast()).toBe("Tarif Reguler disimpan"));
  });
  it("tells the admin when the database refuses one rate, in that row only", async () => {
    const { services } = fake(base, [regular, express], { updateMethod: async () => ({ ok: false as const, error: "network" as const }) });
    show(services);
    await screen.findByText("Asal pengiriman");
    fireEvent.click(within(rowOf("express")).getByRole("button", { name: "Simpan" }));
    expect((await within(rowOf("express")).findByRole("alert")).textContent).toBe("Tidak bisa terhubung. Periksa koneksi lalu coba lagi.");
    expect(within(rowOf("regular")).queryByRole("alert")).toBeNull();
    expect(toast()).toBe("");
  });
  it("shows what is in the database after a change, not what was typed", async () => {
    const { services } = fake();
    show(services);
    await screen.findByText("Asal pengiriman");
    const row = rowOf("regular");
    fireEvent.change(within(row).getByLabelText("Tarif (Rp)"), { target: { value: "21000" } });
    fireEvent.click(within(row).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect((within(rowOf("regular")).getByLabelText("Tarif (Rp)") as HTMLInputElement).value).toBe("21.000"));
  });
  it("shows no section for rates when there are none", async () => {
    show(fake(base, []).services);
    await screen.findByText("Asal pengiriman");
    expect(screen.queryByText("Tarif cadangan")).toBeNull();
  });
});

describe("the screen without a database", () => {
  it("is the sample screen, with the sample services and no settings to save", () => {
    render(<AdminProvider><ShippingSettings /></AdminProvider>);
    expect(screen.queryByText("Asal pengiriman")).toBeNull();
    expect(screen.getByRole("button", { name: /Tambah layanan/ })).toBeTruthy();
  });
});
