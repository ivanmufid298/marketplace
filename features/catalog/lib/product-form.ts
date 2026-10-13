// The product form's rules, with no React or network code. Everything here mirrors a constraint in the catalog
// migration (supabase/migrations/20261013030000_catalog_products.sql), so the form can explain a mistake before the
// database would reject it. The database stays the last word: these limits are repeated there as CHECK constraints.

export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const LIMITS = {
  name: 160,
  description: 5000,
  badge: 40,
  slug: 80,
  weightGram: 1_000_000,
  stock: 1_000_000,
  /** Photos per product. Keeps the form usable and the storage bill small. */
  photos: 8,
  /** Far above any real price, and well inside what a JavaScript number holds exactly. */
  price: 100_000_000_000,
} as const;

/** What the form holds: every field is text, because that is what an input gives. */
export type ProductFormValues = {
  name: string;
  description: string;
  categoryId: string;
  price: string;
  compareAtPrice: string;
  stock: string;
  weightGram: string;
  badge: string;
  status: ProductStatus;
};

/** A checked product, ready to save. */
export type ProductInput = {
  name: string;
  description: string;
  categoryId: number;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  weightGram: number;
  badge: string | null;
  status: ProductStatus;
};

/** Keys into admin.products.form.errors in content/id.json. */
export type ProductFieldError = "required" | "tooLong" | "notNumber" | "mustBePositive" | "tooHigh" | "compareNotHigher" | "invalid";
export type ProductFormErrors = Partial<Record<keyof ProductFormValues, ProductFieldError>>;

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  name: "",
  description: "",
  categoryId: "",
  price: "",
  compareAtPrice: "",
  stock: "0",
  weightGram: "",
  badge: "",
  status: "draft",
};

/**
 * Reads a whole number the way people in Indonesia write one: "89000", "89.000", "Rp 1.250.000". Dots only count as
 * thousands separators when they sit in the right places, so "89.5" is rejected instead of silently becoming 895.
 * Returns "empty" for a blank field and "invalid" for anything else that is not a whole number.
 */
export function parseWholeNumber(raw: string): number | "empty" | "invalid" {
  const text = raw.replace(/^\s*rp\.?\s*/i, "").replace(/\s+/g, "");
  if (text === "") return "empty";
  if (/^\d+$/.test(text)) return Number(text);
  if (/^\d{1,3}(\.\d{3})+$/.test(text)) return Number(text.replace(/\./g, ""));
  return "invalid";
}

export type ParseResult = { ok: true; value: ProductInput } | { ok: false; errors: ProductFormErrors };

export function parseProduct(values: ProductFormValues): ParseResult {
  const errors: ProductFormErrors = {};

  const name = values.name.trim();
  if (!name) errors.name = "required";
  else if (name.length > LIMITS.name) errors.name = "tooLong";

  const description = values.description.trim();
  if (description.length > LIMITS.description) errors.description = "tooLong";

  const categoryId = Number(values.categoryId);
  if (values.categoryId.trim() === "") errors.categoryId = "required";
  else if (!Number.isInteger(categoryId) || categoryId < 1) errors.categoryId = "invalid";

  const price = parseWholeNumber(values.price);
  if (price === "empty") errors.price = "required";
  else if (price === "invalid") errors.price = "notNumber";
  else if (price > LIMITS.price) errors.price = "tooHigh";

  let compareAtPrice: number | null = null;
  const compare = parseWholeNumber(values.compareAtPrice);
  if (compare === "invalid") errors.compareAtPrice = "notNumber";
  else if (compare !== "empty") {
    if (compare > LIMITS.price) errors.compareAtPrice = "tooHigh";
    // The struck-through price only means something if it is higher than the real one.
    else if (typeof price === "number" && compare <= price) errors.compareAtPrice = "compareNotHigher";
    else compareAtPrice = compare;
  }

  const stock = parseWholeNumber(values.stock);
  if (stock === "empty") errors.stock = "required";
  else if (stock === "invalid") errors.stock = "notNumber";
  else if (stock > LIMITS.stock) errors.stock = "tooHigh";

  const weightGram = parseWholeNumber(values.weightGram);
  if (weightGram === "empty") errors.weightGram = "required";
  else if (weightGram === "invalid") errors.weightGram = "notNumber";
  else if (weightGram < 1) errors.weightGram = "mustBePositive";
  else if (weightGram > LIMITS.weightGram) errors.weightGram = "tooHigh";

  const badgeText = values.badge.trim();
  if (badgeText.length > LIMITS.badge) errors.badge = "tooLong";

  if (!(PRODUCT_STATUSES as readonly string[]).includes(values.status)) errors.status = "invalid";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      description,
      categoryId,
      price: price as number,
      compareAtPrice,
      stock: stock as number,
      weightGram: weightGram as number,
      badge: badgeText === "" ? null : badgeText,
      status: values.status,
    },
  };
}

/** The product's address on the web: lowercase words joined by dashes. Accents are dropped ("Kopi Tubruk" to "kopi-tubruk"). */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LIMITS.slug)
    .replace(/-+$/g, "");
  return slug || "produk";
}

/** `slug-2`, `slug-3`, ... for when the plain slug is taken, trimmed so the result still fits the limit. */
export function slugWithSuffix(slug: string, attempt: number): string {
  if (attempt <= 1) return slug;
  const suffix = `-${attempt}`;
  return slug.slice(0, LIMITS.slug - suffix.length).replace(/-+$/g, "") + suffix;
}

/** Row shape written to public.products. */
export function toProductRow(input: ProductInput, slug?: string) {
  return {
    ...(slug ? { slug } : {}),
    name: input.name,
    description: input.description,
    category_id: input.categoryId,
    price: input.price,
    compare_at_price: input.compareAtPrice,
    stock: input.stock,
    weight_gram: input.weightGram,
    badge: input.badge,
    status: input.status,
  };
}

/** Turns a saved product back into form text, for the edit form. */
export function toFormValues(product: { name: string; description: string; categoryId: number; price: number; compareAtPrice: number | null; stock: number; weightGram: number; badge: string | null; status: ProductStatus }): ProductFormValues {
  return {
    name: product.name,
    description: product.description,
    categoryId: String(product.categoryId),
    price: String(product.price),
    compareAtPrice: product.compareAtPrice === null ? "" : String(product.compareAtPrice),
    stock: String(product.stock),
    weightGram: String(product.weightGram),
    badge: product.badge ?? "",
    status: product.status,
  };
}
