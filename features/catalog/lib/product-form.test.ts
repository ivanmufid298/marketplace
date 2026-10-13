// Run with `npm run test:ui`. The product form's rules: reading Indonesian numbers, checking every field, and making
// slugs. These mirror the CHECK constraints in the catalog migration.
import { describe, expect, it } from "vitest";
import { EMPTY_PRODUCT_FORM, LIMITS, parseProduct, parseWholeNumber, slugify, slugWithSuffix, toFormValues, toProductRow, type ProductFormValues } from "./product-form";

const valid = (over: Partial<ProductFormValues> = {}): ProductFormValues => ({
  ...EMPTY_PRODUCT_FORM, name: "Mug Blush Daily", categoryId: "1", price: "89000", stock: "5", weightGram: "350", ...over,
});
const errorsOf = (over: Partial<ProductFormValues>) => {
  const result = parseProduct(valid(over));
  return result.ok ? {} : result.errors;
};

describe("parseWholeNumber", () => {
  it.each([["0", 0], ["89000", 89000], ["89.000", 89000], ["1.250.000", 1250000], ["Rp 89.000", 89000], ["rp89000", 89000], ["  350  ", 350], ["Rp. 1.000", 1000]])(
    "reads %j as %d", (text, expected) => expect(parseWholeNumber(text)).toBe(expected),
  );
  it.each([["89,5"], ["89.5"], ["8.9000"], ["1.2345"], ["-5"], ["abc"], ["12a"], ["1e3"], ["0x10"], ["89.00.0"]])(
    "rejects %j rather than guessing", (text) => expect(parseWholeNumber(text)).toBe("invalid"),
  );
  it.each([[""], ["   "], ["Rp"], ["Rp "]])("calls %j empty", (text) => expect(parseWholeNumber(text)).toBe("empty"));
});

describe("parseProduct", () => {
  it("accepts a minimal valid product and trims text", () => {
    const result = parseProduct(valid({ name: "  Mug  ", description: "  halus  ", badge: "  Baru " }));
    expect(result).toEqual({
      ok: true,
      value: { name: "Mug", description: "halus", categoryId: 1, price: 89000, compareAtPrice: null, stock: 5, weightGram: 350, badge: "Baru", status: "draft" },
    });
  });
  it("reads prices written with dots and Rp", () => {
    const result = parseProduct(valid({ price: "Rp 89.000", compareAtPrice: "119.000" }));
    expect(result.ok && [result.value.price, result.value.compareAtPrice]).toEqual([89000, 119000]);
  });
  it("turns a blank badge into null", () => {
    const result = parseProduct(valid({ badge: "   " }));
    expect(result.ok && result.value.badge).toBeNull();
  });
  it("collects every error at once", () => {
    expect(parseProduct(EMPTY_PRODUCT_FORM)).toEqual({ ok: false, errors: { name: "required", categoryId: "required", price: "required", weightGram: "required" } });
  });

  describe("name", () => {
    it("is required", () => expect(errorsOf({ name: "   " }).name).toBe("required"));
    it("allows exactly the limit and rejects one more", () => {
      expect(errorsOf({ name: "a".repeat(LIMITS.name) }).name).toBeUndefined();
      expect(errorsOf({ name: "a".repeat(LIMITS.name + 1) }).name).toBe("tooLong");
    });
  });
  describe("description", () => {
    it("may be empty", () => expect(errorsOf({ description: "" }).description).toBeUndefined());
    it("has a limit", () => expect(errorsOf({ description: "a".repeat(LIMITS.description + 1) }).description).toBe("tooLong"));
  });
  describe("category", () => {
    it("is required", () => expect(errorsOf({ categoryId: "" }).categoryId).toBe("required"));
    it.each([["0"], ["-1"], ["1.5"], ["abc"]])("rejects %j", (id) => expect(errorsOf({ categoryId: id }).categoryId).toBe("invalid"));
  });
  describe("price", () => {
    it("is required", () => expect(errorsOf({ price: "" }).price).toBe("required"));
    it("may be zero", () => expect(errorsOf({ price: "0" }).price).toBeUndefined());
    it("rejects text and negatives", () => {
      expect(errorsOf({ price: "murah" }).price).toBe("notNumber");
      expect(errorsOf({ price: "-100" }).price).toBe("notNumber");
    });
    it("has an upper bound", () => expect(errorsOf({ price: String(LIMITS.price + 1) }).price).toBe("tooHigh"));
  });
  describe("compare-at price", () => {
    it("is optional", () => expect(errorsOf({ compareAtPrice: "" }).compareAtPrice).toBeUndefined());
    it("must be higher than the price", () => {
      expect(errorsOf({ price: "89000", compareAtPrice: "89000" }).compareAtPrice).toBe("compareNotHigher");
      expect(errorsOf({ price: "89000", compareAtPrice: "50000" }).compareAtPrice).toBe("compareNotHigher");
      expect(errorsOf({ price: "89000", compareAtPrice: "89001" }).compareAtPrice).toBeUndefined();
    });
    it("is not compared when the price itself is wrong", () => expect(errorsOf({ price: "x", compareAtPrice: "10" }).compareAtPrice).toBeUndefined());
    it("rejects text", () => expect(errorsOf({ compareAtPrice: "banyak" }).compareAtPrice).toBe("notNumber"));
  });
  describe("stock", () => {
    it("may be zero but not blank", () => {
      expect(errorsOf({ stock: "0" }).stock).toBeUndefined();
      expect(errorsOf({ stock: "" }).stock).toBe("required");
    });
    it("rejects decimals and negatives", () => {
      expect(errorsOf({ stock: "1.5" }).stock).toBe("notNumber");
      expect(errorsOf({ stock: "-1" }).stock).toBe("notNumber");
    });
    it("has an upper bound", () => expect(errorsOf({ stock: String(LIMITS.stock + 1) }).stock).toBe("tooHigh"));
  });
  describe("weight (needed for shipping rates)", () => {
    it("is required", () => expect(errorsOf({ weightGram: "" }).weightGram).toBe("required"));
    it("must be at least 1 gram", () => expect(errorsOf({ weightGram: "0" }).weightGram).toBe("mustBePositive"));
    it("has an upper bound of 1,000 kg", () => {
      expect(errorsOf({ weightGram: "1000000" }).weightGram).toBeUndefined();
      expect(errorsOf({ weightGram: "1000001" }).weightGram).toBe("tooHigh");
    });
    it("is in grams, so a decimal kilo is rejected", () => expect(errorsOf({ weightGram: "0,5" }).weightGram).toBe("notNumber"));
  });
  describe("badge", () => {
    it("has a limit", () => {
      expect(errorsOf({ badge: "a".repeat(LIMITS.badge) }).badge).toBeUndefined();
      expect(errorsOf({ badge: "a".repeat(LIMITS.badge + 1) }).badge).toBe("tooLong");
    });
  });
  describe("status", () => {
    it.each(["draft", "active", "archived"])("accepts %s", (status) => expect(errorsOf({ status: status as never }).status).toBeUndefined());
    it("rejects anything else", () => expect(errorsOf({ status: "dijual" as never }).status).toBe("invalid"));
  });
});

describe("slugify", () => {
  it.each([
    ["Mug Blush Daily", "mug-blush-daily"],
    ["  Tote   Canvas!! ", "tote-canvas"],
    ["Sneakers Rosé", "sneakers-rose"],
    ["Café Crème Brûlée", "cafe-creme-brulee"],
    ["T-Shirt (XL) 100%", "t-shirt-xl-100"],
    ["A/B\\C", "a-b-c"],
  ])("%j becomes %j", (name, slug) => expect(slugify(name)).toBe(slug));
  it("falls back when nothing usable is left", () => {
    expect(slugify("!!!")).toBe("produk");
    expect(slugify("")).toBe("produk");
    expect(slugify("日本語")).toBe("produk");
  });
  it("fits the database limit and never ends with a dash", () => {
    const slug = slugify("kata ".repeat(40));
    expect(slug.length).toBeLessThanOrEqual(LIMITS.slug);
    expect(slug.endsWith("-")).toBe(false);
  });
  it("always satisfies the database's slug pattern", () => {
    for (const name of ["Mug", "Éclair à la crème", "100% Katun", "---", "a--b", "Z"]) expect(slugify(name)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe("slugWithSuffix", () => {
  it("leaves the first attempt alone and numbers the rest", () => {
    expect(slugWithSuffix("mug", 1)).toBe("mug");
    expect(slugWithSuffix("mug", 2)).toBe("mug-2");
    expect(slugWithSuffix("mug", 11)).toBe("mug-11");
  });
  it("still fits when the base is already at the limit", () => {
    const base = "a".repeat(LIMITS.slug);
    expect(slugWithSuffix(base, 3).length).toBeLessThanOrEqual(LIMITS.slug);
    expect(slugWithSuffix(base, 3).endsWith("-3")).toBe(true);
  });
});

describe("toProductRow / toFormValues", () => {
  const input = { name: "Mug", description: "d", categoryId: 2, price: 100, compareAtPrice: 150, stock: 3, weightGram: 200, badge: "Baru", status: "active" as const };
  it("writes the database column names", () => {
    expect(toProductRow(input, "mug")).toEqual({ slug: "mug", name: "Mug", description: "d", category_id: 2, price: 100, compare_at_price: 150, stock: 3, weight_gram: 200, badge: "Baru", status: "active" });
  });
  it("leaves the slug out when it is not being changed", () => expect("slug" in toProductRow(input)).toBe(false));
  it("round-trips through the form", () => {
    const parsed = parseProduct(toFormValues(input));
    expect(parsed).toEqual({ ok: true, value: input });
  });
  it("round-trips a product without a compare-at price or badge", () => {
    const bare = { ...input, compareAtPrice: null, badge: null };
    expect(parseProduct(toFormValues(bare))).toEqual({ ok: true, value: bare });
  });
});
