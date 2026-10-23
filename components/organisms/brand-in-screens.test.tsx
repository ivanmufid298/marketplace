// Run with `npm run test:ui`. Where the shop's name and logo show: the storefront header and footer, and the admin sidebar and its menu.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrandProvider, type BrandResult, type BrandServices, type ShopProfile } from "@/features/brand";
import { ADMIN_NAV } from "@/lib/admin-nav";
import { t } from "@/lib/i18n";
import { AdminProvider } from "../providers/admin-provider";
import { Storefront } from "../providers/storefront-test-support";
import { Sidebar } from "./admin/sidebar";
import { Footer } from "./store/footer";
import { Header } from "./store/header";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/profile", useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

const KEY = "logo/0a1b2c3d-4e5f-6789-abcd-ef0123456789.png";
const BASE = "https://x.supabase.co";
function services(profile: ShopProfile): BrandServices {
  return {
    repo: { get: async (): Promise<BrandResult<ShopProfile>> => ({ ok: true, value: profile }), saveName: async () => ({ ok: true, value: null }), saveLogoKey: async () => ({ ok: true, value: null }) },
    storage: { upload: async () => undefined, remove: async () => undefined, publicUrl: (key) => `${BASE}/storage/v1/object/public/shop-brand/${key}` },
    newId: () => "x",
  };
}
const store = (profile: ShopProfile) => render(<Storefront><BrandProvider services={services(profile)}><Header /><Footer /></BrandProvider></Storefront>);
const admin = (profile: ShopProfile) => render(<AdminProvider><BrandProvider services={services(profile)}><Sidebar /></BrandProvider></AdminProvider>);

beforeEach(() => { window.localStorage.clear(); vi.unstubAllEnvs(); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon"); });
afterEach(cleanup);

describe("the storefront", () => {
  it("shows the shop's name in the header and the footer", async () => {
    store({ name: "Kith Store", logoKey: null });
    await waitFor(() => expect(document.querySelector(".brand-name")?.textContent).toBe("Kith Store"));
    expect(document.querySelector(".footer-brand")?.textContent).toBe("Kith Store");
  });
  it("shows the logo in the header when the shop has one, instead of the M mark", async () => {
    store({ name: "Kith Store", logoKey: KEY });
    await waitFor(() => expect(document.querySelector(".brand-logo")).not.toBeNull());
    const img = document.querySelector(".brand-logo") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(`${BASE}/storage/v1/object/public/shop-brand/${KEY}`);
    expect(img.getAttribute("alt")).toBe("");
    expect(document.querySelector(".brand-mark")).toBeNull();
  });
  it("shows the M mark when the shop has no logo", async () => {
    store({ name: "Kith Store", logoKey: null });
    await waitFor(() => expect(document.querySelector(".brand-name")?.textContent).toBe("Kith Store"));
    expect(document.querySelector(".brand-mark")?.textContent).toBe("M");
    expect(document.querySelector(".brand-logo")).toBeNull();
  });
  it("is called Market by Kith until the shop says otherwise", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    render(<Storefront><BrandProvider><Header /><Footer /></BrandProvider></Storefront>);
    expect(document.querySelector(".brand-name")?.textContent).toBe("Market by Kith");
    expect(document.querySelector(".footer-brand")?.textContent).toBe("Market by Kith");
  });
});

describe("the admin panel", () => {
  it("shows the shop's name and logo in the sidebar", async () => {
    admin({ name: "Kith Store", logoKey: KEY });
    await waitFor(() => expect(document.querySelector(".logo-img")).not.toBeNull());
    expect(document.querySelector(".logo")?.textContent).toContain("Kith Store");
    expect((document.querySelector(".logo-img") as HTMLImageElement).getAttribute("src")).toContain(KEY);
    expect(document.querySelector(".logo-mark")).toBeNull();
  });
  it("shows the M mark and the name when there is no logo", async () => {
    admin({ name: "Kith Store", logoKey: null });
    await waitFor(() => expect(document.querySelector(".logo")?.textContent).toContain("Kith Store"));
    expect(document.querySelector(".logo-mark")?.textContent).toBe("M");
  });
  it("lists the profile page under Pengaturan, before Ongkir, and marks it as the current page", () => {
    admin({ name: "Kith Store", logoKey: null });
    const labels = [...document.querySelectorAll("nav .nav-section, nav a")].map((n) => n.textContent);
    expect(labels.slice(-3)).toEqual(["Pengaturan", "Profil toko", "Ongkir"]);
    expect(screen.getByRole("link", { name: "Profil toko" }).getAttribute("href")).toBe("/admin/profile");
    expect(screen.getByRole("link", { name: "Profil toko" }).className).toContain("active");
    expect(screen.getByRole("link", { name: "Ongkir" }).className).not.toContain("active");
  });
});

describe("the admin menu", () => {
  it("gives the profile page a title for the top bar", () => {
    const item = ADMIN_NAV.flatMap((g) => g.items).find((i) => i.href === "/admin/profile");
    expect(item && t(item.title)).toBe("Profil Toko");
  });
});
