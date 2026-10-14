// Run with `npm run test:ui`. The checkout's steps: where the shopper is, and going back from payment.
import { CartProvider } from "@/features/cart";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/features/auth";
import { CatalogProvider } from "@/features/catalog";
import { OrdersProvider } from "@/features/orders";
import { products } from "@/lib/mock/store";
import { UiProvider } from "@/shared/ui-state/ui-provider";
import { StoreProvider, useStore } from "../../providers/store-provider";
import { CheckoutFlow } from "./checkout-flow";

const SESSION_KEY = "marketplace-demo-session-v1";

function Controls() {
  const { addToCart, startCheckout, setAddressField, goCheckoutStep, checkoutStep } = useStore();
  return (
    <>
      <button onClick={() => addToCart(products[0])}>add</button>
      <button onClick={() => startCheckout()}>start</button>
      <button onClick={() => { setAddressField("phone", "0811000111"); setAddressField("address", "Jl. Mawar 1"); setAddressField("city", "Jakarta"); setAddressField("postcode", "12345"); }}>fill</button>
      <button onClick={() => goCheckoutStep(2)}>to2</button>
      <button onClick={() => goCheckoutStep(3)}>to3</button>
      <p data-testid="step">{checkoutStep}</p>
    </>
  );
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
const step = () => screen.getByTestId("step").textContent;
const steps = () => [...document.querySelectorAll(".steps .step")].map((el) => (el.classList.contains("active") ? "active" : el.classList.contains("done") ? "done" : "todo"));

async function atPayment() {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id: "nadia", email: "n@demo.test", name: "Nadia" }));
  render(
    <AuthProvider><UiProvider><CatalogProvider><OrdersProvider><CartProvider><StoreProvider><Controls /><CheckoutFlow /></StoreProvider></CartProvider></OrdersProvider></CatalogProvider></UiProvider></AuthProvider>,
  );
  await flush();
  fireEvent.click(screen.getByText("add")); await flush();
  fireEvent.click(screen.getByText("start")); await flush();
  fireEvent.click(screen.getByText("fill"));
  fireEvent.click(screen.getByText("to2"));
  fireEvent.click(screen.getByText("to3"));
}

beforeEach(() => { Element.prototype.scrollTo = vi.fn() as never; window.localStorage.clear(); vi.unstubAllEnvs(); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); });
afterEach(cleanup);

describe("the checkout's steps", () => {
  it("starts on the address step, with the others waiting", async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id: "nadia", email: "n@demo.test", name: "Nadia" }));
    render(<AuthProvider><UiProvider><CatalogProvider><OrdersProvider><CartProvider><StoreProvider><Controls /><CheckoutFlow /></StoreProvider></CartProvider></OrdersProvider></CatalogProvider></UiProvider></AuthProvider>);
    await flush();
    expect(steps()).toEqual(["active", "todo", "todo"]);
  });
  it("shows the payment step as current, with address and shipping done, once the shopper gets there", async () => {
    await atPayment();
    expect(step()).toBe("3");
    expect(steps()).toEqual(["done", "done", "active"]);
    expect(document.querySelector(".steps [aria-current='step']")?.textContent).toBe("Pembayaran");
  });
  it("lets the shopper go back from payment to a finished step by choosing it", async () => {
    await atPayment();
    fireEvent.click(screen.getByRole("button", { name: "Pengiriman" }));
    expect(step()).toBe("2");
    expect(steps()).toEqual(["done", "active", "todo"]);
    fireEvent.click(screen.getByRole("button", { name: "Alamat" }));
    expect(step()).toBe("1");
    expect(steps()).toEqual(["active", "todo", "todo"]);
  });
  it("lets the shopper go back with the back button, and leave with the close button", async () => {
    await atPayment();
    const payment = document.querySelectorAll(".co-page")[2] as HTMLElement;
    fireEvent.click(Array.from(payment.querySelectorAll("button")).find((b) => b.textContent === "Kembali")!);
    expect(step()).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));
    expect(document.querySelector("#checkoutFlow")!.className).not.toContain("open");
  });
  it("keeps what was typed when going back and forth", async () => {
    await atPayment();
    fireEvent.click(screen.getByRole("button", { name: "Alamat" }));
    expect((document.getElementById("phone") as HTMLInputElement).value).toBe("0811000111");
  });
});
