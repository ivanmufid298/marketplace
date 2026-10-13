// Run with `npm run test:ui`. The admin product list: loading, filters, switching a product on and off, and opening
// the form. The repository, storage, and resize are in-memory fakes (test-support.ts).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminProductsView } from "./admin-products-view";
import { category, makeFakeServices, photo, product, type FakeServices } from "./test-support";

const mug = product({ id: 1, name: "Mug Blush Daily", categoryId: 1, categoryName: "Rumah", status: "active", price: 89000, compareAtPrice: 119000 });
const tote = product({ id: 2, name: "Tote Canvas", categoryId: 2, categoryName: "Fashion", status: "draft", price: 129000, stock: 1, weightGram: 450 });
const lamp = product({ id: 3, name: "Lampu Meja", categoryId: 1, categoryName: "Rumah", status: "archived", price: 329000 });
const categories = [category(), category({ id: 2, name: "Fashion", slug: "fashion" })];

function show(fake: FakeServices) {
  const notify = vi.fn();
  render(<AdminProductsView services={fake.services} notify={notify} />);
  return { notify };
}
const seeded = () => makeFakeServices({ products: [mug, tote, lamp], categories });
const names = () => screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent);

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

describe("loading the list", () => {
  it("shows a loading message, then every product", async () => {
    show(seeded());
    expect(screen.getByRole("status").textContent).toBe("Memuat produk…");
    await waitFor(() => expect(names()).toEqual(["Mug Blush Daily", "Tote Canvas", "Lampu Meja"]));
  });

  it("shows price, old price, category, stock, weight, and status of a product", async () => {
    show(seeded());
    await screen.findByText("Mug Blush Daily");
    const card = screen.getByText("Mug Blush Daily").closest("article")!;
    const inCard = within(card);
    expect(inCard.getByText("Rp89.000")).toBeTruthy();
    expect(inCard.getByText("Rp119.000")).toBeTruthy();
    expect(inCard.getByText("Rumah")).toBeTruthy();
    expect(inCard.getByText("Stok 5")).toBeTruthy();
    expect(inCard.getByText("350 g")).toBeTruthy();
    expect(inCard.getByText("Aktif")).toBeTruthy();
  });

  it("says there are no products yet, and offers to add one", async () => {
    show(makeFakeServices({ products: [], categories }));
    expect(await screen.findByText("Belum ada produk. Tambahkan produk pertamamu.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "＋ Tambah produk" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("will not open the form while the list is still loading", () => {
    show(seeded());
    expect((screen.getByRole("button", { name: "＋ Tambah produk" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("explains a load error and tries again on request", async () => {
    const fake = seeded();
    fake.repo.listProducts.mockResolvedValueOnce({ ok: false, error: { kind: "network" } } as never);
    show(fake);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Produk belum bisa dimuat.");
    expect(alert.textContent).toContain("Tidak bisa terhubung");
    fireEvent.click(within(alert).getByRole("button", { name: "Coba lagi" }));
    await waitFor(() => expect(names()).toHaveLength(3));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reports a category load error the same way", async () => {
    const fake = seeded();
    fake.repo.listCategories.mockResolvedValueOnce({ ok: false, error: { kind: "forbidden" } } as never);
    show(fake);
    expect((await screen.findByRole("alert")).textContent).toContain("tidak punya izin");
  });

  it("shows the cover photo at card size", async () => {
    const withPhoto = product({ id: 1, name: "Mug", photos: [photo(5, { objectKey: "products/1/abc12345.webp", alt: "Mug biru" })] });
    show(makeFakeServices({ products: [withPhoto], categories }));
    const img = (await screen.findByRole("img", { name: "Mug biru" })) as HTMLImageElement;
    expect(img.src).toBe("https://cdn.test/products/1/abc12345-400.webp");
  });

  it("says a product has no photo yet", async () => {
    show(makeFakeServices({ products: [mug], categories }));
    expect(await screen.findByText("Belum ada foto")).toBeTruthy();
  });

  it("counts photos only when there is more than one", async () => {
    const many = product({ id: 1, photos: [photo(1), photo(2), photo(3)] });
    show(makeFakeServices({ products: [many], categories }));
    expect(await screen.findByText("3 foto")).toBeTruthy();
  });
});

describe("filters", () => {
  it("searches by name, ignoring case", async () => {
    show(seeded());
    await screen.findByText("Tote Canvas");
    fireEvent.change(screen.getByPlaceholderText("Cari produk…"), { target: { value: "  tOtE " } });
    expect(names()).toEqual(["Tote Canvas"]);
  });

  it("filters by category", async () => {
    show(seeded());
    await screen.findByText("Tote Canvas");
    fireEvent.click(screen.getByRole("option", { name: "Fashion" }));
    expect(names()).toEqual(["Tote Canvas"]);
  });

  it("filters by status, and archived products are still reachable", async () => {
    show(seeded());
    await screen.findByText("Tote Canvas");
    fireEvent.click(screen.getByRole("option", { name: "Arsip" }));
    expect(names()).toEqual(["Lampu Meja"]);
    fireEvent.click(screen.getByRole("option", { name: "Draf" }));
    expect(names()).toEqual(["Tote Canvas"]);
  });

  it("combines search, category, and status", async () => {
    show(seeded());
    await screen.findByText("Tote Canvas");
    fireEvent.click(screen.getByRole("option", { name: "Rumah" }));
    fireEvent.click(screen.getByRole("option", { name: "Aktif" }));
    expect(names()).toEqual(["Mug Blush Daily"]);
    fireEvent.change(screen.getByPlaceholderText("Cari produk…"), { target: { value: "lampu" } });
    expect(screen.getByText("Tidak ada produk yang cocok dengan pencarianmu.")).toBeTruthy();
  });
});

describe("switching a product on and off", () => {
  const cardOf = (name: string) => within(screen.getByText(name).closest("article")!);

  it("hides an active product and says so", async () => {
    const fake = seeded();
    const { notify } = show(fake);
    await screen.findByText("Mug Blush Daily");
    fireEvent.click(cardOf("Mug Blush Daily").getByRole("button", { name: "Nonaktifkan" }));
    await waitFor(() => expect(cardOf("Mug Blush Daily").getByText("Draf")).toBeTruthy());
    expect(fake.repo.setStatus).toHaveBeenCalledWith(1, "draft");
    expect(notify).toHaveBeenCalledWith("Produk dinonaktifkan");
    expect(cardOf("Mug Blush Daily").getByRole("button", { name: "Aktifkan" })).toBeTruthy();
  });

  it("puts a draft or archived product on sale", async () => {
    const fake = seeded();
    const { notify } = show(fake);
    await screen.findByText("Lampu Meja");
    fireEvent.click(cardOf("Lampu Meja").getByRole("button", { name: "Aktifkan" }));
    await waitFor(() => expect(fake.repo.setStatus).toHaveBeenCalledWith(3, "active"));
    await waitFor(() => expect(cardOf("Lampu Meja").getByText("Aktif")).toBeTruthy());
    expect(notify).toHaveBeenCalledWith("Produk diaktifkan");
  });

  it("keeps the old state and explains when the change is refused", async () => {
    const fake = seeded();
    fake.repo.setStatus.mockResolvedValueOnce({ ok: false, error: { kind: "forbidden" } } as never);
    const { notify } = show(fake);
    await screen.findByText("Mug Blush Daily");
    fireEvent.click(cardOf("Mug Blush Daily").getByRole("button", { name: "Nonaktifkan" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("Akun ini tidak punya izin mengubah produk. Masuk sebagai admin."));
    expect(cardOf("Mug Blush Daily").getByText("Aktif")).toBeTruthy();
  });

  it("locks the buttons of a product while its change is in flight, and only one at a time", async () => {
    const fake = seeded();
    let release!: (v: unknown) => void;
    fake.repo.setStatus.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }) as never);
    show(fake);
    await screen.findByText("Mug Blush Daily");
    fireEvent.click(cardOf("Mug Blush Daily").getByRole("button", { name: "Nonaktifkan" }));
    expect((cardOf("Mug Blush Daily").getByRole("button", { name: "Ubah" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(cardOf("Tote Canvas").getByRole("button", { name: "Aktifkan" }));
    expect(fake.repo.setStatus).toHaveBeenCalledTimes(1);
    release({ ok: true, value: { ...mug, status: "draft" } });
    await waitFor(() => expect((cardOf("Mug Blush Daily").getByRole("button", { name: "Ubah" }) as HTMLButtonElement).disabled).toBe(false));
  });
});

describe("the form", () => {
  it("opens empty from the add button", async () => {
    show(seeded());
    await screen.findByText("Mug Blush Daily");
    fireEvent.click(screen.getByRole("button", { name: "＋ Tambah produk" }));
    expect(screen.getByRole("dialog", { name: "Tambah produk" })).toBeTruthy();
    expect((screen.getByLabelText("Nama produk") as HTMLInputElement).value).toBe("");
  });

  it("opens filled in from a card's edit button", async () => {
    show(seeded());
    await screen.findByText("Tote Canvas");
    fireEvent.click(within(screen.getByText("Tote Canvas").closest("article")!).getByRole("button", { name: "Ubah" }));
    expect(screen.getByRole("dialog", { name: "Ubah produk" })).toBeTruthy();
    expect((screen.getByLabelText("Nama produk") as HTMLInputElement).value).toBe("Tote Canvas");
    expect((screen.getByLabelText("Berat (gram)") as HTMLInputElement).value).toBe("450");
  });

  it("adds a created product to the list and closes", async () => {
    const fake = seeded();
    const { notify } = show(fake);
    await screen.findByText("Mug Blush Daily");
    fireEvent.click(screen.getByRole("button", { name: "＋ Tambah produk" }));
    fireEvent.change(screen.getByLabelText("Nama produk"), { target: { value: "Cermin Rotan" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("option", { name: "Rumah" }));
    fireEvent.change(screen.getByLabelText("Harga (Rp)"), { target: { value: "250.000" } });
    fireEvent.change(screen.getByLabelText("Berat (gram)"), { target: { value: "900" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(names()).toEqual(["Mug Blush Daily", "Tote Canvas", "Lampu Meja", "Cermin Rotan"]);
    expect(notify).toHaveBeenCalledWith("Produk ditambahkan");
  });

  it("updates an edited product in place", async () => {
    show(seeded());
    await screen.findByText("Tote Canvas");
    fireEvent.click(within(screen.getByText("Tote Canvas").closest("article")!).getByRole("button", { name: "Ubah" }));
    fireEvent.change(screen.getByLabelText("Nama produk"), { target: { value: "Tote Kanvas Besar" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(names()).toEqual(["Mug Blush Daily", "Tote Kanvas Besar", "Lampu Meja"]);
  });

  it("includes a category created in the form in the list's category filter", async () => {
    show(seeded());
    await screen.findByText("Mug Blush Daily");
    fireEvent.click(screen.getByRole("button", { name: "＋ Tambah produk" }));
    fireEvent.change(screen.getByLabelText("Kategori baru"), { target: { value: "Kecantikan" } });
    fireEvent.click(screen.getByRole("button", { name: "Tambah kategori" }));
    await waitFor(() => expect((screen.getByLabelText("Kategori baru") as HTMLInputElement).value).toBe(""));
    // The new category is offered in the form and already chosen for this product.
    const inForm = within(screen.getByRole("dialog")).getByRole("option", { name: "Kecantikan" });
    expect(inForm.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(screen.getAllByRole("option", { name: "Kecantikan" }).length).toBeGreaterThan(0);
  });

  it("closes without changing the list when cancelled", async () => {
    show(seeded());
    await screen.findByText("Mug Blush Daily");
    fireEvent.click(screen.getByRole("button", { name: "＋ Tambah produk" }));
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(names()).toHaveLength(3);
  });
});
