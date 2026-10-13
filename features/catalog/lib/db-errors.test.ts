// Run with `npm run test:ui`. Postgres and PostgREST errors become a short reason, and a field when there is one.
import { describe, expect, it } from "vitest";
import { mapDbError } from "./db-errors";

describe("mapDbError", () => {
  it("knows an unknown error", () => {
    expect(mapDbError(null)).toEqual({ kind: "unknown" });
    expect(mapDbError({ code: "XX000", message: "boom" })).toEqual({ kind: "unknown" });
  });
  it("recognizes a request that never reached the server", () => {
    expect(mapDbError({ message: "Failed to fetch" })).toEqual({ kind: "network" });
    expect(mapDbError({ message: "TypeError: NetworkError when attempting to fetch resource" })).toEqual({ kind: "network" });
  });
  it("does not call a database error a network error just because of its wording", () => {
    expect(mapDbError({ code: "23514", message: 'violates check constraint "products_price_check" network' }).kind).toBe("invalidValue");
  });
  it("maps a permission problem however it is phrased", () => {
    expect(mapDbError({ code: "42501", message: "permission denied for table products" })).toEqual({ kind: "forbidden" });
    expect(mapDbError({ message: 'new row violates row-level security policy for table "products"' })).toEqual({ kind: "forbidden" });
  });
  it("trusts the permission code even when the message says something else", () => {
    expect(mapDbError({ code: "42501", message: "insufficient_privilege" })).toEqual({ kind: "forbidden" });
  });
  it("trusts the wording of a row-level-security message even without a code", () => {
    expect(mapDbError({ message: "new row violates row-level security policy" })).toEqual({ kind: "forbidden" });
  });
  it("maps a taken slug to the name field", () => {
    expect(mapDbError({ code: "23505", message: 'duplicate key value violates unique constraint "products_slug_key"' })).toEqual({ kind: "slugTaken", field: "name" });
  });
  it("maps taken category names and slugs, and photo keys", () => {
    expect(mapDbError({ code: "23505", message: 'duplicate key value violates unique constraint "categories_name_key"' }).kind).toBe("categoryNameTaken");
    expect(mapDbError({ code: "23505", message: 'duplicate key value violates unique constraint "categories_slug_key"' })).toEqual({ kind: "slugTaken" });
    expect(mapDbError({ code: "23505", message: 'duplicate key value violates unique constraint "product_images_object_key_key"' }).kind).toBe("photoKeyTaken");
  });
  it("maps a row that matches nothing, or is hidden by RLS, to notFound", () => {
    expect(mapDbError({ code: "PGRST116", message: "Cannot coerce the result to a single JSON object", details: "The result contains 0 rows" })).toEqual({ kind: "notFound" });
  });
  it("treats any other unique violation as a plain duplicate", () => {
    expect(mapDbError({ code: "23505", message: 'duplicate key value violates unique constraint "something_else"' })).toEqual({ kind: "duplicate" });
  });
  it.each([
    ["products_price_check", "price"], ["products_check", "compareAtPrice"], ["products_stock_check", "stock"],
    ["products_weight_gram_check", "weightGram"], ["products_status_check", "status"], ["products_name_check", "name"],
    ["products_badge_check", "badge"], ["products_description_check", "description"],
  ])("maps check constraint %s to field %s", (constraint, field) => {
    expect(mapDbError({ code: "23514", message: `new row for relation "products" violates check constraint "${constraint}"` })).toEqual({ kind: "invalidValue", field });
  });
  it("reports a check violation with no known field without one", () => {
    expect(mapDbError({ code: "23514", message: 'violates check constraint "products_slug_check"' })).toEqual({ kind: "invalidValue" });
  });
  it("maps a missing required value to its field", () => {
    expect(mapDbError({ code: "23502", message: 'null value in column "weight_gram" of relation "products" violates not-null constraint' })).toEqual({ kind: "invalidValue", field: "weightGram" });
    expect(mapDbError({ code: "23502", message: 'null value in column "mystery" violates not-null constraint' })).toEqual({ kind: "invalidValue" });
  });
  it("maps a missing category", () => {
    expect(mapDbError({ code: "23503", message: 'insert or update on table "products" violates foreign key constraint "products_category_id_fkey"', details: "Key (category_id)=(9) is not present in table \"categories\"." })).toEqual({ kind: "missingReference", field: "categoryId" });
  });
  it("maps another foreign key problem without a field", () => {
    expect(mapDbError({ code: "23503", message: 'violates foreign key constraint "product_images_product_id_fkey"' })).toEqual({ kind: "missingReference" });
  });
});
