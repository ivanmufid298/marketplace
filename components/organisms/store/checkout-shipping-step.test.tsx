// Run with `npm run test:ui`. The shipping step of the checkout as the buyer sees it when the shop uses courier prices: the services with
// their estimates and prices, waiting for them, and the shop's own rates with the reason when prices could not be had.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddressesProvider, type AddressRepository, type AddressServices, type SavedAddress } from "@/features/account";
import { AuthProvider } from "@/features/auth";
import { CartProvider, useCart } from "@/features/cart";
import { CatalogProvider } from "@/features/catalog";
import { CheckoutProvider, useCheckout } from "@/features/checkout";
import { OrdersProvider } from "@/features/orders";
import { products } from "@/lib/mock/store";
import { UiProvider } from "@/shared/ui-state/ui-provider";
import { CheckoutFlow } from "./checkout-flow";

vi.mock("@/features/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/auth")>();
  return { ...actual, useAuth: () => ({ ...actual.useAuth(), mode: "supabase" as const }) };
});

const SESSION_KEY = "marketplace-demo-session-v1";
const saved = (over: Partial<SavedAddress> = {}): SavedAddress => ({ id: "a1", label: "Rumah", recipientName: "Nadia", phone: "0811000111", address: "Jl. Mawar 1", city: "Jakarta", postcode: "12150", note: "", isDefault: true, destinationId: 17536, destinationLabel: "CIPETE UTARA", ...over });
const OPTIONS = [
  { courier: "sicepat", courierName: "SiCepat", service: "REG", description: "Layanan reguler", fee: 9000, etd: "1-2 day", token: "tok-1" },
  { courier: "jne", courierName: "JNE", service: "YES", description: "Yakin esok sampai", fee: 21000, etd: "1 day", token: "tok-2" },
];
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
const reply = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

function Probe() {
  const { addToCart } = useCart();
  const { startCheckout, goCheckoutStep } = useCheckout();
  return (
    <>
      <button onClick={() => addToCart(products[0])}>add-to-cart</button>
      <button onClick={() => startCheckout()}>start</button>
      <button onClick={() => goCheckoutStep(2)}>to-shipping</button>
    </>
  );
}

async function openShipping(address: SavedAddress) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id: "nadia", email: "n@demo.test", name: "Nadia Putri" }));
  const repo = { list: async () => ({ ok: true as const, value: [address] }) } as unknown as AddressRepository;
  render(
    <AuthProvider><UiProvider><CatalogProvider><OrdersProvider><CartProvider><AddressesProvider services={{ repo } as AddressServices}><CheckoutProvider><Probe /><CheckoutFlow /></CheckoutProvider></AddressesProvider></CartProvider></OrdersProvider></CatalogProvider></UiProvider></AuthProvider>,
  );
  await flush();
  fireEvent.click(screen.getByText("add-to-cart")); await flush();
  fireEvent.click(screen.getByText("start")); await flush();
  fireEvent.click(screen.getByText("to-shipping")); await flush();
  return document.querySelectorAll(".co-page")[1] as HTMLElement;
}

beforeEach(() => {
  Element.prototype.scrollTo = vi.fn() as never;
  window.localStorage.clear();
  vi.unstubAllEnvs();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("the shipping step with courier prices", () => {
  it("lists each service with its estimate and price, the cheapest chosen, and the total follows", async () => {
    fetchMock.mockImplementation(() => reply(200, { options: OPTIONS }));
    const step = await openShipping(saved());
    expect(within(step).getByText("SiCepat REG")).toBeTruthy();
    expect(within(step).getByText("Layanan reguler · Estimasi 1-2 hari")).toBeTruthy();
    expect(within(step).getByText("JNE YES")).toBeTruthy();
    const radios = within(step).getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((r) => r.checked)).toEqual([true, false]);
    expect(within(step).getByText(/Tarif tiap kurir untuk alamat ini/)).toBeTruthy();
    fireEvent.click(radios[1]);
    expect((within(step).getAllByRole("radio") as HTMLInputElement[]).map((r) => r.checked)).toEqual([false, true]);
    // the price of the service and the shipping line of the summary
    expect(within(step).getAllByText(/21\.000/).length).toBeGreaterThanOrEqual(2);
  });

  it("says the prices are being worked out, with nothing to choose and no way forward yet", async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    const step = await openShipping(saved());
    expect(within(step).getByRole("status").textContent).toBe("Menghitung ongkos kirim…");
    expect(within(step).queryAllByRole("radio")).toHaveLength(0);
    expect((within(step).getByRole("button", { name: "Lanjut bayar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers the shop's own rates and says why, for an address with no place from the search", async () => {
    const step = await openShipping(saved({ destinationId: null, destinationLabel: null }));
    expect(within(step).getByRole("status").textContent).toMatch(/belum punya lokasi dari pencarian/);
    expect(within(step).queryByRole("button", { name: "Coba hitung lagi" })).toBeNull();
    expect(within(step).getAllByRole("radio").length).toBeGreaterThan(0);
    expect((within(step).getByRole("button", { name: "Lanjut bayar" }) as HTMLButtonElement).disabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers the shop's own rates with a way to try again when the prices could not be had", async () => {
    fetchMock.mockImplementationOnce(() => reply(503, { error: "unavailable" }));
    const step = await openShipping(saved());
    expect(within(step).getByRole("status").textContent).toMatch(/belum bisa dihitung/);
    expect(within(step).getAllByRole("radio").length).toBeGreaterThan(0);
    fetchMock.mockImplementation(() => reply(200, { options: OPTIONS }));
    fireEvent.click(within(step).getByRole("button", { name: "Coba hitung lagi" }));
    await flush();
    expect(within(step).getByText("SiCepat REG")).toBeTruthy();
    expect(within(step).queryByRole("button", { name: "Coba hitung lagi" })).toBeNull();
  });
});
