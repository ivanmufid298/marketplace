import type { SupabaseClient } from "@supabase/supabase-js";
import type { CartItem } from "./quote-handler";
import type { QuoteLine, ShopRules } from "./quote";
import { createSettingsRepository } from "./settings-repository";

// What a quote reads from the database, as the signed-in buyer: the shop's shipping rules and the weight and price of what is in the cart.
// Weight and price are never taken from the browser.

type Db = Pick<SupabaseClient, "from">;

export function quoteLoaders(db: Db) {
  return {
    async loadRules(): Promise<ShopRules | null> {
      const result = await createSettingsRepository(db).get();
      if (!result.ok) return null;
      const s = result.value;
      return { originId: s.originId, couriers: s.couriers, freeShippingMin: s.freeShippingMin, markup: s.markup };
    },

    /** The lines of the cart, or null when a product is not there (not on sale, or no longer) or the database does not answer. */
    async loadLines(items: CartItem[]): Promise<QuoteLine[] | null> {
      const { data, error } = await db.from("products").select("id, price, weight_gram").in("id", items.map((i) => i.productId));
      if (error || !Array.isArray(data)) return null;
      const byId = new Map((data as { id: number; price: number; weight_gram: number }[]).map((p) => [Number(p.id), p]));
      const lines: QuoteLine[] = [];
      for (const item of items) {
        const product = byId.get(item.productId);
        if (!product) return null;
        lines.push({ weightGram: Number(product.weight_gram), price: Number(product.price), qty: item.qty });
      }
      return lines;
    },
  };
}
