// Run with `npm run test:ui`. The small cache for what the provider told us.
import { describe, expect, it } from "vitest";
import { createEdgeCache, createMemoryCache, defaultCache } from "./cache";

describe("the memory cache", () => {
  it("keeps a value until its time is up, and not a moment longer", async () => {
    let now = 1_000;
    const cache = createMemoryCache(() => now);
    await cache.set("a", "one", 10);
    now += 9_999;
    expect(await cache.get("a")).toBe("one");
    now += 1;
    expect(await cache.get("a")).toBeNull();
  });
  it("answers null for what it never had, and replaces a value that is set again", async () => {
    const cache = createMemoryCache();
    expect(await cache.get("nope")).toBeNull();
    await cache.set("a", "one", 10);
    await cache.set("a", "two", 10);
    expect(await cache.get("a")).toBe("two");
  });
  it("lets the oldest entry go when it is full, but not when an existing one is only replaced", async () => {
    const cache = createMemoryCache(Date.now, 2);
    await cache.set("a", "1", 60);
    await cache.set("b", "2", 60);
    await cache.set("b", "2b", 60);
    expect(await cache.get("a")).toBe("1");
    await cache.set("c", "3", 60);
    expect(await cache.get("a")).toBeNull();
    expect(await cache.get("b")).toBe("2b");
    expect(await cache.get("c")).toBe("3");
  });
});

describe("the edge cache", () => {
  function fakeEdge() {
    const store = new Map<string, Response>();
    const puts: { url: string; cacheControl: string | null }[] = [];
    return {
      puts,
      edge: {
        match: async (request: Request) => store.get(request.url)?.clone(),
        put: async (request: Request, response: Response) => { puts.push({ url: request.url, cacheControl: response.headers.get("Cache-Control") }); store.set(request.url, response); },
      },
    };
  }
  it("files a value under an address of its own and reads it back", async () => {
    const { edge, puts } = fakeEdge();
    const cache = createEdgeCache(edge);
    await cache.set("dest:jakarta selatan", "[1]", 3600);
    expect(await cache.get("dest:jakarta selatan")).toBe("[1]");
    expect(await cache.get("other")).toBeNull();
    expect(puts[0].url).toBe("https://shipping-cache.invalid/dest%3Ajakarta%20selatan");
    expect(puts[0].cacheControl).toBe("public, max-age=3600");
  });
  it("lasts at least a second whatever time it was given", async () => {
    const { edge, puts } = fakeEdge();
    await createEdgeCache(edge).set("a", "x", 0.2);
    expect(puts[0].cacheControl).toBe("public, max-age=1");
  });
  it("is only a cache that does not help when the data centre's cache fails", async () => {
    const broken = { match: async () => { throw new Error("down"); }, put: async () => { throw new Error("down"); } };
    const cache = createEdgeCache(broken);
    await expect(cache.set("a", "x", 10)).resolves.toBeUndefined();
    expect(await cache.get("a")).toBeNull();
  });
});

describe("the cache a process uses", () => {
  it("is one and the same each time", () => expect(defaultCache()).toBe(defaultCache()));
});
