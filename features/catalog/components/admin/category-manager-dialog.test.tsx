// Run with `npm run test:ui`. The category manager: adding, renaming, switching on and off, deleting, and what it says
// when the database refuses. The repository is an in-memory fake (test-support.ts).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Category } from "../../lib/product-repository";
import { CategoryManagerDialog } from "./category-manager-dialog";
import { category, makeFakeServices, product } from "./test-support";

const rumah = category();
const fashion = category({ id: 2, name: "Fashion", slug: "fashion" });
const lama = category({ id: 3, name: "Lama", slug: "lama", isActive: false });

function open(opts: { categories?: Category[]; counts?: Record<number, number>; products?: ReturnType<typeof product>[] } = {}) {
  const categories = opts.categories ?? [rumah, fashion, lama];
  const fake = makeFakeServices({ categories, products: opts.products ?? [] });
  const handlers = { onAdded: vi.fn(), onChanged: vi.fn(), onRemoved: vi.fn(), onClose: vi.fn(), notify: vi.fn() };
  render(<CategoryManagerDialog services={fake.services} categories={categories} productCounts={opts.counts ?? {}} {...handlers} />);
  return { fake, ...handlers };
}
const row = (name: string) => screen.getByText(name).closest("li")!;

afterEach(cleanup);

describe("the list", () => {
  it("shows each category with its status and how many products use it", () => {
    open({ counts: { 1: 3, 2: 1 } });
    expect(within(row("Rumah")).getByText("3 produk")).toBeTruthy();
    expect(within(row("Fashion")).getByText("1 produk")).toBeTruthy();
    expect(within(row("Lama")).getByText("0 produk")).toBeTruthy();
    expect(within(row("Rumah")).getByText("Aktif")).toBeTruthy();
    expect(within(row("Lama")).getByText("Nonaktif")).toBeTruthy();
  });
  it("says so when there are no categories yet", () => {
    open({ categories: [] });
    expect(screen.getByText("Belum ada kategori. Tambahkan yang pertama di atas.")).toBeTruthy();
  });
  it("closes with the close button, Escape, and a click on the backdrop", () => {
    const { onClose } = open();
    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
  it("does not close when the dialog itself is clicked", () => {
    const { onClose } = open();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("adding", () => {
  it("creates a category, tells the screen, clears the field, and confirms", async () => {
    const { fake, onAdded, notify } = open();
    const add = screen.getByRole("button", { name: "Tambah kategori" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Nama kategori baru"), { target: { value: "  Kecantikan  " } });
    expect(add.disabled).toBe(false);
    fireEvent.click(add);
    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(fake.repo.createCategory).toHaveBeenCalledWith("Kecantikan");
    expect(onAdded.mock.calls[0][0]).toMatchObject({ name: "Kecantikan" });
    expect((screen.getByLabelText("Nama kategori baru") as HTMLInputElement).value).toBe("");
    expect(notify).toHaveBeenCalledWith("Kategori ditambahkan");
  });
  it("shows the reason and keeps the text when the name is already used", async () => {
    const { fake, onAdded } = open();
    fake.repo.createCategory.mockResolvedValueOnce({ ok: false, error: { kind: "categoryNameTaken" } } as never);
    fireEvent.change(screen.getByLabelText("Nama kategori baru"), { target: { value: "Rumah" } });
    fireEvent.click(screen.getByRole("button", { name: "Tambah kategori" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Nama kategori itu sudah ada.");
    expect(onAdded).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Nama kategori baru") as HTMLInputElement).value).toBe("Rumah");
  });
  it("refuses a name that is too long without asking the database", () => {
    const { fake } = open();
    fireEvent.change(screen.getByLabelText("Nama kategori baru"), { target: { value: "x".repeat(61) } });
    fireEvent.click(screen.getByRole("button", { name: "Tambah kategori" }));
    expect(screen.getByRole("alert").textContent).toBe("Nama kategori maksimal 60 karakter.");
    expect(fake.repo.createCategory).not.toHaveBeenCalled();
  });
  it("accepts a name of exactly the limit", async () => {
    const { fake } = open();
    fireEvent.change(screen.getByLabelText("Nama kategori baru"), { target: { value: "x".repeat(60) } });
    fireEvent.click(screen.getByRole("button", { name: "Tambah kategori" }));
    await waitFor(() => expect(fake.repo.createCategory).toHaveBeenCalledTimes(1));
  });
  it("adds on Enter too", async () => {
    const { fake } = open();
    fireEvent.change(screen.getByLabelText("Nama kategori baru"), { target: { value: "Dapur" } });
    fireEvent.submit(screen.getByLabelText("Nama kategori baru").closest("form")!);
    await waitFor(() => expect(fake.repo.createCategory).toHaveBeenCalledWith("Dapur"));
  });
});

describe("renaming", () => {
  it("renames, tells the screen, and closes the edit field", async () => {
    const { fake, onChanged, notify } = open();
    fireEvent.click(screen.getByRole("button", { name: "Ubah nama Fashion" }));
    const input = screen.getByLabelText("Ubah nama Fashion") as HTMLInputElement;
    expect(input.value).toBe("Fashion");
    fireEvent.change(input, { target: { value: "Busana" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(fake.repo.updateCategory).toHaveBeenCalledWith(2, { name: "Busana" });
    expect(onChanged.mock.calls[0][0]).toMatchObject({ id: 2, name: "Busana" });
    expect(notify).toHaveBeenCalledWith("Nama kategori diperbarui");
    expect(screen.queryByRole("textbox", { name: "Ubah nama Fashion" })).toBeNull();
  });
  it("does nothing when the name is unchanged", () => {
    const { fake } = open();
    fireEvent.click(screen.getByRole("button", { name: "Ubah nama Fashion" }));
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    expect(fake.repo.updateCategory).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Simpan" })).toBeNull();
  });
  it("asks for a name when the field is emptied, and for a shorter one when it is too long", () => {
    const { fake } = open();
    fireEvent.click(screen.getByRole("button", { name: "Ubah nama Fashion" }));
    const input = screen.getByLabelText("Ubah nama Fashion");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    expect(screen.getByRole("alert").textContent).toBe("Nama kategori wajib diisi.");
    fireEvent.change(input, { target: { value: "x".repeat(61) } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    expect(screen.getByRole("alert").textContent).toBe("Nama kategori maksimal 60 karakter.");
    expect(fake.repo.updateCategory).not.toHaveBeenCalled();
  });
  it("keeps the edit field open and explains when the new name is taken", async () => {
    const { onChanged } = open();
    fireEvent.click(screen.getByRole("button", { name: "Ubah nama Fashion" }));
    fireEvent.change(screen.getByLabelText("Ubah nama Fashion"), { target: { value: "rumah" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Nama kategori itu sudah ada.");
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Ubah nama Fashion")).toBeTruthy();
  });
  it("cancels without saving", () => {
    const { fake } = open();
    fireEvent.click(screen.getByRole("button", { name: "Ubah nama Fashion" }));
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(screen.queryByRole("textbox", { name: "Ubah nama Fashion" })).toBeNull();
    expect(fake.repo.updateCategory).not.toHaveBeenCalled();
  });
});

describe("switching on and off", () => {
  it("deactivates an active category", async () => {
    const { fake, onChanged, notify } = open();
    fireEvent.click(within(row("Fashion")).getByRole("button", { name: "Nonaktifkan" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(fake.repo.updateCategory).toHaveBeenCalledWith(2, { isActive: false });
    expect(notify).toHaveBeenCalledWith("Kategori dinonaktifkan");
  });
  it("activates an inactive category", async () => {
    const { fake, onChanged, notify } = open();
    fireEvent.click(within(row("Lama")).getByRole("button", { name: "Aktifkan" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(fake.repo.updateCategory).toHaveBeenCalledWith(3, { isActive: true });
    expect(notify).toHaveBeenCalledWith("Kategori diaktifkan");
  });
  it("explains and changes nothing when the database refuses", async () => {
    const { fake, onChanged, notify } = open();
    fake.repo.updateCategory.mockResolvedValueOnce({ ok: false, error: { kind: "forbidden" } } as never);
    fireEvent.click(within(row("Fashion")).getByRole("button", { name: "Nonaktifkan" }));
    expect((await screen.findByRole("alert")).textContent).toContain("tidak punya izin");
    expect(onChanged).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("deleting", () => {
  it("cannot delete a category that products use, and says why", () => {
    open({ counts: { 1: 2 } });
    const button = within(row("Rumah")).getByRole("button", { name: "Hapus Rumah" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe("Masih dipakai produk. Nonaktifkan saja, atau pindahkan produknya dulu.");
  });
  it("asks before deleting, then deletes", async () => {
    const { fake, onRemoved, notify } = open();
    fireEvent.click(screen.getByRole("button", { name: "Hapus Lama" }));
    expect(fake.repo.deleteCategory).not.toHaveBeenCalled();
    expect(screen.getByText("Hapus “Lama”?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ya, hapus" }));
    await waitFor(() => expect(onRemoved).toHaveBeenCalledWith(3));
    expect(fake.repo.deleteCategory).toHaveBeenCalledWith(3);
    expect(notify).toHaveBeenCalledWith("Kategori dihapus");
  });
  it("backs out of the question without deleting", () => {
    const { fake } = open();
    fireEvent.click(screen.getByRole("button", { name: "Hapus Lama" }));
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(screen.queryByText("Hapus “Lama”?")).toBeNull();
    expect(screen.getByRole("button", { name: "Hapus Lama" })).toBeTruthy();
    expect(fake.repo.deleteCategory).not.toHaveBeenCalled();
  });
  it("keeps the category and explains when the database says it is still in use", async () => {
    // The screen's count can be stale, so the database has the last word.
    const { onRemoved, notify } = open({ products: [product({ categoryId: 3 })] });
    fireEvent.click(screen.getByRole("button", { name: "Hapus Lama" }));
    fireEvent.click(screen.getByRole("button", { name: "Ya, hapus" }));
    expect((await screen.findByRole("alert")).textContent).toContain("masih dipakai produk");
    expect(onRemoved).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(screen.queryByText("Hapus “Lama”?")).toBeNull();
  });
});

describe("one action at a time", () => {
  it("disables the other buttons while a request is running", async () => {
    const { fake } = open();
    let finish: (v: unknown) => void = () => {};
    fake.repo.updateCategory.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }) as never);
    fireEvent.click(within(row("Fashion")).getByRole("button", { name: "Nonaktifkan" }));
    await waitFor(() => expect((within(row("Rumah")).getByRole("button", { name: "Nonaktifkan" }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.keyDown(document, { key: "Escape" });
    finish({ ok: true, value: { ...fashion, isActive: false } });
    await waitFor(() => expect((within(row("Rumah")).getByRole("button", { name: "Nonaktifkan" }) as HTMLButtonElement).disabled).toBe(false));
  });
});
