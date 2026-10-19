// Run with `npm run test:ui`. The place of an address: picking it from the search fills the city and postcode, what is saved with
// it, and the ways round when the search cannot be used. (The rest of the form is covered through the account page.)
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetDestinations, type Destination } from "@/features/shipping";
import { AddressForm } from "./address-form";
import type { AddressInput, SavedAddress } from "../lib/types";

const place = (over: Partial<Destination> = {}): Destination => ({ id: 17536, label: "CIPETE UTARA, KEBAYORAN BARU, JAKARTA SELATAN, DKI JAKARTA, 12150", province: "DKI JAKARTA", city: "JAKARTA SELATAN", district: "KEBAYORAN BARU", subdistrict: "CIPETE UTARA", postcode: "12150", ...over });
const searchAnswers = (body: unknown, status = 200) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
const saved = (over: Partial<SavedAddress> = {}): SavedAddress => ({ id: "a1", label: "Rumah", recipientName: "Ana", phone: "0811000111", address: "Jl. Mawar 1", city: "Jakarta", postcode: "12345", note: "", isDefault: true, destinationId: null, destinationLabel: null, ...over });

function show(over: { initial?: SavedAddress } = {}) {
  const onSave = vi.fn(async (_input: AddressInput) => ({ ok: true as const, value: null }));
  const onSaved = vi.fn();
  render(<AddressForm idPrefix="t" initial={over.initial} defaultName="Nadia" submitLabel="Simpan" onSave={onSave} onSaved={onSaved} />);
  return { onSave, onSaved };
}
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const fillRest = () => { type("Nama alamat", "Rumah"); type("Nomor telepon", "0811000111"); type("Alamat lengkap", "Jl. Mawar 1"); };
async function choosePlace(text = "kebayoran") {
  fireEvent.change(screen.getByRole("combobox"), { target: { value: text } });
  fireEvent.click(await screen.findByRole("option", { name: /Cipete Utara/ }));
}

beforeEach(() => forgetDestinations());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("choosing a place", () => {
  it("fills the city and postcode from it, hides those fields, and shows the place with a way to change it", async () => {
    searchAnswers({ destinations: [place()] });
    show();
    expect(screen.queryByLabelText("Kota / kecamatan")).toBeNull();
    await choosePlace();
    expect(screen.getByText("Cipete Utara")).toBeTruthy();
    expect(screen.getByText("Kebayoran Baru, Jakarta Selatan, DKI Jakarta · 12150")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByLabelText("Kota / kecamatan")).toBeNull();
    expect(screen.queryByLabelText("Kode pos")).toBeNull();
  });
  it("saves the address with the place's id and name, and the city and postcode taken from it", async () => {
    searchAnswers({ destinations: [place()] });
    const { onSave, onSaved } = show();
    await choosePlace();
    fillRest();
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ city: "Kebayoran Baru, Jakarta Selatan", postcode: "12150", destinationId: 17536, destinationLabel: place().label, recipientName: "Nadia" }));
  });
  it("asks for the place before saving, unless the buyer says they will fill it in by hand", async () => {
    searchAnswers({ destinations: [] });
    const { onSave } = show();
    fillRest();
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    expect(screen.getByText("Pilih lokasi dari hasil pencarian, atau isi manual.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("combobox"));
    expect(onSave).not.toHaveBeenCalled();
  });
  it("lets the buyer change the place, which brings the search back", async () => {
    searchAnswers({ destinations: [place()] });
    const { onSave } = show();
    await choosePlace();
    fireEvent.click(screen.getByRole("button", { name: "Ganti" }));
    expect(screen.getByRole("combobox")).toBeTruthy();
    fillRest();
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    expect(screen.getByText("Pilih lokasi dari hasil pencarian, atau isi manual.")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });
  it("takes the place's city and postcode over what had been typed by hand", async () => {
    searchAnswers({ destinations: [place()] });
    const { onSave } = show();
    fireEvent.click(screen.getByRole("button", { name: "Isi manual" }));
    type("Kota / kecamatan", "Tulisan tangan"); type("Kode pos", "99999");
    await choosePlace();
    // Once a place is chosen the city and postcode come from it, even though the buyer had asked to fill them in.
    expect(screen.queryByLabelText("Kota / kecamatan")).toBeNull();
    expect(screen.queryByLabelText("Kode pos")).toBeNull();
    fillRest();
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ city: "Kebayoran Baru, Jakarta Selatan", postcode: "12150", destinationId: 17536 }));
  });
  it("asks for a postcode by hand when the chosen place has none", async () => {
    searchAnswers({ destinations: [place({ postcode: "" })] });
    const { onSave } = show();
    await choosePlace();
    expect(screen.getByLabelText("Kode pos")).toBeTruthy();
    expect((screen.getByLabelText("Kota / kecamatan") as HTMLInputElement).value).toBe("Kebayoran Baru, Jakarta Selatan");
    fillRest();
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    expect(screen.getAllByText("Wajib diisi.")).toHaveLength(1);
    expect(onSave).not.toHaveBeenCalled();
    type("Kode pos", "12150");
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ postcode: "12150", destinationId: 17536 })));
  });
});

describe("filling the address in by hand", () => {
  it("shows the city and postcode, says the shop's own rates will be used, and saves without a place", async () => {
    searchAnswers({ destinations: [] });
    const { onSave } = show();
    fireEvent.click(screen.getByRole("button", { name: "Isi manual" }));
    expect(screen.getByText("Kota dan kode pos diisi sendiri. Ongkir memakai tarif toko, bukan tarif per lokasi.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Isi manual" })).toBeNull();
    fillRest(); type("Kota / kecamatan", "Jakarta"); type("Kode pos", "12345");
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ destinationId: null, destinationLabel: null, city: "Jakarta", postcode: "12345" }));
  });
  it("is offered on its own when the search turns out not to be usable", async () => {
    searchAnswers({ error: "quota" }, 429);
    show();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "jakarta" } });
    expect((await screen.findByRole("alert")).textContent).toBe("Pencarian lokasi sedang penuh hari ini. Isi manual saja.");
    await waitFor(() => expect(screen.getByLabelText("Kota / kecamatan")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Isi manual" })).toBeNull();
  });
});

describe("changing an address that already exists", () => {
  it("with a place shows it, with the city and postcode hidden, and keeps it when it is saved", async () => {
    const { onSave } = show({ initial: saved({ destinationId: 17536, destinationLabel: place().label }) });
    expect(screen.getByText("Cipete Utara")).toBeTruthy();
    expect(screen.getByText("Kebayoran Baru, Jakarta Selatan, DKI Jakarta · 12150")).toBeTruthy();
    expect(screen.queryByLabelText("Kota / kecamatan")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ destinationId: 17536, destinationLabel: place().label, city: "Jakarta", postcode: "12345" }));
  });
  it("without a place (saved by hand, or before places existed) shows its city and postcode as they were, and invites choosing a place", async () => {
    const { onSave } = show({ initial: saved() });
    expect((screen.getByLabelText("Kota / kecamatan") as HTMLInputElement).value).toBe("Jakarta");
    expect((screen.getByLabelText("Kode pos") as HTMLInputElement).value).toBe("12345");
    expect(screen.getByText("Pilih lokasi supaya ongkir dihitung sesuai tujuan.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ destinationId: null, destinationLabel: null }));
  });
  it("can be given a place by choosing one", async () => {
    searchAnswers({ destinations: [place()] });
    const { onSave } = show({ initial: saved() });
    await choosePlace();
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ destinationId: 17536, city: "Kebayoran Baru, Jakarta Selatan", postcode: "12150" }));
  });
  it("can have its place taken away by changing it and filling in by hand", async () => {
    const { onSave } = show({ initial: saved({ destinationId: 17536, destinationLabel: place().label }) });
    fireEvent.click(screen.getByRole("button", { name: "Ganti" }));
    fireEvent.click(screen.getByRole("button", { name: "Isi manual" }));
    type("Kota / kecamatan", "Bandung"); type("Kode pos", "40111");
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ destinationId: null, destinationLabel: null, city: "Bandung" }));
  });
});
