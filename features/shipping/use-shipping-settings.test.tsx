// Run with `npm run test:ui`. The shop's shipping settings as the admin screen reads and changes them.
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { ManualMethod, SettingsRepository, SettingsResult, SettingsServices, ShippingSettings } from "./lib/settings-types";
import { useShippingSettings } from "./use-shipping-settings";

const settings: ShippingSettings = { originId: 17549, originLabel: "KEBAYORAN LAMA SELATAN", couriers: ["jne"], freeShippingMin: null, markup: 0 };
const method = (code: string, fee = 18000): ManualMethod => ({ code, label: code, note: "", fee, active: true });

function fake(over: Partial<SettingsRepository> = {}) {
  const repo = {
    get: vi.fn(async (): Promise<SettingsResult<ShippingSettings>> => ({ ok: true, value: settings })),
    save: vi.fn(async (): Promise<SettingsResult<null>> => ({ ok: true, value: null })),
    listMethods: vi.fn(async (): Promise<SettingsResult<ManualMethod[]>> => ({ ok: true, value: [method("regular")] })),
    updateMethod: vi.fn(async (): Promise<SettingsResult<null>> => ({ ok: true, value: null })),
    ...over,
  };
  return { services: { repo } as SettingsServices, repo: repo as unknown as Record<"get" | "save" | "listMethods" | "updateMethod", Mock> };
}

beforeEach(() => { vi.unstubAllEnvs(); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); });
afterEach(cleanup);

describe("without a database", () => {
  it("is not the database, ready, with nothing in it", () => {
    const view = renderHook(() => useShippingSettings());
    expect(view.result.current).toMatchObject({ database: false, status: "ready", settings: null, methods: [] });
  });
});

describe("reading", () => {
  it("starts out loading, then has the settings and the manual rates", async () => {
    let finish: (v: SettingsResult<ShippingSettings>) => void = () => {};
    const { services } = fake({ get: () => new Promise((resolve) => { finish = resolve; }) });
    const view = renderHook(() => useShippingSettings(services));
    expect(view.result.current).toMatchObject({ database: true, status: "loading", settings: null, methods: [] });
    await act(async () => finish({ ok: true, value: settings }));
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    expect(view.result.current.settings).toEqual(settings);
    expect(view.result.current.methods.map((m) => m.code)).toEqual(["regular"]);
  });
  it("reports an error when either read fails, keeps what it had, and reads again on request", async () => {
    const get = vi.fn().mockResolvedValueOnce({ ok: true, value: settings }).mockResolvedValueOnce({ ok: false, error: "network" }).mockResolvedValue({ ok: true, value: { ...settings, markup: 5 } });
    const view = renderHook(() => useShippingSettings(fake({ get: get as never }).services));
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    act(() => view.result.current.reload());
    await waitFor(() => expect(view.result.current.status).toBe("error"));
    expect(view.result.current.settings).toEqual(settings);
    act(() => view.result.current.reload());
    await waitFor(() => expect(view.result.current.settings?.markup).toBe(5));
    expect(view.result.current.status).toBe("ready");
    const rates = renderHook(() => useShippingSettings(fake({ listMethods: async () => ({ ok: false as const, error: "forbidden" as const }) }).services));
    await waitFor(() => expect(rates.result.current.status).toBe("error"));
  });
});

describe("saving", () => {
  it("saves the settings and then reads them again", async () => {
    const { services, repo } = fake();
    const view = renderHook(() => useShippingSettings(services));
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    const reads = repo.get.mock.calls.length;
    let result: SettingsResult<null> | undefined;
    await act(async () => { result = await view.result.current.saveSettings({ ...settings, markup: 500 }); });
    expect(result).toEqual({ ok: true, value: null });
    expect(repo.save).toHaveBeenCalledWith({ ...settings, markup: 500 });
    expect(repo.get.mock.calls.length).toBe(reads + 1);
  });
  it("does not read again, and passes the reason on, when the database refuses", async () => {
    const { services, repo } = fake({ save: async () => ({ ok: false as const, error: "forbidden" as const }), updateMethod: async () => ({ ok: false as const, error: "invalid" as const }) });
    const view = renderHook(() => useShippingSettings(services));
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    const reads = repo.get.mock.calls.length;
    let a: SettingsResult<null> | undefined, b: SettingsResult<null> | undefined;
    await act(async () => { a = await view.result.current.saveSettings(settings); b = await view.result.current.saveMethod("regular", { label: "x", note: "", fee: 1, active: true }); });
    expect(a).toEqual({ ok: false, error: "forbidden" });
    expect(b).toEqual({ ok: false, error: "invalid" });
    expect(repo.get.mock.calls.length).toBe(reads);
  });
  it("saves a manual rate and then reads again", async () => {
    const { services, repo } = fake();
    const view = renderHook(() => useShippingSettings(services));
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    const reads = repo.listMethods.mock.calls.length;
    await act(async () => { await view.result.current.saveMethod("regular", { label: "Reguler", note: "", fee: 20000, active: false }); });
    expect(repo.updateMethod).toHaveBeenCalledWith("regular", { label: "Reguler", note: "", fee: 20000, active: false });
    expect(repo.listMethods.mock.calls.length).toBe(reads + 1);
  });
});
