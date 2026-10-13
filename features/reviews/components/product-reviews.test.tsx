// Run with `npm run test:ui`. The review section: what it shows with and without reviews, and while loading.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProductReviews as Data, ReviewsResult } from "../lib/types";
import { NO_REVIEWS } from "../lib/types";
import { ProductReviews } from "./product-reviews";
import { ProductReviewsLoader } from "./product-reviews-loader";

const now = Date.now();
const iso = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString();
const review = (id: number, over: Partial<Data["reviews"][number]> = {}) => ({ id, author: `Pembeli ${id}`, rating: 5, body: `Isi ${id}`, verified: false, createdAt: iso(2), ...over });
const data = (count: number, reviews = [review(1)]): Data => ({ stats: { count, average: 4, stars: [0, 0, 0, count, 0] }, reviews });

afterEach(cleanup);

describe("ProductReviews", () => {
  it("says there are no reviews yet when there are none, and draws no score", () => {
    render(<ProductReviews data={NO_REVIEWS} />);
    expect(screen.getByRole("heading", { name: "Ulasan pembeli" })).toBeTruthy();
    expect(screen.getByText(/Belum ada ulasan/)).toBeTruthy();
    expect(document.querySelector(".review-score")).toBeNull();
  });
  it("shows the score, the number of reviews, one bar per star, and each review", () => {
    render(<ProductReviews data={data(2, [review(1, { author: "Nadia P.", body: "Cantik", verified: true }), review(2, { author: "Sarah A.", body: "Bagus", createdAt: iso(10) })])} />);
    expect(document.querySelector(".score-big")!.textContent).toBe("4,0");
    expect(screen.getByText("2 ulasan")).toBeTruthy();
    expect(document.querySelectorAll(".review-bar")).toHaveLength(5);
    expect(screen.getByText("Nadia P.")).toBeTruthy();
    expect(screen.getByText("Cantik")).toBeTruthy();
    expect(screen.getByText("2 hari lalu")).toBeTruthy();
    expect(screen.getByText("1 minggu lalu")).toBeTruthy();
  });
  it("marks only verified purchases", () => {
    render(<ProductReviews data={data(2, [review(1, { verified: true }), review(2, { verified: false })])} />);
    expect(screen.getAllByText("✓ Pembelian terverifikasi")).toHaveLength(1);
  });
  it("says how many are shown when there are more reviews than listed", () => {
    render(<ProductReviews data={data(25, [review(1), review(2)])} />);
    expect(screen.getByText("Menampilkan 2 dari 25 ulasan terbaru.")).toBeTruthy();
  });
  it("does not say that when every review is listed", () => {
    render(<ProductReviews data={data(1, [review(1)])} />);
    expect(screen.queryByText(/Menampilkan/)).toBeNull();
  });
});

describe("ProductReviewsLoader", () => {
  const ok = (value: Data): ReviewsResult => ({ ok: true, value });

  it("says it is loading, then shows the reviews", async () => {
    let finish: (r: ReviewsResult) => void = () => {};
    const repository = { getProductReviews: vi.fn(() => new Promise<ReviewsResult>((resolve) => { finish = resolve; })) };
    render(<ProductReviewsLoader productId={7} repository={repository} />);
    expect(screen.getByRole("status").textContent).toBe("Memuat ulasan…");
    expect(repository.getProductReviews).toHaveBeenCalledWith(7);
    finish(ok(data(1, [review(1, { author: "Nadia P." })])));
    expect(await screen.findByText("Nadia P.")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("shows the empty note for a product with no reviews", async () => {
    render(<ProductReviewsLoader productId={7} repository={{ getProductReviews: async () => ok(NO_REVIEWS) }} />);
    expect(await screen.findByText(/Belum ada ulasan/)).toBeTruthy();
  });
  it("shows an error with a retry that loads again", async () => {
    const getProductReviews = vi.fn<() => Promise<ReviewsResult>>().mockResolvedValueOnce({ ok: false, error: "network" }).mockResolvedValueOnce(ok(data(1, [review(1, { author: "Nadia P." })])));
    render(<ProductReviewsLoader productId={7} repository={{ getProductReviews }} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Ulasan belum bisa dimuat.");
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(await screen.findByText("Nadia P.")).toBeTruthy();
    expect(getProductReviews).toHaveBeenCalledTimes(2);
  });
  it("loads the new product's reviews when the product changes, and ignores a late answer for the old one", async () => {
    const answers = new Map<number, (r: ReviewsResult) => void>();
    const repository = { getProductReviews: vi.fn((id: number) => new Promise<ReviewsResult>((resolve) => answers.set(id, resolve))) };
    const { rerender } = render(<ProductReviewsLoader productId={1} repository={repository} />);
    rerender(<ProductReviewsLoader productId={2} repository={repository} />);
    answers.get(2)!(ok(data(1, [review(2, { author: "Untuk produk 2" })])));
    expect(await screen.findByText("Untuk produk 2")).toBeTruthy();
    answers.get(1)!(ok(data(1, [review(1, { author: "Untuk produk 1" })])));
    await waitFor(() => expect(repository.getProductReviews).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Untuk produk 1")).toBeNull();
    expect(screen.getByText("Untuk produk 2")).toBeTruthy();
  });
});
