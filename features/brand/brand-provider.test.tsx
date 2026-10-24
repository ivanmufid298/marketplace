// Run with `npm run test:ui`. The shop's name and logo for every screen, and the admin's changes to them. The database and the storage are fakes;
// who may change what is covered by the SQL tests.
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrandProvider, useBrand } from "./brand-provider";
import type { LogoDeps } from "./lib/logo-image";
import type { BrandResult, BrandServices, ShopProfile } from "./lib/types";

const ID = "0a1b2c3d-4e5f-6789-abcd-ef0123456789";
const OLD = "logo/11111111-1111-1111-1111-111111111111.png";
const BASE = "https://x.supabase.co";
const ok: BrandResult<null> = { ok: true, value: null };

function fake(initial: ShopProfile = { name: "Market by Kith", logoKey: null }) {
  let profile = initial;
  const repo = {
    get: vi.fn(async (): Promise<BrandResult<ShopProfile>> => ({ ok: true, value: profile })),
    saveName: vi.fn(async (name: string): Promise<BrandResult<null>> => { profile = { ...profile, name }; return ok; }),
    saveLogoKey: vi.fn(async (key: string | null): Promise<BrandResult<null>> => { profile = { ...profile, logoKey: key }; return ok; }),
  };
  const storage = { upload: vi.fn(async () => undefined), remove: vi.fn(async () => undefined), publicUrl: (key: string) => `${BASE}/storage/v1/object/public/shop-brand/${key}` };
  const services: BrandServices = { repo, storage, newId: () => ID };
  return { services, repo, storage };
}
const goodDeps: LogoDeps = { decode: async () => ({ width: 100, height: 100, release: () => undefined }), encodePng: async () => new Blob([new Uint8Array(50)], { type: "image/png" }) };
const png = () => new File([new Uint8Array(10)], "logo.png", { type: "image/png" });

function mount(services?: BrandServices, logoDeps: LogoDeps = goodDeps) {
  const wrapper = ({ children }: { children: ReactNode }) => <BrandProvider services={services} logoDeps={logoDeps}>{children}</BrandProvider>;
  const view = renderHook(() => useBrand(), { wrapper });
  return { ...view, b: () => view.result.current };
}

beforeEach(() => { window.localStorage.clear(); vi.unstubAllEnvs(); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", BASE); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon"); });
afterEach(cleanup);

describe("reading the profile", () => {
  it("shows the default until the database answers, then the shop's name and logo address", async () => {
    const { services } = fake({ name: "Kith Store", logoKey: OLD });
    const m = mount(services);
    expect(m.b()).toMatchObject({ database: true, status: "loading", name: "Market by Kith", logoUrl: null });
    await waitFor(() => expect(m.b().status).toBe("ready"));
    expect(m.b()).toMatchObject({ name: "Kith Store", logoUrl: `${BASE}/storage/v1/object/public/shop-brand/${OLD}` });
  });
  it("has no logo address when the shop has no logo", async () => {
    const m = mount(fake().services);
    await waitFor(() => expect(m.b().status).toBe("ready"));
    expect(m.b().logoUrl).toBeNull();
  });
  it("shows what this browser saw last time at once, so the header does not flash the default", async () => {
    window.localStorage.setItem("marketplace-brand-v1", JSON.stringify({ name: "Dari Cache", logoKey: OLD }));
    const { services, repo } = fake({ name: "Dari Cache", logoKey: OLD });
    repo.get.mockImplementation(() => new Promise(() => undefined));
    const m = mount(services);
    await waitFor(() => expect(m.b().name).toBe("Dari Cache"));
    expect(m.b().logoUrl).toContain(OLD);
    expect(m.b().status).toBe("loading");
  });
  it("remembers what it read for next time, and replaces a stale memory with the truth", async () => {
    window.localStorage.setItem("marketplace-brand-v1", JSON.stringify({ name: "Lama", logoKey: null }));
    const m = mount(fake({ name: "Baru", logoKey: OLD }).services);
    await waitFor(() => expect(m.b().name).toBe("Baru"));
    expect(JSON.parse(window.localStorage.getItem("marketplace-brand-v1") as string)).toEqual({ name: "Baru", logoKey: OLD });
  });
  it.each(["not json", JSON.stringify({ name: "", logoKey: null }), JSON.stringify({ name: 5, logoKey: null }), JSON.stringify({ name: "X", logoKey: 5 }), "null"])("ignores a memory it cannot use (%s)", async (raw) => {
    window.localStorage.setItem("marketplace-brand-v1", raw);
    const { services, repo } = fake();
    repo.get.mockImplementation(() => new Promise(() => undefined));
    const m = mount(services);
    await act(async () => { await Promise.resolve(); });
    expect(m.b().name).toBe("Market by Kith");
  });
  it("says it could not read, and keeps what it showed", async () => {
    window.localStorage.setItem("marketplace-brand-v1", JSON.stringify({ name: "Dari Cache", logoKey: null }));
    const { services, repo } = fake();
    repo.get.mockResolvedValue({ ok: false, error: "network" });
    const m = mount(services);
    await waitFor(() => expect(m.b().status).toBe("error"));
    expect(m.b().name).toBe("Dari Cache");
    repo.get.mockResolvedValue({ ok: true, value: { name: "Pulih", logoKey: null } });
    await act(async () => m.b().reload());
    await waitFor(() => expect(m.b()).toMatchObject({ status: "ready", name: "Pulih" }));
  });
  it("does not ask for it again while it shows it, and does not flash 'loading' on a later read", async () => {
    const { services, repo } = fake();
    const m = mount(services);
    await waitFor(() => expect(m.b().status).toBe("ready"));
    await act(async () => m.b().reload());
    expect(m.b().status).toBe("ready");
    expect(repo.get).toHaveBeenCalledTimes(2);
  });
  it("keeps saying it is ready while it reads again, instead of going back to loading", async () => {
    const { services, repo } = fake();
    const m = mount(services);
    await waitFor(() => expect(m.b().status).toBe("ready"));
    repo.get.mockImplementationOnce(() => new Promise(() => undefined));
    await act(async () => m.b().reload());
    expect(m.b().status).toBe("ready");
  });
  it("keeps working when the browser blocks its storage", async () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const m = mount(fake({ name: "Kith Store", logoKey: null }).services);
    await waitFor(() => expect(m.b().name).toBe("Kith Store"));
    spy.mockRestore();
  });
});

describe("without a database (the demo)", () => {
  beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ""); });
  it("is ready at once with the default name and no logo, and refuses every change", async () => {
    const m = mount();
    expect(m.b()).toMatchObject({ database: false, status: "ready", name: "Market by Kith", logoUrl: null });
    await act(async () => { expect(await m.b().saveName("X")).toEqual({ ok: false, error: "unknown" }); });
    await act(async () => { expect(await m.b().uploadLogo(png())).toEqual({ ok: false, error: "unknown" }); });
    await act(async () => { expect(await m.b().removeLogo()).toEqual({ ok: false, error: "unknown" }); });
  });
});

describe("changing the name", () => {
  it("saves it without the spaces around it, then shows it", async () => {
    const { services, repo } = fake();
    const m = mount(services);
    await waitFor(() => expect(m.b().status).toBe("ready"));
    await act(async () => { expect(await m.b().saveName("  Kith Store  ")).toEqual(ok); });
    expect(repo.saveName).toHaveBeenCalledWith("Kith Store");
    await waitFor(() => expect(m.b().name).toBe("Kith Store"));
  });
  it("refuses an empty or too long name without asking the database", async () => {
    const { services, repo } = fake();
    const m = mount(services);
    await waitFor(() => expect(m.b().status).toBe("ready"));
    for (const bad of ["", "   ", "a".repeat(61)]) await act(async () => { expect(await m.b().saveName(bad)).toEqual({ ok: false, error: "invalidName" }); });
    expect(repo.saveName).not.toHaveBeenCalled();
  });
  it("passes on the database's refusal, and does not read again", async () => {
    const { services, repo } = fake();
    repo.saveName.mockResolvedValue({ ok: false, error: "forbidden" });
    const m = mount(services);
    await waitFor(() => expect(m.b().status).toBe("ready"));
    const reads = repo.get.mock.calls.length;
    await act(async () => { expect(await m.b().saveName("X")).toEqual({ ok: false, error: "forbidden" }); });
    expect(repo.get).toHaveBeenCalledTimes(reads);
  });
});

describe("uploading a logo", () => {
  it("shrinks it, stores it under a new key, points the profile at it, and removes the one it replaces", async () => {
    const { services, repo, storage } = fake({ name: "Kith", logoKey: OLD });
    const m = mount(services);
    await waitFor(() => expect(m.b().logoUrl).toContain(OLD));
    await act(async () => { expect(await m.b().uploadLogo(png())).toEqual(ok); });
    expect(storage.upload).toHaveBeenCalledWith(`logo/${ID}.png`, expect.any(Blob));
    expect(repo.saveLogoKey).toHaveBeenCalledWith(`logo/${ID}.png`);
    expect(storage.remove).toHaveBeenCalledWith(OLD);
    await waitFor(() => expect(m.b().logoUrl).toContain(`logo/${ID}.png`));
  });
  it("has no old file to remove the first time", async () => {
    const { services, storage } = fake();
    const m = mount(services);
    await waitFor(() => expect(m.b().status).toBe("ready"));
    await act(async () => { await m.b().uploadLogo(png()); });
    expect(storage.remove).not.toHaveBeenCalled();
  });
  it("tells why a picture could not be used, and stores nothing", async () => {
    const { services, repo, storage } = fake();
    const m = mount(services, { ...goodDeps, decode: async () => { throw new Error("bad"); } });
    await waitFor(() => expect(m.b().status).toBe("ready"));
    await act(async () => { expect(await m.b().uploadLogo(png())).toEqual({ ok: false, error: "logoUnreadable" }); });
    await act(async () => { expect(await m.b().uploadLogo(new File([new Uint8Array(5)], "x.svg", { type: "image/svg+xml" }))).toEqual({ ok: false, error: "logoType" }); });
    expect(storage.upload).not.toHaveBeenCalled();
    expect(repo.saveLogoKey).not.toHaveBeenCalled();
  });
  it("says so when the file cannot be stored, and does not change the profile", async () => {
    const { services, repo, storage } = fake();
    storage.upload.mockRejectedValue(new Error("down"));
    const m = mount(services);
    await waitFor(() => expect(m.b().status).toBe("ready"));
    await act(async () => { expect(await m.b().uploadLogo(png())).toEqual({ ok: false, error: "unknown" }); });
    expect(repo.saveLogoKey).not.toHaveBeenCalled();
  });
  it("removes the file it just stored when the profile cannot be pointed at it, and keeps the old logo", async () => {
    const { services, repo, storage } = fake({ name: "Kith", logoKey: OLD });
    repo.saveLogoKey.mockResolvedValue({ ok: false, error: "forbidden" });
    const m = mount(services);
    await waitFor(() => expect(m.b().logoUrl).toContain(OLD));
    await act(async () => { expect(await m.b().uploadLogo(png())).toEqual({ ok: false, error: "forbidden" }); });
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith(`logo/${ID}.png`);
    expect(m.b().logoUrl).toContain(OLD);
  });
  it("still succeeds when the old file cannot be removed (it is only left behind)", async () => {
    const { services, storage } = fake({ name: "Kith", logoKey: OLD });
    storage.remove.mockRejectedValue(new Error("down"));
    const m = mount(services);
    await waitFor(() => expect(m.b().logoUrl).toContain(OLD));
    await act(async () => { expect(await m.b().uploadLogo(png())).toEqual(ok); });
    await waitFor(() => expect(m.b().logoUrl).toContain(`logo/${ID}.png`));
  });
  it("does not remove the file it has just stored if it is the same one", async () => {
    const same = `logo/${ID}.png`;
    const { services, storage } = fake({ name: "Kith", logoKey: same });
    const m = mount(services);
    await waitFor(() => expect(m.b().logoUrl).toContain(same));
    await act(async () => { await m.b().uploadLogo(png()); });
    expect(storage.remove).not.toHaveBeenCalled();
  });
});

describe("removing the logo", () => {
  it("points the profile at none, removes the file, and shows the default mark again", async () => {
    const { services, repo, storage } = fake({ name: "Kith", logoKey: OLD });
    const m = mount(services);
    await waitFor(() => expect(m.b().logoUrl).toContain(OLD));
    await act(async () => { expect(await m.b().removeLogo()).toEqual(ok); });
    expect(repo.saveLogoKey).toHaveBeenCalledWith(null);
    expect(storage.remove).toHaveBeenCalledWith(OLD);
    await waitFor(() => expect(m.b().logoUrl).toBeNull());
  });
  it("keeps the file when the database refuses", async () => {
    const { services, repo, storage } = fake({ name: "Kith", logoKey: OLD });
    repo.saveLogoKey.mockResolvedValue({ ok: false, error: "forbidden" });
    const m = mount(services);
    await waitFor(() => expect(m.b().logoUrl).toContain(OLD));
    await act(async () => { expect(await m.b().removeLogo()).toEqual({ ok: false, error: "forbidden" }); });
    expect(storage.remove).not.toHaveBeenCalled();
    expect(m.b().logoUrl).toContain(OLD);
  });
  it("has no file to remove when there was no logo", async () => {
    const { services, storage } = fake();
    const m = mount(services);
    await waitFor(() => expect(m.b().status).toBe("ready"));
    await act(async () => { expect(await m.b().removeLogo()).toEqual(ok); });
    expect(storage.remove).not.toHaveBeenCalled();
  });
});

describe("outside a provider", () => {
  it("says what is missing", () => {
    expect(() => renderHook(() => useBrand())).toThrow("useBrand must be used inside <BrandProvider>");
  });
});
