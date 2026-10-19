import type { Cache } from "./cache";
import { quoteShipping, type QuoteError, type QuoteLine, type QuoteOption, type ShopRules } from "./quote";
import type { Reply } from "./handlers";
import type { ShippingProvider } from "./types";

// What the shop's own shipping-quote address answers to the browser, and to whom.

export type QuoteBody =
  | { options: QuoteOption[]; weightGram: number; subtotal: number; freeShipping: boolean }
  | { error: "signIn" | QuoteError };

export type CartItem = { productId: number; qty: number };

/** Most kinds of product a cart may hold, and most of one kind: a limit on what is worth asking the database for. */
export const MAX_ITEMS = 50;
export const MAX_QTY = 99;

/** The cart the browser sent, merged by product and checked. Null when it is not a cart. */
export function parseCart(body: unknown): { destinationId: number; items: CartItem[] } | null {
  if (typeof body !== "object" || body === null) return null;
  const { destinationId, items } = body as { destinationId?: unknown; items?: unknown };
  if (typeof destinationId !== "number" || !Number.isSafeInteger(destinationId) || destinationId <= 0) return null;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) return null;
  const merged = new Map<number, number>();
  for (const item of items) {
    if (typeof item !== "object" || item === null) return null;
    const { productId, qty } = item as { productId?: unknown; qty?: unknown };
    if (typeof productId !== "number" || !Number.isSafeInteger(productId) || productId <= 0) return null;
    if (typeof qty !== "number" || !Number.isSafeInteger(qty) || qty < 1 || qty > MAX_QTY) return null;
    merged.set(productId, (merged.get(productId) ?? 0) + qty);
  }
  if ([...merged.values()].some((q) => q > MAX_QTY)) return null;
  return { destinationId, items: [...merged].map(([productId, qty]) => ({ productId, qty })) };
}

type Loaders = {
  /** The shop's rules, or null when they cannot be read. */
  loadRules: () => Promise<ShopRules | null>;
  /** The lines of the cart as the database has them (weight and price), or null when a product is not there. */
  loadLines: (items: CartItem[]) => Promise<QuoteLine[] | null>;
};

/**
 * Only signed-in buyers may ask (every ask can spend one of the day's free hits), and weight and price come from the database, not from the
 * browser. Whatever cannot be answered is said in one word the page can act on (it falls back to the shop's own rates).
 */
export async function answerQuote(input: { body: unknown; user: { id: string } | null; provider: ShippingProvider; cache: Cache; secret: string; now?: () => number } & Loaders): Promise<Reply<QuoteBody>> {
  if (!input.user) return { status: 401, body: { error: "signIn" } };
  const cart = parseCart(input.body);
  if (!cart) return { status: 400, body: { error: "invalid" } };
  const rules = await input.loadRules();
  if (!rules) return { status: 503, body: { error: "unavailable" } };
  const lines = await input.loadLines(cart.items);
  if (!lines) return { status: 400, body: { error: "invalid" } };
  const result = await quoteShipping({ provider: input.provider, cache: input.cache, rules, input: { userId: input.user.id, destinationId: cart.destinationId, lines }, secret: input.secret, now: input.now });
  if (result.ok) return { status: 200, body: { options: result.options, weightGram: result.weightGram, subtotal: result.subtotal, freeShipping: result.freeShipping } };
  switch (result.error) {
    case "invalid":
      return { status: 400, body: { error: "invalid" } };
    case "quota":
      return { status: 429, body: { error: "quota" } };
    case "noRates":
      return { status: 422, body: { error: "noRates" } };
    default:
      return { status: 503, body: { error: result.error } };
  }
}
