// Run with `npm test`. The rules for product photo sizes and keys, without a browser.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allVariantKeys, buildSrcSet, checkSourceFile, isTooSmallForBestQuality, MAX_SOURCE_BYTES, newPhotoKey, photoKeyBelongsTo,
  planVariants, publicObjectUrl, variantKey, VARIANT_WIDTHS,
} from "./image-variants.ts";

describe("planVariants", () => {
  it("scales a large landscape photo down to each target width, keeping the aspect ratio", () => {
    assert.deepEqual(planVariants(4000, 3000), [
      { target: 400, width: 400, height: 300 },
      { target: 800, width: 800, height: 600 },
      { target: 1600, width: 1600, height: 1200 },
    ]);
  });
  it("handles a portrait photo", () => {
    assert.deepEqual(planVariants(3000, 4000).map((v) => [v.width, v.height]), [[400, 533], [800, 1067], [1600, 2133]]);
  });
  it("never scales up: a small photo keeps its own size in every file", () => {
    assert.deepEqual(planVariants(600, 450), [
      { target: 400, width: 400, height: 300 },
      { target: 800, width: 600, height: 450 },
      { target: 1600, width: 600, height: 450 },
    ]);
  });
  it("a photo smaller than the smallest target is not enlarged", () => {
    assert.deepEqual(planVariants(300, 200).map((v) => [v.width, v.height]), [[300, 200], [300, 200], [300, 200]]);
  });
  it("always names one file per target width", () => assert.deepEqual(planVariants(10, 10).map((v) => v.target), [...VARIANT_WIDTHS]));
  it("never returns a zero-pixel side, even for a very wide strip", () => assert.ok(planVariants(8000, 1).every((v) => v.height >= 1)));
  it("rounds fractional sizes", () => assert.ok(planVariants(1234, 777).every((v) => Number.isInteger(v.width) && Number.isInteger(v.height))));
  it("rejects a zero, negative, or non-finite size", () => {
    for (const [w, h] of [[0, 10], [10, 0], [-1, 5], [NaN, 5], [5, Infinity]]) assert.throws(() => planVariants(w, h));
  });
});

describe("checkSourceFile", () => {
  it("accepts JPEG, PNG, and WebP", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) assert.equal(checkSourceFile({ type, size: 1000 }), null);
  });
  it("rejects other types, including GIF, SVG, and PDF", () => {
    for (const type of ["image/gif", "image/svg+xml", "application/pdf", "", "text/html"]) assert.equal(checkSourceFile({ type, size: 1000 }), "type");
  });
  it("rejects an empty file", () => assert.equal(checkSourceFile({ type: "image/png", size: 0 }), "empty"));
  it("rejects a file over the limit and accepts one exactly at it", () => {
    assert.equal(checkSourceFile({ type: "image/jpeg", size: MAX_SOURCE_BYTES + 1 }), "size");
    assert.equal(checkSourceFile({ type: "image/jpeg", size: MAX_SOURCE_BYTES }), null);
  });
  it("checks the type before the size", () => assert.equal(checkSourceFile({ type: "image/gif", size: MAX_SOURCE_BYTES + 1 }), "type"));
});

describe("isTooSmallForBestQuality", () => {
  it("warns below 800 px wide only", () => {
    assert.equal(isTooSmallForBestQuality(799), true);
    assert.equal(isTooSmallForBestQuality(800), false);
  });
});

describe("keys", () => {
  const id = "3f2b8c1e-aaaa-4bbb-8ccc-123456789abc";
  it("builds a photo key under the product", () => assert.equal(newPhotoKey(12, id, "webp"), `products/12/${id}.webp`));
  it("rejects an unsaved product id", () => {
    for (const bad of [0, -3, 1.5, NaN]) assert.throws(() => newPhotoKey(bad, id, "webp"));
  });
  it("rejects an id that could escape the folder", () => {
    for (const bad of ["../x", "a/b", "short", "has space!!", ""]) assert.throws(() => newPhotoKey(1, bad, "webp"));
  });
  it("puts the size before the extension", () => {
    assert.equal(variantKey("products/12/ab12cd34.webp", 800), "products/12/ab12cd34-800.webp");
    assert.equal(variantKey("products/12/ab12cd34.jpg", 400), "products/12/ab12cd34-400.jpg");
  });
  it("lists every size", () => assert.deepEqual(allVariantKeys("products/1/abcdefgh.webp"), ["products/1/abcdefgh-400.webp", "products/1/abcdefgh-800.webp", "products/1/abcdefgh-1600.webp"]));
  it("refuses a key without an extension", () => {
    for (const bad of ["products/12/abc", "products/12/abc.", ".webp"]) assert.throws(() => variantKey(bad, 400));
  });
  it("only a product's own folder belongs to it", () => {
    assert.equal(photoKeyBelongsTo("products/12/a.webp", 12), true);
    assert.equal(photoKeyBelongsTo("products/123/a.webp", 12), false); // prefix of the number must not match
    assert.equal(photoKeyBelongsTo("products/1/a.webp", 12), false);
    assert.equal(photoKeyBelongsTo("other/12/a.webp", 12), false);
  });
});

describe("urls", () => {
  it("builds a public object URL and tolerates a trailing slash", () => {
    assert.equal(publicObjectUrl("https://x.supabase.co/", "product-images", "products/1/a-400.webp"), "https://x.supabase.co/storage/v1/object/public/product-images/products/1/a-400.webp");
  });
  it("encodes each path segment but keeps the slashes", () => {
    assert.equal(publicObjectUrl("https://x.supabase.co", "b", "products/1/a b.webp"), "https://x.supabase.co/storage/v1/object/public/b/products/1/a%20b.webp");
  });
  it("builds a srcset with width descriptors", () => {
    assert.equal(buildSrcSet((w) => `/p-${w}.webp`), "/p-400.webp 400w, /p-800.webp 800w, /p-1600.webp 1600w");
  });
});
