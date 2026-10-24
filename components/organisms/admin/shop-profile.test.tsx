// Run with `npm run test:ui`. The admin's profile screen: the shop's name and logo, what the admin can change, and what they are told. The
// database and storage are fakes.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrandProvider, type BrandResult, type BrandServices, type ShopProfile } from "@/features/brand";
import { AdminProvider, useAdmin } from "../../providers/admin-provider";
import { ShopProfile as ShopProfileScreen } from "./shop-profile";

const ID = "0a1b2c3d-4e5f-6789-abcd-ef0123456789";
const OLD = "logo/11111111-1111-1111-1111-111111111111.png";
const BASE = "https://x.supabase.co";
const ok: BrandResult<null> = { ok: true, value: null };
const goodDeps = { decode: async () => ({ width: 100, height: 100, release: () => undefined }), encodePng: async () => new Blob([new Uint8Array(50)], { type: "image/png" }) };

function fake(initial: ShopProfile = { name: "Market by Kith", logoKey: null }) {
  let profile = initial;
  const repo = {
    get: vi.fn(async (): Promise<BrandResult<ShopProfile>> => ({ ok: true, value: profile })),
    saveName: vi.fn(async (name: string): Promise<BrandResult<null>> => { profile = { ...profile, name }; return ok; }),
    saveLogoKey: vi.fn(async (key: string | null): Promise<BrandResult<null>> => { profile = { ...profile, logoKey: key }; return ok; }),
  };
  const storage = { upload: vi.fn(async () => undefined), remove: vi.fn(async () => undefined), publicUrl: (key: string) => `${BASE}/storage/v1/object/public/shop-brand/${key}` };
  return { services: { repo, storage, newId: () => ID } as BrandServices, repo, storage };
}
function Toast() {
  const { toast } = useAdmin();
  return <p data-testid="toast">{toast}</p>;
}
function show(services?: BrandServices) {
  return render(<AdminProvider><BrandProvider services={services} logoDeps={goodDeps}><ShopProfileScreen /><Toast /></BrandProvider></AdminProvider>);
}
const toast = () => screen.getByTestId("toast").textContent;
const nameBox = () => screen.getByLabelText("Nama toko") as HTMLInputElement;
const saveName = () => screen.getByRole("button", { name: "Simpan nama" }) as HTMLButtonElement;
const fileBox = () => document.getElementById("shopLogo") as HTMLInputElement;
const png = () => new File([new Uint8Array(10)], "logo.png", { type: "image/png" });
const pickFile = (file: File) => act(async () => { fireEvent.change(fileBox(), { target: { files: [file] } }); });

beforeEach(() => { window.localStorage.clear(); vi.unstubAllEnvs(); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon"); });
afterEach(cleanup);

describe("the shop's name", () => {
  it("shows the current name and how many characters it has", async () => {
    show(fake({ name: "Kith Store", logoKey: null }).services);
    await waitFor(() => expect(nameBox().value).toBe("Kith Store"));
    expect(screen.getByText("10 dari 60 karakter")).toBeTruthy();
  });
  it("counts characters as people do", async () => {
    show(fake().services);
    await waitFor(() => expect(nameBox().value).toBe("Market by Kith"));
    fireEvent.change(nameBox(), { target: { value: "😀😀😀" } });
    expect(screen.getByText("3 dari 60 karakter")).toBeTruthy();
  });
  it("cannot be saved until it is changed to something valid", async () => {
    show(fake().services);
    await waitFor(() => expect(nameBox().value).toBe("Market by Kith"));
    expect(saveName().disabled).toBe(true);
    fireEvent.change(nameBox(), { target: { value: "Market by Kith  " } });
    expect(saveName().disabled).toBe(true); // the same name once the spaces are gone
    fireEvent.change(nameBox(), { target: { value: "   " } });
    expect(saveName().disabled).toBe(true);
    fireEvent.change(nameBox(), { target: { value: "a".repeat(61) } });
    expect(saveName().disabled).toBe(true);
    fireEvent.change(nameBox(), { target: { value: "Kith Store" } });
    expect(saveName().disabled).toBe(false);
  });
  it("saves it, trimmed, tells the admin, and then shows it as saved", async () => {
    const { services, repo } = fake();
    show(services);
    await waitFor(() => expect(nameBox().value).toBe("Market by Kith"));
    fireEvent.change(nameBox(), { target: { value: "  Kith Store " } });
    fireEvent.click(saveName());
    await waitFor(() => expect(repo.saveName).toHaveBeenCalledWith("Kith Store"));
    await waitFor(() => expect(toast()).toBe("Nama toko disimpan"));
    await waitFor(() => expect(nameBox().value).toBe("Kith Store"));
    expect(saveName().disabled).toBe(true);
  });
  it("disables the save button while it is saving", async () => {
    const { services, repo } = fake();
    let finish: (r: BrandResult<null>) => void = () => undefined;
    repo.saveName.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    show(services);
    await waitFor(() => expect(nameBox().value).toBe("Market by Kith"));
    fireEvent.change(nameBox(), { target: { value: "Kith Store" } });
    expect(saveName().disabled).toBe(false);
    fireEvent.click(saveName());
    await waitFor(() => expect(saveName().disabled).toBe(true));
    await act(async () => finish(ok));
  });
  it("saves with the Enter key too", async () => {
    const { services, repo } = fake();
    show(services);
    await waitFor(() => expect(nameBox().value).toBe("Market by Kith"));
    fireEvent.change(nameBox(), { target: { value: "Kith Store" } });
    fireEvent.submit(nameBox().closest("form") as HTMLFormElement);
    await waitFor(() => expect(repo.saveName).toHaveBeenCalledWith("Kith Store"));
  });
  it("says what the database refused, and keeps what was typed", async () => {
    const { services, repo } = fake();
    repo.saveName.mockResolvedValue({ ok: false, error: "forbidden" });
    show(services);
    await waitFor(() => expect(nameBox().value).toBe("Market by Kith"));
    fireEvent.change(nameBox(), { target: { value: "Kith Store" } });
    fireEvent.click(saveName());
    expect((await screen.findByRole("alert")).textContent).toBe("Hanya admin yang bisa mengubah profil toko. Coba masuk ulang.");
    expect(nameBox().value).toBe("Kith Store");
    expect(toast()).toBe("");
  });
  it("does not save twice while it is saving", async () => {
    const { services, repo } = fake();
    let finish: (r: BrandResult<null>) => void = () => undefined;
    repo.saveName.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    show(services);
    await waitFor(() => expect(nameBox().value).toBe("Market by Kith"));
    fireEvent.change(nameBox(), { target: { value: "Kith Store" } });
    fireEvent.click(saveName());
    fireEvent.submit(nameBox().closest("form") as HTMLFormElement);
    expect(repo.saveName).toHaveBeenCalledTimes(1);
    await act(async () => finish(ok));
  });
});

describe("the logo", () => {
  it("shows the default mark and says there is no logo yet", async () => {
    show(fake().services);
    await waitFor(() => expect(screen.getByRole("button", { name: "Pilih gambar…" })).toBeTruthy());
    expect(screen.getByRole("img", { name: "Logo toko saat ini" }).textContent).toBe("M");
    expect(screen.getByText(/Belum ada logo/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Hapus logo" })).toBeNull();
  });
  it("shows the current logo, and offers to change or remove it", async () => {
    show(fake({ name: "Kith", logoKey: OLD }).services);
    await waitFor(() => expect(screen.getByRole("img", { name: "Logo toko saat ini" }).getAttribute("src")).toBe(`${BASE}/storage/v1/object/public/shop-brand/${OLD}`));
    expect(await screen.findByRole("button", { name: "Ganti logo…" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hapus logo" })).toBeTruthy();
    expect(screen.queryByText(/Belum ada logo/)).toBeNull();
  });
  it("only offers pictures a browser can turn into the logo", async () => {
    show(fake().services);
    await waitFor(() => expect(fileBox().accept).toBe("image/png,image/jpeg,image/webp"));
  });
  it("opens the file picker from the button", async () => {
    show(fake().services);
    const click = vi.spyOn(fileBox(), "click");
    fireEvent.click(await screen.findByRole("button", { name: "Pilih gambar…" }));
    expect(click).toHaveBeenCalled();
  });
  it("uploads the picked picture, tells the admin, shows the new logo, and clears the picker", async () => {
    const { services, storage, repo } = fake();
    show(services);
    await screen.findByRole("button", { name: "Pilih gambar…" });
    await pickFile(png());
    await waitFor(() => expect(toast()).toBe("Logo disimpan"));
    expect(storage.upload).toHaveBeenCalledWith(`logo/${ID}.png`, expect.any(Blob));
    expect(repo.saveLogoKey).toHaveBeenCalledWith(`logo/${ID}.png`);
    await waitFor(() => expect(screen.getByRole("img", { name: "Logo toko saat ini" }).getAttribute("src")).toContain(`logo/${ID}.png`));
    expect(fileBox().value).toBe("");
  });
  it("says the picture is being uploaded, and takes no second one meanwhile", async () => {
    const { services, storage } = fake();
    let finish: () => void = () => undefined;
    storage.upload.mockImplementation(() => new Promise<undefined>((resolve) => { finish = () => resolve(undefined); }));
    show(services);
    await screen.findByRole("button", { name: "Pilih gambar…" });
    await pickFile(png());
    const busy = screen.getByRole("button", { name: "Mengunggah…" }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(fileBox().disabled).toBe(true);
    await act(async () => { finish(); });
    await waitFor(() => expect(screen.getByRole("button", { name: /Ganti logo/ })).toBeTruthy());
  });
  it("takes no second picture while one is uploading, even if the browser still delivers it", async () => {
    const { services, storage } = fake();
    let finish: () => void = () => undefined;
    storage.upload.mockImplementation(() => new Promise<undefined>((resolve) => { finish = () => resolve(undefined); }));
    show(services);
    await screen.findByRole("button", { name: "Pilih gambar…" });
    await pickFile(png());
    await pickFile(png());
    expect(storage.upload).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
  });
  it("empties the picker after each pick, so choosing the same file again is noticed", async () => {
    show(fake().services);
    await screen.findByRole("button", { name: "Pilih gambar…" });
    const assigned: string[] = [];
    Object.defineProperty(fileBox(), "value", { configurable: true, get: () => "", set: (v: string) => { assigned.push(v); } });
    await pickFile(png());
    await waitFor(() => expect(assigned).toEqual([""]));
  });
  it("ignores a picker that was closed without a choice", async () => {
    const { services, storage } = fake();
    show(services);
    await screen.findByRole("button", { name: "Pilih gambar…" });
    await act(async () => { fireEvent.change(fileBox(), { target: { files: [] } }); });
    expect(storage.upload).not.toHaveBeenCalled();
  });
  it.each([
    ["a file of the wrong type", new File([new Uint8Array(5)], "a.svg", { type: "image/svg+xml" }), "Logo harus berupa gambar PNG, JPG, atau WebP."],
    ["a file that is too big", new File([new Uint8Array(11 * 1024 * 1024)], "a.png", { type: "image/png" }), "Gambar terlalu besar. Pilih yang maksimal 10 MB."],
  ])("says so for %s, and stores nothing", async (_why, file, message) => {
    const { services, storage } = fake();
    show(services);
    await screen.findByRole("button", { name: "Pilih gambar…" });
    await pickFile(file);
    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(storage.upload).not.toHaveBeenCalled();
  });
  it("says what the database refused", async () => {
    const { services, repo } = fake();
    repo.saveLogoKey.mockResolvedValue({ ok: false, error: "forbidden" });
    show(services);
    await screen.findByRole("button", { name: "Pilih gambar…" });
    await pickFile(png());
    expect((await screen.findByRole("alert")).textContent).toContain("Hanya admin");
  });
  it("removes the logo, tells the admin, and shows the default mark again", async () => {
    const { services, repo } = fake({ name: "Kith", logoKey: OLD });
    show(services);
    fireEvent.click(await screen.findByRole("button", { name: "Hapus logo" }));
    await waitFor(() => expect(repo.saveLogoKey).toHaveBeenCalledWith(null));
    await waitFor(() => expect(toast()).toBe("Logo dihapus"));
    await waitFor(() => expect(screen.getByRole("img", { name: "Logo toko saat ini" }).textContent).toBe("M"));
  });
  it("says what the database refused when removing, and keeps the logo", async () => {
    const { services, repo } = fake({ name: "Kith", logoKey: OLD });
    repo.saveLogoKey.mockResolvedValue({ ok: false, error: "network" });
    show(services);
    fireEvent.click(await screen.findByRole("button", { name: "Hapus logo" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Tidak bisa terhubung");
    expect(screen.getByRole("img", { name: "Logo toko saat ini" }).getAttribute("src")).toContain(OLD);
  });
  it("clears an earlier message when the admin tries again", async () => {
    const { services, repo } = fake();
    repo.saveName.mockResolvedValueOnce({ ok: false, error: "network" });
    show(services);
    await waitFor(() => expect(nameBox().value).toBe("Market by Kith"));
    fireEvent.change(nameBox(), { target: { value: "Kith Store" } });
    fireEvent.click(saveName());
    await screen.findByRole("alert");
    fireEvent.click(saveName());
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});

describe("loading, and the demo", () => {
  it("says it is loading, or that it could not load with a way to try again", async () => {
    const { services, repo } = fake();
    repo.get.mockImplementationOnce(() => new Promise(() => undefined));
    show(services);
    expect(screen.getByRole("status").textContent).toBe("Memuat profil…");
    cleanup();
    const failing = fake();
    failing.repo.get.mockResolvedValueOnce({ ok: false, error: "network" });
    show(failing.services);
    const note = await screen.findByRole("alert");
    expect(note.textContent).toContain("Profil belum bisa dimuat.");
    fireEvent.click(within(note).getByRole("button", { name: "Coba lagi" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
  it("without a database says the profile needs one, and lets nothing be changed", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    show();
    expect(screen.getByRole("note").textContent).toContain("baru bisa diubah setelah toko terhubung ke Supabase");
    expect(nameBox().disabled).toBe(true);
    expect(saveName().disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Pilih gambar…" }) as HTMLButtonElement).disabled).toBe(true);
    expect(fileBox().disabled).toBe(true);
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("does not show the demo note when there is a database", async () => {
    show(fake().services);
    await screen.findByRole("button", { name: "Pilih gambar…" });
    expect(screen.queryByRole("note")).toBeNull();
  });
});
