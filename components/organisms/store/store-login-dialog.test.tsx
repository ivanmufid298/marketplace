// Run with `npm run test:ui`. Where the buyer lands after signing in, and the welcome toast. (These were the "login" tests
// of the old StoreProvider.) The cart and the checkout carry on their own part; their tests are in their modules.
import { act, cleanup, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Storefront, useStorefront } from "../../providers/storefront-test-support";
import { StoreLoginDialog } from "./store-login-dialog";

const wrapper = ({ children }: { children: ReactNode }) => <Storefront><StoreLoginDialog />{children}</Storefront>;
function mount() {
  const view = renderHook(() => useStorefront(), { wrapper });
  return { ...view, s: () => view.result.current, a: () => view.result.current.auth };
}
const run = (fn: () => void | Promise<void>) => act(async () => { await fn(); });
const signIn = (m: ReturnType<typeof mount>) => run(async () => { await m.a().signIn("nadia@demo.test", "password123"); });

beforeEach(() => { window.localStorage.clear(); vi.unstubAllEnvs(); vi.stubEnv("NODE_ENV", "development"); });
afterEach(cleanup);

describe("login: where the buyer lands after signing in", () => {
  it("opens the orders panel", async () => {
    const m = mount();
    await run(() => m.a().openLogin("orders"));
    await signIn(m);
    expect(m.a().loginOpen).toBe(false);
    expect(m.s().panels.orders).toBe(true);
  });

  it("opens the chat panel", async () => {
    const m = mount();
    await run(() => m.a().openLogin("chat"));
    await signIn(m);
    expect(m.a().loginOpen).toBe(false);
    expect(m.s().panels.chat).toBe(true);
  });

  it("does not open anything for a plain sign in, and closes the dialog", async () => {
    const m = mount();
    await run(() => m.a().openLogin());
    await signIn(m);
    expect(m.a().loginOpen).toBe(false);
    expect(Object.values(m.s().panels).every((open) => !open)).toBe(true);
  });

  it("adds the product a guest picked, and closes the dialog, when the sign in was for the cart", async () => {
    const m = mount();
    await run(() => m.s().addToCart(m.s().products[0]));
    expect(m.a().loginOpen).toBe(true);
    await signIn(m);
    expect(m.a().loginOpen).toBe(false);
    expect(m.s().cart).toEqual([{ id: m.s().products[0].id, qty: 1 }]);
  });

  it("renders without crashing on its own", () => {
    render(<Storefront><StoreLoginDialog /></Storefront>);
  });
});
