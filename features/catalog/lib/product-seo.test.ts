// Run with `npm run test:ui`. The text and data search engines read from a product page.
import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/mock/store";
import { jsonLdScript, largestPhotoUrl, metaDescription, productJsonLd } from "./product-seo";

const photo = (n: number) => ({ src: `https://cdn.test/${n}-800.webp`, srcSet: `https://cdn.test/${n}-400.webp 400w, https://cdn.test/${n}-800.webp 800w, https://cdn.test/${n}-1600.webp 1600w`, alt: "", width: 1600, height: 1200 });
const product: Product = { id: 7, name: "Mug Blush Daily", cat: "Rumah", price: 89000, stock: 5, desc: "Mug keramik berglasir.", photos: [photo(1), photo(2)] };

describe("metaDescription", () => {
  it("leaves a short text as it is, with whitespace tidied", () => {
    expect(metaDescription("  Mug   keramik\n\nberglasir. ")).toBe("Mug keramik berglasir.");
    expect(metaDescription("")).toBe("");
  });
  it("keeps a text of exactly the limit and cuts one a character longer", () => {
    expect(metaDescription("a".repeat(160))).toBe("a".repeat(160));
    expect(metaDescription("a".repeat(161)).length).toBeLessThanOrEqual(160);
    expect(metaDescription("a".repeat(161)).endsWith("…")).toBe(true);
  });
  it("cuts at a word, drops trailing punctuation, and ends with an ellipsis", () => {
    const text = "kata ".repeat(60).trim() + ".";
    const out = metaDescription(text);
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith("kata…")).toBe(true);
    expect(metaDescription("Halo dunia, ini deskripsi yang cukup panjang untuk dipotong di tengah kalimat, lalu berlanjut lagi dan lagi sampai melewati batas yang ditentukan oleh fungsi ini.", 60)).toBe("Halo dunia, ini deskripsi yang cukup panjang untuk dipotong…");
  });
  it("cuts mid-word when there is no word break near the limit", () => {
    expect(metaDescription("x".repeat(300), 50)).toBe("x".repeat(49) + "…");
  });
  it("honours a custom limit", () => {
    expect(metaDescription("satu dua tiga empat lima", 10)).toBe("satu dua…");
  });
});

describe("largestPhotoUrl", () => {
  it("takes the widest file from the srcset", () => {
    expect(largestPhotoUrl(photo(1))).toBe("https://cdn.test/1-1600.webp");
  });
  it("falls back to src when there is no srcset", () => {
    expect(largestPhotoUrl({ src: "https://cdn.test/a.webp", srcSet: "" })).toBe("https://cdn.test/a.webp");
  });
});

describe("productJsonLd", () => {
  const data = productJsonLd(product, "https://shop.test/produk/mug") as Record<string, unknown> & { offers: Record<string, unknown> };
  it("describes the product for schema.org", () => {
    expect(data).toMatchObject({ "@context": "https://schema.org", "@type": "Product", name: "Mug Blush Daily", sku: "7", category: "Rumah", description: "Mug keramik berglasir." });
    expect(data.image).toEqual(["https://cdn.test/1-1600.webp", "https://cdn.test/2-1600.webp"]);
  });
  it("offers it in rupiah at its price, in stock", () => {
    expect(data.offers).toEqual({ "@type": "Offer", url: "https://shop.test/produk/mug", priceCurrency: "IDR", price: 89000, availability: "https://schema.org/InStock" });
  });
  it("says out of stock at zero stock", () => {
    const sold = productJsonLd({ ...product, stock: 0 }, "u") as { offers: { availability: string } };
    expect(sold.offers.availability).toBe("https://schema.org/OutOfStock");
  });
  it("leaves out the image and description when there are none", () => {
    const bare = productJsonLd({ ...product, desc: "", photos: [] }, "u");
    expect(bare).not.toHaveProperty("image");
    expect(bare).not.toHaveProperty("description");
  });
});

describe("jsonLdScript", () => {
  it("cannot be broken out of its script tag", () => {
    const out = jsonLdScript({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("<");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>");
  });
});
