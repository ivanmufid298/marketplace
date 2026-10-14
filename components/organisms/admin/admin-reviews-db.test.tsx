// Run with `npm run test:ui`. The admin's review moderation against database-backed reviews (a fake): what the admin sees,
// hiding and showing, and what the admin hears when the database says no. The sample screen is covered at the end.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminReview, AdminReviewServices } from "@/features/reviews";
import { AdminProvider, useAdmin } from "../../providers/admin-provider";
import { ReviewTable } from "./review-table";

const review = (id: number, over: Partial<AdminReview> = {}): AdminReview => ({ id, buyer: `Pembeli ${id}`, product: `Produk ${id}`, rating: 5, text: `Isi ${id}`, verified: true, hidden: false, createdAt: "2026-10-13T00:00:00Z", ...over });

function fake(reviews: AdminReview[], over: Partial<AdminReviewServices["repo"]> = {}) {
  const repo = {
    listAll: vi.fn<AdminReviewServices["repo"]["listAll"]>(async () => ({ ok: true as const, value: reviews })),
    setHidden: vi.fn<AdminReviewServices["repo"]["setHidden"]>(async () => ({ ok: true as const, value: null })),
    ...over,
  };
  return { services: { repo } as AdminReviewServices, repo };
}
function Toast() {
  const { toast } = useAdmin();
  return <p data-testid="toast">{toast}</p>;
}
function show(services?: AdminReviewServices) {
  render(<AdminProvider reviewServices={services}><ReviewTable /><Toast /></AdminProvider>);
}
const rowOf = (text: string) => screen.getByText(text).closest("tr")!;
const toast = () => screen.getByTestId("toast").textContent;

beforeEach(() => { window.localStorage.clear(); vi.unstubAllEnvs(); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); });
afterEach(cleanup);

describe("the review list", () => {
  it("says it is loading, then lists each review with its buyer, product, rating, and text", async () => {
    let finish: (v: { ok: true; value: AdminReview[] }) => void = () => {};
    show(fake([], { listAll: () => new Promise((resolve) => { finish = resolve as never; }) as never }).services);
    expect(screen.getByRole("status").textContent).toBe("Memuat ulasan…");
    finish({ ok: true, value: [review(1, { rating: 4 })] });
    expect(await screen.findByText("Pembeli 1")).toBeTruthy();
    expect(screen.getByText("Produk 1")).toBeTruthy();
    expect(screen.getByText("Isi 1")).toBeTruthy();
    expect(screen.getByText("★★★★☆")).toBeTruthy();
  });
  it("tells a verified buyer from a review an admin entered by hand", async () => {
    show(fake([review(1), review(2, { verified: false })]).services);
    await screen.findByText("Pembeli 1");
    expect(within(rowOf("Isi 1")).getByText("Verified buyer")).toBeTruthy();
    expect(within(rowOf("Isi 2")).getByText("Ditambahkan admin")).toBeTruthy();
  });
  it("shows the real numbers: the average of the visible reviews and how many are hidden", async () => {
    show(fake([review(1, { rating: 5 }), review(2, { rating: 4 }), review(3, { rating: 1, hidden: true })]).services);
    await screen.findByText("Pembeli 1");
    const cards = document.querySelector(".cards")!.textContent!;
    expect(cards).toContain("4,5");
    expect(cards).toContain("Disembunyikan");
    expect(within(document.querySelector(".cards") as HTMLElement).getByText("1")).toBeTruthy();
    expect(cards).not.toContain("Menunggu moderasi");
  });
  it("shows 0,0 and no hidden reviews when there are none", async () => {
    show(fake([]).services);
    await screen.findByText("Belum ada ulasan.");
    expect(document.querySelector(".cards")!.textContent).toContain("0,0");
  });
  it("says there are no reviews, and says nothing matched when a filter hides them all", async () => {
    show(fake([]).services);
    expect(await screen.findByText("Belum ada ulasan.")).toBeTruthy();
    cleanup();
    show(fake([review(1)]).services);
    await screen.findByText("Pembeli 1");
    fireEvent.click(screen.getByRole("button", { name: /Semua status/ }));
    fireEvent.click(screen.getByRole("option", { name: "Disembunyikan" }));
    expect(screen.getByText("Tidak ada ulasan yang cocok dengan filter.")).toBeTruthy();
    expect(screen.queryByText("Belum ada ulasan.")).toBeNull();
  });
  it("shows an error with a retry that reads again", async () => {
    const listAll = vi.fn().mockResolvedValueOnce({ ok: false, error: "network" }).mockResolvedValueOnce({ ok: false, error: "network" }).mockResolvedValue({ ok: true, value: [review(1)] });
    show(fake([], { listAll: listAll as never }).services);
    expect((await screen.findByRole("alert")).textContent).toContain("Ulasan belum bisa dimuat.");
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(await screen.findByText("Pembeli 1")).toBeTruthy();
  });
  it("reads again when the screen opens", async () => {
    const { services, repo } = fake([review(1)]);
    show(services);
    await screen.findByText("Pembeli 1");
    expect((repo.listAll as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("hiding and showing", () => {
  it("hides a visible review in the database and says so", async () => {
    const { services, repo } = fake([review(1)]);
    show(services);
    await screen.findByText("Pembeli 1");
    fireEvent.click(within(rowOf("Isi 1")).getByRole("button", { name: "Sembunyikan" }));
    await waitFor(() => expect(toast()).toBe("Ulasan disembunyikan"));
    expect(repo.setHidden).toHaveBeenCalledWith(1, true);
  });
  it("shows a hidden review again", async () => {
    const { services, repo } = fake([review(2, { hidden: true })]);
    show(services);
    await screen.findByText("Pembeli 2");
    fireEvent.click(within(rowOf("Isi 2")).getByRole("button", { name: "Tampilkan" }));
    await waitFor(() => expect(toast()).toBe("Ulasan ditampilkan"));
    expect(repo.setHidden).toHaveBeenCalledWith(2, false);
  });
  it("tells the admin when the database refuses, and the review keeps its status", async () => {
    const { services } = fake([review(1)], { setHidden: async () => ({ ok: false, error: "forbidden" }) });
    show(services);
    await screen.findByText("Pembeli 1");
    fireEvent.click(within(rowOf("Isi 1")).getByRole("button", { name: "Sembunyikan" }));
    await waitFor(() => expect(toast()).toBe("Akun ini bukan admin, atau ulasannya sudah tidak ada. Muat ulang daftar."));
    expect(within(rowOf("Isi 1")).getByRole("button", { name: "Sembunyikan" })).toBeTruthy();
  });
  it("reflects the list the database returns after a change", async () => {
    const reviews = [review(1)];
    const { services } = fake(reviews, {
      listAll: async () => ({ ok: true as const, value: [...reviews] }),
      setHidden: async () => { reviews[0] = { ...reviews[0], hidden: true }; return { ok: true as const, value: null }; },
    });
    show(services);
    await screen.findByText("Pembeli 1");
    fireEvent.click(within(rowOf("Isi 1")).getByRole("button", { name: "Sembunyikan" }));
    await waitFor(() => expect(within(rowOf("Isi 1")).getByRole("button", { name: "Tampilkan" })).toBeTruthy());
  });
});

describe("the sample screen (no database)", () => {
  it("keeps the sample reviews, the sample numbers, and hiding in this browser", async () => {
    show();
    expect(screen.getByText("Nadia Putri")).toBeTruthy();
    expect(document.querySelector(".cards")!.textContent).toContain("Menunggu moderasi");
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(within(screen.getByText("Produknya sesuai foto, packing rapi dan warnanya cantik banget.").closest("tr")!).getByRole("button", { name: "Sembunyikan" }));
    await waitFor(() => expect(toast()).toBe("Ulasan disembunyikan"));
  });
});
