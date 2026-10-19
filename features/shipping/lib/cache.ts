// A small cache for what the provider told us. Destinations barely change and a rate is good for a few minutes, so asking
// once spares the free plan's 100 hits a day. On Cloudflare it is the data centre's own cache (free, no setup); anywhere
// else (local development) it is this process's memory.

export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export function createMemoryCache(now: () => number = Date.now, max = 500): Cache {
  const store = new Map<string, { value: string; until: number }>();
  return {
    async get(key) {
      const hit = store.get(key);
      if (!hit) return null;
      if (hit.until <= now()) {
        store.delete(key);
        return null;
      }
      return hit.value;
    },
    async set(key, value, ttlSeconds) {
      if (store.size >= max && !store.has(key)) store.delete(store.keys().next().value as string);
      store.set(key, { value, until: now() + ttlSeconds * 1000 });
    },
  };
}

type EdgeCache = { match(request: Request): Promise<Response | undefined>; put(request: Request, response: Response): Promise<void> };

/** The Cloudflare cache, when there is one. Entries are filed under a made-up address on a host that is never contacted. */
export function createEdgeCache(edge: EdgeCache): Cache {
  const address = (key: string) => new Request(`https://shipping-cache.invalid/${encodeURIComponent(key)}`);
  return {
    async get(key) {
      try {
        const hit = await edge.match(address(key));
        return hit ? await hit.text() : null;
      } catch {
        return null;
      }
    },
    async set(key, value, ttlSeconds) {
      try {
        await edge.put(address(key), new Response(value, { headers: { "Cache-Control": `public, max-age=${Math.max(1, Math.floor(ttlSeconds))}` } }));
      } catch {
        // A cache that cannot be written is only a cache that does not help.
      }
    },
  };
}

let shared: Cache | null = null;

/** The cache this process uses. */
export function defaultCache(): Cache {
  if (!shared) {
    const edge = (globalThis as { caches?: { default?: EdgeCache } }).caches?.default;
    shared = edge ? createEdgeCache(edge) : createMemoryCache();
  }
  return shared;
}
