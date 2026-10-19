// Run with `npm run test:ui`. The RajaOngkir client against fake answers: what it asks, what it makes of the replies, and
// that every kind of failure becomes one of a few reasons. (Nothing here calls the real service.)
import { describe, expect, it, vi } from "vitest";
import { createRajaOngkirProvider, errorFor, toDestination, toRate, USER_AGENT } from "./rajaongkir";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const row = (over: Record<string, unknown> = {}) => ({ id: 17549, label: "KEBAYORAN LAMA SELATAN, KEBAYORAN LAMA, JAKARTA SELATAN, DKI JAKARTA, 12240", province_name: "DKI JAKARTA", city_name: "JAKARTA SELATAN", district_name: "KEBAYORAN LAMA", subdistrict_name: "KEBAYORAN LAMA SELATAN", zip_code: "12240", ...over });
const rate = (over: Record<string, unknown> = {}) => ({ name: "SiCepat Express", code: "sicepat", service: "REG", description: "Reguler", cost: 8000, etd: "1-2 day", ...over });

describe("toDestination", () => {
  it("maps a row", () => {
    expect(toDestination(row())).toStrictEqual({ id: 17549, label: row().label, province: "DKI JAKARTA", city: "JAKARTA SELATAN", district: "KEBAYORAN LAMA", subdistrict: "KEBAYORAN LAMA SELATAN", postcode: "12240" });
  });
  it("leaves out a row without a usable id or label", () => {
    for (const bad of [null, "x", 5, {}, row({ id: "17549" }), row({ id: 0 }), row({ id: -3 }), row({ id: 1.5 }), row({ label: "" }), row({ label: 7 })]) expect(toDestination(bad)).toBeNull();
  });
  it("turns missing parts into empty text", () => expect(toDestination({ id: 1, label: "X" })).toStrictEqual({ id: 1, label: "X", province: "", city: "", district: "", subdistrict: "", postcode: "" }));
});

describe("toRate", () => {
  it("maps a row, with the courier in lower case and the etd trimmed", () => {
    expect(toRate(rate({ code: "SICEPAT", etd: " 1-2 day " }))).toStrictEqual({ courier: "sicepat", courierName: "SiCepat Express", service: "REG", description: "Reguler", fee: 8000, etd: "1-2 day" });
  });
  it("accepts a rate of zero and an empty etd", () => expect(toRate(rate({ cost: 0, etd: "" }))).toMatchObject({ fee: 0, etd: "" }));
  it("leaves out rows that are not a whole non-negative price, or lack a courier or a service", () => {
    for (const bad of [null, 1, {}, rate({ cost: "8000" }), rate({ cost: -1 }), rate({ cost: 80.5 }), rate({ cost: null }), rate({ code: "" }), rate({ service: "" })]) expect(toRate(bad)).toBeNull();
  });
});

describe("errorFor", () => {
  it("names the reason for each kind of failure", () => {
    expect(errorFor(429, null)).toBe("quota");
    expect(errorFor(200, { meta: { code: 429 } })).toBe("quota");
    expect(errorFor(500, { meta: { message: "Daily limit exceeded" } })).toBe("quota");
    expect(errorFor(403, { detail: "quota reached" })).toBe("quota");
    expect(errorFor(401, null)).toBe("rejected");
    expect(errorFor(403, { error_name: "browser_signature_banned" })).toBe("rejected");
    expect(errorFor(400, null)).toBe("invalid");
    expect(errorFor(404, null)).toBe("invalid");
    expect(errorFor(422, null)).toBe("invalid");
    expect(errorFor(500, null)).toBe("unavailable");
    expect(errorFor(502, { meta: { message: "Bad gateway" } })).toBe("unavailable");
  });
});

describe("searching places", () => {
  it("asks for the places that match, sends the key and who is asking, and maps the answer", async () => {
    const fetchImpl = vi.fn(async () => json({ meta: { code: 200 }, data: [row(), row({ id: 17550 })] }));
    const result = await createRajaOngkirProvider({ apiKey: "  secret-key ", fetchImpl }).searchDestinations("kebayoran baru", 5);
    expect(result.ok && result.value.map((d) => d.id)).toEqual([17549, 17550]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://rajaongkir.komerce.id/api/v1/destination/domestic-destination?search=kebayoran+baru&limit=5&offset=0");
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({ key: "secret-key", "User-Agent": USER_AGENT, Accept: "application/json" });
    expect(init.body).toBeUndefined();
  });
  it("skips rows it cannot use, and treats a missing list as nothing found", async () => {
    const a = await createRajaOngkirProvider({ apiKey: "k", fetchImpl: async () => json({ data: [row(), { id: "x" }, null] }) }).searchDestinations("jakarta");
    expect(a.ok && a.value).toHaveLength(1);
    const b = await createRajaOngkirProvider({ apiKey: "k", fetchImpl: async () => json({ meta: { code: 200 } }) }).searchDestinations("jakarta");
    expect(b).toEqual({ ok: true, value: [] });
  });
  it("asks for eight places unless told otherwise", async () => {
    const fetchImpl = vi.fn(async () => json({ data: [] }));
    await createRajaOngkirProvider({ apiKey: "k", fetchImpl }).searchDestinations("jakarta");
    expect(String((fetchImpl.mock.calls[0] as unknown as [string])[0])).toContain("limit=8");
  });
});

describe("quoting", () => {
  it("posts what to ship and where, with the couriers joined by colons, and maps every rate", async () => {
    const fetchImpl = vi.fn(async () => json({ meta: { code: 200 }, data: [rate(), rate({ code: "jne", name: "JNE", service: "CTC", cost: 10000 })] }));
    const result = await createRajaOngkirProvider({ apiKey: "secret", fetchImpl }).quote({ originId: 17549, destinationId: 17536, weightGram: 1500, couriers: ["jne", "sicepat", "jnt"] });
    expect(result.ok && result.value.map((r) => `${r.courier}:${r.service}:${r.fee}`)).toEqual(["sicepat:REG:8000", "jne:CTC:10000"]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://rajaongkir.komerce.id/api/v1/calculate/domestic-cost");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ key: "secret", "Content-Type": "application/x-www-form-urlencoded" });
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({ origin: "17549", destination: "17536", weight: "1500", courier: "jne:sicepat:jnt", price: "lowest" });
  });
  it("is an empty list when the provider has no rate for that trip", async () => {
    expect(await createRajaOngkirProvider({ apiKey: "k", fetchImpl: async () => json({ data: [] }) }).quote({ originId: 1, destinationId: 2, weightGram: 1, couriers: ["jne"] })).toEqual({ ok: true, value: [] });
  });
});

describe("when it goes wrong", () => {
  const search = (fetchImpl: () => Promise<Response>, opts: { apiKey?: string; timeoutMs?: number } = { apiKey: "k" }) => createRajaOngkirProvider({ fetchImpl, ...opts }).searchDestinations("jakarta");
  it("says there is no key, without calling anyone", async () => {
    const fetchImpl = vi.fn(async () => json({}));
    for (const apiKey of [undefined, "", "   "]) expect(await createRajaOngkirProvider({ apiKey, fetchImpl }).searchDestinations("jakarta")).toEqual({ ok: false, error: "notConfigured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("names the reason from the status", async () => {
    expect(await search(async () => json({}, 429))).toEqual({ ok: false, error: "quota" });
    expect(await search(async () => json({}, 401))).toEqual({ ok: false, error: "rejected" });
    expect(await search(async () => json({}, 400))).toEqual({ ok: false, error: "invalid" });
    expect(await search(async () => json({}, 503))).toEqual({ ok: false, error: "unavailable" });
  });
  it("copes with an answer that is not JSON", async () => {
    expect(await search(async () => new Response("<html>oops</html>", { status: 502 }))).toEqual({ ok: false, error: "unavailable" });
    expect(await search(async () => new Response("<html>ok</html>", { status: 200 }))).toEqual({ ok: true, value: [] });
  });
  it("hears a failure the provider reports inside a 200", async () => {
    expect(await search(async () => json({ meta: { code: 429, message: "limit" } }))).toEqual({ ok: false, error: "quota" });
    expect(await search(async () => json({ meta: { code: 400, message: "bad" } }))).toEqual({ ok: false, error: "invalid" });
  });
  it("answers unavailable when the connection fails or takes too long", async () => {
    expect(await search(async () => { throw new Error("offline"); })).toEqual({ ok: false, error: "unavailable" });
    const slow = (_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    expect(await createRajaOngkirProvider({ apiKey: "k", fetchImpl: slow as never, timeoutMs: 10 }).searchDestinations("jakarta")).toEqual({ ok: false, error: "unavailable" });
  });
  it("never puts the key in an error", async () => {
    const result = await createRajaOngkirProvider({ apiKey: "very-secret", fetchImpl: async () => { throw new Error("boom very-secret"); } }).searchDestinations("jakarta");
    expect(JSON.stringify(result)).not.toContain("very-secret");
  });
});
