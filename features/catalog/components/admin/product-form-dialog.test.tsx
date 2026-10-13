// Run with `npm run test:ui`. The product form as the admin uses it: typing, picking photos, saving, and what happens
// when a step fails. The repository, storage, and resize are in-memory fakes (test-support.ts).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResizeFailure } from "../../lib/resize-image";
import { category, makeFakeServices, photo, product, resizedPhoto, type FakeServices } from "./test-support";
import { ProductFormDialog } from "./product-form-dialog";

const file = (name = "foto.jpg") => new File([new Uint8Array(10)], name, { type: "image/jpeg" });
const typeInto = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const pickCategory = (name: string) => fireEvent.click(within(screen.getByRole("dialog")).getByRole("option", { name }));
const clickSave = () => fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
const choosePhotos = (...files: File[]) => fireEvent.change(screen.getByLabelText("Tambah foto"), { target: { files } });

function fillValid() {
  typeInto("Nama produk", "Mug Baru");
  pickCategory("Rumah");
  typeInto("Harga (Rp)", "89000");
  typeInto("Stok", "5");
  typeInto("Berat (gram)", "350");
}

function open(fake: FakeServices, props: Partial<Parameters<typeof ProductFormDialog>[0]> = {}) {
  const spies = { onSaved: vi.fn(), onClose: vi.fn(), notify: vi.fn() };
  render(<ProductFormDialog services={fake.services} product={null} categories={fake.state().categories} {...spies} {...props} />);
  return spies;
}

let previews = 0;
beforeEach(() => {
  previews = 0;
  URL.createObjectURL = vi.fn(() => `blob:preview-${++previews}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

describe("a new product", () => {
  it("opens empty with the right title", () => {
    open(makeFakeServices());
    expect(screen.getByRole("dialog", { name: "Tambah produk" })).toBeTruthy();
    expect((screen.getByLabelText("Nama produk") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Stok") as HTMLInputElement).value).toBe("0");
  });

  it("shows what is missing and saves nothing", () => {
    const fake = makeFakeServices();
    open(fake);
    clickSave();
    expect(screen.getAllByText("Wajib diisi.")).toHaveLength(4); // name, category, price, weight
    expect(fake.repo.createProduct).not.toHaveBeenCalled();
  });

  it("clears an error as soon as the field is edited", () => {
    open(makeFakeServices());
    clickSave();
    typeInto("Nama produk", "Mug");
    expect(screen.getAllByText("Wajib diisi.")).toHaveLength(3);
  });

  it("explains a compare-at price that is not higher than the price", () => {
    open(makeFakeServices());
    fillValid();
    typeInto("Harga coret (Rp)", "50000");
    clickSave();
    expect(screen.getByText("Harus lebih tinggi dari harga.")).toBeTruthy();
  });

  it("rejects a weight with a decimal comma", () => {
    open(makeFakeServices());
    fillValid();
    typeInto("Berat (gram)", "0,5");
    clickSave();
    expect(screen.getByText("Isi dengan angka bulat, tanpa koma.")).toBeTruthy();
  });

  it("creates the product, tells the page, and closes", async () => {
    const fake = makeFakeServices();
    const { onSaved, onClose, notify } = open(fake);
    fillValid();
    clickSave();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fake.repo.createProduct).toHaveBeenCalledWith({
      name: "Mug Baru", description: "", categoryId: 1, price: 89000, compareAtPrice: null, stock: 5, weightGram: 350, badge: null, status: "draft",
    });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ name: "Mug Baru" }), true);
    expect(notify).toHaveBeenCalledWith("Produk ditambahkan");
  });

  it("reads a price written with Rp and dots", async () => {
    const fake = makeFakeServices();
    const { onClose } = open(fake);
    fillValid();
    typeInto("Harga (Rp)", "Rp 1.250.000");
    clickSave();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fake.repo.createProduct).toHaveBeenCalledWith(expect.objectContaining({ price: 1250000 }));
  });

  it("keeps the form open and says why when the database refuses", async () => {
    const fake = makeFakeServices();
    fake.repo.createProduct.mockResolvedValueOnce({ ok: false, error: { kind: "forbidden" } } as never);
    const { onClose, onSaved } = open(fake);
    fillValid();
    clickSave();
    expect((await screen.findByRole("alert")).textContent).toBe("Akun ini tidak punya izin mengubah produk. Masuk sebagai admin.");
    expect(onClose).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Simpan" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("says so when the network is down", async () => {
    const fake = makeFakeServices();
    fake.repo.createProduct.mockResolvedValueOnce({ ok: false, error: { kind: "network" } } as never);
    open(fake);
    fillValid();
    clickSave();
    expect((await screen.findByRole("alert")).textContent).toBe("Tidak bisa terhubung. Periksa koneksi lalu coba lagi.");
  });

  it("disables saving while it saves and ignores a second click", async () => {
    const fake = makeFakeServices();
    let release!: (v: unknown) => void;
    fake.repo.createProduct.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }) as never);
    open(fake);
    fillValid();
    clickSave();
    const button = await screen.findByRole("button", { name: "Menyimpan…" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(button.closest("form")!);
    expect(fake.repo.createProduct).toHaveBeenCalledTimes(1);
    release({ ok: true, value: product({ id: 7 }) });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Menyimpan…" })).toBeNull());
  });
});

describe("categories", () => {
  it("has no way to create a category in the form; that is the category manager's job", () => {
    open(makeFakeServices());
    expect(screen.queryByLabelText("Kategori baru")).toBeNull();
    expect(screen.queryByRole("button", { name: "Tambah kategori" })).toBeNull();
  });

  it("points the admin to the category manager when there are no categories", () => {
    open(makeFakeServices({ categories: [] }));
    expect(screen.getByText("Belum ada kategori. Tutup form ini, lalu buat lewat tombol Kelola kategori.")).toBeTruthy();
  });
});

describe("photos", () => {
  it("resizes a picked photo and shows it as the cover", async () => {
    const fake = makeFakeServices();
    open(fake);
    choosePhotos(file());
    expect(await screen.findByText("Sampul")).toBeTruthy();
    expect(fake.resize).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Baru")).toBeTruthy();
    expect((document.querySelector("li img") as HTMLImageElement).src).toBe("blob:preview-1");
  });

  it("drops a picked photo and releases its preview", async () => {
    const fake = makeFakeServices();
    open(fake);
    choosePhotos(file());
    await screen.findByText("Baru");
    fireEvent.click(screen.getByRole("button", { name: "Hapus foto" }));
    expect(screen.queryByText("Baru")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
  });

  it("releases previews when the form closes", async () => {
    const fake = makeFakeServices();
    open(fake);
    choosePhotos(file());
    await screen.findByText("Baru");
    cleanup();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
  });

  it("shows the reason when a photo cannot be used", async () => {
    const fake = makeFakeServices();
    fake.resize.mockRejectedValueOnce(new ResizeFailure("type"));
    open(fake);
    choosePhotos(file("a.gif"));
    expect(await screen.findByText("Gunakan foto JPEG, PNG, atau WebP.")).toBeTruthy();
  });

  it("keeps the good photos when one in a batch fails", async () => {
    const fake = makeFakeServices();
    fake.resize.mockResolvedValueOnce(resizedPhoto()).mockRejectedValueOnce(new ResizeFailure("unreadable"));
    open(fake);
    choosePhotos(file("a.jpg"), file("b.jpg"));
    expect(await screen.findByText("Foto tidak bisa dibaca.")).toBeTruthy();
    expect(screen.getAllByText("Baru")).toHaveLength(1);
  });

  it("stops at eight photos and says so", async () => {
    const fake = makeFakeServices();
    open(fake);
    choosePhotos(...Array.from({ length: 9 }, (_, i) => file(`f${i}.jpg`)));
    expect(await screen.findByText("Maksimal 8 foto per produk.")).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText("Baru")).toHaveLength(8));
    expect(fake.resize).toHaveBeenCalledTimes(8);
    expect((screen.getByRole("button", { name: "Tambah foto" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("warns about a photo that is small", async () => {
    const fake = makeFakeServices();
    fake.resize.mockResolvedValueOnce(resizedPhoto(600));
    open(fake);
    choosePhotos(file());
    expect(await screen.findByText("Foto ini kecil (600 px). Sebaiknya lebar minimal 800 px.")).toBeTruthy();
  });

  it("uploads every size of each new photo when the product is saved", async () => {
    const fake = makeFakeServices();
    const { onClose } = open(fake);
    fillValid();
    choosePhotos(file());
    await screen.findByText("Baru");
    clickSave();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fake.storage.upload).toHaveBeenCalledTimes(3);
    expect(fake.repo.addPhoto).toHaveBeenCalledWith(100, expect.objectContaining({ alt: "Mug Baru", sortOrder: 0, width: 1600, height: 1200 }));
  });

  it("will not save while a photo is still being processed", async () => {
    const fake = makeFakeServices();
    let release!: (v: unknown) => void;
    fake.resize.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }) as never);
    open(fake);
    fillValid();
    choosePhotos(file());
    expect(await screen.findByText("Memproses foto…")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Simpan" }) as HTMLButtonElement).disabled).toBe(true);
    release(resizedPhoto());
    await waitFor(() => expect((screen.getByRole("button", { name: "Simpan" }) as HTMLButtonElement).disabled).toBe(false));
  });
});

describe("editing a product", () => {
  // Photo keys live under the product that owns them; removing a photo refuses any other folder.
  const own = (id: number) => photo(id, { objectKey: `products/9/photo${id}aaaa.webp` });
  const existing = product({ id: 9, name: "Mug Lama", price: 120000, compareAtPrice: 150000, badge: "Baru", photos: [own(1), own(2), own(3)] });

  it("opens filled in", () => {
    open(makeFakeServices({ products: [existing] }), { product: existing });
    expect(screen.getByRole("dialog", { name: "Ubah produk" })).toBeTruthy();
    expect((screen.getByLabelText("Nama produk") as HTMLInputElement).value).toBe("Mug Lama");
    expect((screen.getByLabelText("Harga (Rp)") as HTMLInputElement).value).toBe("120000");
    expect((screen.getByLabelText("Harga coret (Rp)") as HTMLInputElement).value).toBe("150000");
    expect((screen.getByLabelText("Label") as HTMLInputElement).value).toBe("Baru");
  });

  it("shows saved photos at the small size and marks the first as the cover", () => {
    open(makeFakeServices({ products: [existing] }), { product: existing });
    const images = screen.getAllByRole("img") as HTMLImageElement[];
    expect(images).toHaveLength(3);
    expect(images[0].src).toBe("https://cdn.test/products/9/photo1aaaa-400.webp");
    expect(screen.getAllByText("Sampul")).toHaveLength(1);
  });

  it("updates rather than creates, and leaves the page informed", async () => {
    const fake = makeFakeServices({ products: [existing] });
    const { onSaved, onClose, notify } = open(fake, { product: existing });
    typeInto("Nama produk", "Mug Baru Banget");
    clickSave();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fake.repo.updateProduct).toHaveBeenCalledWith(9, expect.objectContaining({ name: "Mug Baru Banget" }));
    expect(fake.repo.createProduct).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }), false);
    expect(notify).toHaveBeenCalledWith("Produk diperbarui");
  });

  it("removes a photo's row and files when it is deleted and the form saved", async () => {
    const fake = makeFakeServices({ products: [existing] });
    const { onClose } = open(fake, { product: existing });
    fireEvent.click(screen.getAllByRole("button", { name: "Hapus foto" })[1]);
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(fake.repo.removePhoto).not.toHaveBeenCalled(); // nothing happens until Simpan
    clickSave();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fake.repo.removePhoto).toHaveBeenCalledWith(2);
    expect(fake.storage.remove).toHaveBeenCalledWith(["products/9/photo2aaaa-400.webp", "products/9/photo2aaaa-800.webp", "products/9/photo2aaaa-1600.webp"]);
  });

  it("saves a new order of photos", async () => {
    const fake = makeFakeServices({ products: [existing] });
    const { onClose } = open(fake, { product: existing });
    fireEvent.click(screen.getAllByRole("button", { name: "Geser ke belakang" })[0]);
    clickSave();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fake.repo.setPhotoOrder).toHaveBeenCalledWith([2, 1, 3]);
  });

  it("does not offer to move the first photo earlier or the last one later", () => {
    open(makeFakeServices({ products: [existing] }), { product: existing });
    expect((screen.getAllByRole("button", { name: "Geser ke depan" })[0] as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getAllByRole("button", { name: "Geser ke belakang" })[2] as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not touch the order or any photo when only the name changed", async () => {
    const fake = makeFakeServices({ products: [existing] });
    const { onClose } = open(fake, { product: existing });
    typeInto("Nama produk", "Lain");
    clickSave();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fake.repo.setPhotoOrder).not.toHaveBeenCalled();
    expect(fake.repo.removePhoto).not.toHaveBeenCalled();
    expect(fake.repo.addPhoto).not.toHaveBeenCalled();
  });
});

describe("when a photo step fails after the product is saved", () => {
  it("stays open on the saved product and a second save updates it instead of creating another", async () => {
    const fake = makeFakeServices();
    const { onSaved, onClose, notify } = open(fake);
    fillValid();
    choosePhotos(file());
    await screen.findByText("Baru");
    fake.storage.upload.mockRejectedValueOnce(new Error("down"));

    clickSave();
    expect(await screen.findByText("Produk tersimpan, tetapi 1 dari 1 foto belum terunggah. Buka produknya lalu tambahkan lagi.")).toBeTruthy();
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 100 }), true);
    expect(notify).toHaveBeenCalledWith("Produk ditambahkan");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Ubah produk" })).toBeTruthy();
    expect(screen.getByText("Baru")).toBeTruthy(); // the photo is still there to retry

    clickSave(); // the upload works this time
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fake.repo.createProduct).toHaveBeenCalledTimes(1);
    expect(fake.repo.updateProduct).toHaveBeenCalledWith(100, expect.anything());
    expect(fake.repo.addPhoto).toHaveBeenCalledTimes(1);
  });

  it("does not retry a photo that was already saved", async () => {
    const fake = makeFakeServices();
    fake.resize.mockResolvedValue(resizedPhoto());
    const { onClose } = open(fake);
    fillValid();
    choosePhotos(file("a.jpg"), file("b.jpg"));
    await waitFor(() => expect(screen.getAllByText("Baru")).toHaveLength(2));
    // The first photo's three sizes upload, then the second photo's first upload fails.
    fake.storage.upload.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("down"));

    clickSave();
    expect(await screen.findByText("Produk tersimpan, tetapi 1 dari 2 foto belum terunggah. Buka produknya lalu tambahkan lagi.")).toBeTruthy();
    expect(fake.repo.addPhoto).toHaveBeenCalledTimes(1);

    clickSave();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fake.repo.addPhoto).toHaveBeenCalledTimes(2); // only the second photo was added the second time
  });
});

describe("closing", () => {
  it("closes with Escape", () => {
    const { onClose } = open(makeFakeServices());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes from the Batal and close buttons and from the backdrop", () => {
    const { onClose } = open(makeFakeServices());
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));
    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("does not close from a click inside the dialog", () => {
    const { onClose } = open(makeFakeServices());
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not close with Escape while it is saving", async () => {
    const fake = makeFakeServices();
    let release!: (v: unknown) => void;
    fake.repo.createProduct.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }) as never);
    const { onClose } = open(fake);
    fillValid();
    clickSave();
    await screen.findByRole("button", { name: "Menyimpan…" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    fake.repo.getProduct.mockResolvedValueOnce({ ok: true, value: product({ id: 7 }) } as never);
    release({ ok: true, value: product({ id: 7 }) });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe("categories list in the form", () => {
  it("offers only active categories, plus the one already chosen", () => {
    const fake = makeFakeServices({ categories: [category(), category({ id: 2, name: "Lama", slug: "lama", isActive: false })] });
    const chosen = product({ categoryId: 2, categoryName: "Lama" });
    open(fake, { product: chosen, categories: fake.state().categories });
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("option", { name: "Lama" })).toBeTruthy();
    expect(dialog.getByRole("option", { name: "Rumah" })).toBeTruthy();
  });
});
