// Run with `npm run test:ui`. Writing a review on an order item: the form stays open until the save is accepted, even
// when saving takes a moment (it goes to the database).
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/lib/mock/store";
import { OrderItemLine } from "./order-item-line";

const product: Product = { id: 1, name: "Mug", cat: "Rumah", price: 1000, stock: 1, desc: "", photos: [] };
const show = (onSaveReview: (r: { rating: number; text: string }) => boolean | Promise<boolean>, extra: { review?: { rating: number; text: string } } = {}) =>
  render(<OrderItemLine product={product} qty={1} canReview onSaveReview={onSaveReview} {...extra} />);
afterEach(cleanup);

const fill = () => {
  fireEvent.click(screen.getByRole("button", { name: "Tulis ulasan" }));
  fireEvent.click(screen.getAllByRole("radio")[4]);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Bagus" } });
};

describe("saving a review", () => {
  it("closes the form after a save that is accepted at once", async () => {
    const onSave = vi.fn(() => true);
    show(onSave);
    fill();
    await act(async () => { fireEvent.submit(screen.getByRole("textbox").closest("form")!); });
    expect(onSave).toHaveBeenCalledWith({ rating: 5, text: "Bagus" });
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("waits for a save that takes a moment, and keeps the form open meanwhile", async () => {
    let finish: (ok: boolean) => void = () => {};
    show(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    fill();
    await act(async () => { fireEvent.submit(screen.getByRole("textbox").closest("form")!); });
    expect(screen.queryByRole("textbox")).not.toBeNull();
    await act(async () => finish(true));
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("keeps the form, and what was typed, when the save is refused", async () => {
    show(async () => false);
    fill();
    await act(async () => { fireEvent.submit(screen.getByRole("textbox").closest("form")!); });
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Bagus");
  });
});
