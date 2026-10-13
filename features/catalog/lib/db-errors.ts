import type { ProductFormValues } from "./product-form";

// Postgres and PostgREST report problems as codes and long messages. The admin needs a short reason and, when it is
// about one input, which field. Keys go to admin.products.errors in content/id.json.

export type SaveErrorKind =
  | "slugTaken"
  | "categoryNameTaken"
  | "notFound"
  | "photoKeyTaken"
  | "duplicate"
  | "forbidden"
  | "invalidValue"
  | "missingReference"
  | "network"
  | "unknown";

export type SaveError = { kind: SaveErrorKind; field?: keyof ProductFormValues };

export type DbErrorLike = { code?: string | null; message?: string | null; details?: string | null };

/** The CHECK constraints of public.products that belong to one form field. */
const CHECK_FIELD: Record<string, keyof ProductFormValues> = {
  products_name_check: "name",
  products_description_check: "description",
  products_price_check: "price",
  // The table-level check (compare_at_price > price) gets Postgres's generic name.
  products_check: "compareAtPrice",
  products_compare_at_price_check: "compareAtPrice",
  products_stock_check: "stock",
  products_weight_gram_check: "weightGram",
  products_badge_check: "badge",
  products_status_check: "status",
};

const constraintOf = (text: string) => /constraint "([^"]+)"/.exec(text)?.[1];

/** NOT NULL columns of public.products and the field that fills each. */
const COLUMN_FIELD: Record<string, keyof ProductFormValues> = {
  name: "name",
  category_id: "categoryId",
  price: "price",
  stock: "stock",
  weight_gram: "weightGram",
  status: "status",
};

export function mapDbError(error: DbErrorLike | null | undefined): SaveError {
  if (!error) return { kind: "unknown" };
  const message = error.message ?? "";
  const text = `${message} ${error.details ?? ""}`;

  // A request that never reached the server has no Postgres code.
  if (!error.code && /failed to fetch|network|load failed|fetch failed/i.test(message)) return { kind: "network" };

  // PostgREST: the query matched no row, or Row Level Security hid it from this person.
  if (error.code === "PGRST116") return { kind: "notFound" };

  if (error.code === "42501" || /row-level security|permission denied/i.test(message)) return { kind: "forbidden" };

  if (error.code === "23505") {
    if (/products_slug_key/.test(text)) return { kind: "slugTaken", field: "name" };
    // A category slug clash can be retried with a suffix; the same name cannot.
    if (/categories_slug_key/.test(text)) return { kind: "slugTaken" };
    if (/categories_name_key/.test(text)) return { kind: "categoryNameTaken" };
    if (/product_images_object_key_key/.test(text)) return { kind: "photoKeyTaken" };
    return { kind: "duplicate" };
  }

  if (error.code === "23514") {
    const constraint = constraintOf(text);
    return { kind: "invalidValue", ...(constraint && CHECK_FIELD[constraint] ? { field: CHECK_FIELD[constraint] } : {}) };
  }

  if (error.code === "23502") {
    const column = /column "([^"]+)"/.exec(text)?.[1];
    return { kind: "invalidValue", ...(column && COLUMN_FIELD[column] ? { field: COLUMN_FIELD[column] } : {}) };
  }

  if (error.code === "23503") {
    return { kind: "missingReference", ...(/category_id/.test(text) ? { field: "categoryId" as const } : {}) };
  }

  return { kind: "unknown" };
}
