// Run with `npm run test:ui`. The shop's profile against a fake of the database client: what is read, what is sent, and what a refusal looks like.
import { describe, expect, it } from "vitest";
import { createProfileRepository, mapBrandError, toProfile, type BrandDb } from "./profile-repository";

const KEY = "logo/0a1b2c3d-4e5f-6789-abcd-ef0123456789.png";
type Answer = { data?: unknown; error?: { code?: string; message?: string } | null };

function fake(answer: Answer = {}) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = [];
  const db = {
    from: (table: string) => {
      const call = { table, ops: [] as [string, unknown[]][] };
      calls.push(call);
      const chain: unknown = new Proxy({}, {
        get(_t, prop) {
          if (prop === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve({ data: answer.data ?? null, error: answer.error ?? null }).then(resolve);
          return (...args: unknown[]) => { call.ops.push([String(prop), args]); return chain; };
        },
      });
      return chain;
    },
  } as unknown as BrandDb;
  return { repo: createProfileRepository(db), calls };
}

describe("toProfile", () => {
  it("reads the name and the logo key", () => {
    expect(toProfile({ shop_name: "Kith Store", logo_key: KEY })).toEqual({ name: "Kith Store", logoKey: KEY });
  });
  it("falls back to the default name when there is none or it is blank, and has no logo", () => {
    expect(toProfile(null)).toEqual({ name: "Market by Kith", logoKey: null });
    expect(toProfile({ shop_name: "   ", logo_key: null })).toEqual({ name: "Market by Kith", logoKey: null });
    expect(toProfile({ shop_name: null, logo_key: null }).name).toBe("Market by Kith");
  });
  it("does not trust a logo key the database would not have accepted", () => {
    expect(toProfile({ shop_name: "X", logo_key: "../../etc/passwd" }).logoKey).toBeNull();
    expect(toProfile({ shop_name: "X", logo_key: "logo/abc.png" }).logoKey).toBeNull();
  });
});

describe("mapBrandError", () => {
  it.each([
    [{ code: "23514", message: "x" }, "invalidName"],
    [{ message: "new row violates check constraint \"shop_profile_shop_name_check\"" }, "invalidName"],
    [{ code: "42501", message: "x" }, "forbidden"],
    [{ message: "permission denied for table shop_profile" }, "forbidden"],
    [{ message: "new row violates row-level security policy" }, "forbidden"],
    [{ message: "Failed to fetch" }, "network"],
    [{ message: "NetworkError when attempting to fetch" }, "network"],
    [{ code: "XX000", message: "boom" }, "unknown"],
  ])("maps %j to %s", (error, kind) => expect(mapBrandError(error)).toBe(kind));
  it("is unknown for no error at all", () => expect(mapBrandError(null)).toBe("unknown"));
  it("does not call a message with a code a network failure", () => expect(mapBrandError({ code: "500", message: "network is down" })).toBe("unknown"));
});

describe("get", () => {
  it("reads row 1 of the profile table", async () => {
    const { repo, calls } = fake({ data: { shop_name: "Kith Store", logo_key: KEY } });
    expect(await repo.get()).toEqual({ ok: true, value: { name: "Kith Store", logoKey: KEY } });
    expect(calls[0].table).toBe("shop_profile");
    expect(calls[0].ops).toEqual([["select", ["shop_name, logo_key"]], ["eq", ["id", 1]], ["maybeSingle", []]]);
  });
  it("treats a missing row as nothing set yet", async () => {
    expect(await fake({ data: null }).repo.get()).toEqual({ ok: true, value: { name: "Market by Kith", logoKey: null } });
  });
  it("reports why a read failed", async () => {
    expect(await fake({ error: { message: "Failed to fetch" } }).repo.get()).toEqual({ ok: false, error: "network" });
  });
});

describe("saving", () => {
  it("sends the name, to row 1, and asks to see the row changed", async () => {
    const { repo, calls } = fake({ data: [{ id: 1 }] });
    expect(await repo.saveName("Kith Store")).toEqual({ ok: true, value: null });
    expect(calls[0].ops).toEqual([["update", [{ shop_name: "Kith Store" }]], ["eq", ["id", 1]], ["select", ["id"]]]);
  });
  it("sends the logo key, or none", async () => {
    const { repo, calls } = fake({ data: [{ id: 1 }] });
    await repo.saveLogoKey(KEY);
    await repo.saveLogoKey(null);
    expect(calls[0].ops).toEqual([["update", [{ logo_key: KEY }]], ["eq", ["id", 1]], ["select", ["id"]]]);
    expect(calls[1].ops).toEqual([["update", [{ logo_key: null }]], ["eq", ["id", 1]], ["select", ["id"]]]);
  });
  it("says forbidden when no row was changed, which is how Row Level Security refuses without an error", async () => {
    expect(await fake({ data: [] }).repo.saveName("X")).toEqual({ ok: false, error: "forbidden" });
    expect(await fake({ data: null }).repo.saveLogoKey(null)).toEqual({ ok: false, error: "forbidden" });
  });
  it("reports the database's own reason", async () => {
    expect(await fake({ error: { code: "23514", message: "x" } }).repo.saveName("X")).toEqual({ ok: false, error: "invalidName" });
    expect(await fake({ error: { code: "42501", message: "x" } }).repo.saveLogoKey(KEY)).toEqual({ ok: false, error: "forbidden" });
  });
});
