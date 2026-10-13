// Run with `npm run test:ui`. The three ways a product picture can look.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Product } from "@/lib/mock/store";
import { ProductImage } from "./product-image";

const base: Product = { id: 1, name: "Mug Blush Daily", cat: "Rumah", price: 1, stock: 1, desc: "" };
const photo = (n: number) => ({ src: `https://cdn.test/${n}-800.webp`, srcSet: `https://cdn.test/${n}-400.webp 400w`, alt: `Foto ${n}`, width: 1600, height: 1200 });
afterEach(cleanup);

describe("a demo product (no photos field)", () => {
  it("shows its piece of the sprite and no image", () => {
    const { container } = render(<ProductImage product={{ ...base, pos: 2 }} className="photo" sizes="100px">child</ProductImage>);
    const box = container.firstElementChild as HTMLElement;
    expect(box.className).toBe("photo");
    expect(box.style.backgroundPosition).toBe("100% 0px");
    expect(container.querySelector("img")).toBeNull();
    expect(box.textContent).toBe("child");
  });
  it("adds no inline position when the parent picks the sprite piece through CSS", () => {
    const { container } = render(<ProductImage product={{ ...base, pos: 2 }} className="photo" sizes="100px" spriteFromParent />);
    expect((container.firstElementChild as HTMLElement).getAttribute("style")).toBeNull();
  });
  it("renders a span when asked, for places inside a button", () => {
    const demo = render(<ProductImage product={base} as="span" className="hot-thumb" sizes="1px" />);
    expect(demo.container.firstElementChild!.tagName).toBe("SPAN");
    const real = render(<ProductImage product={{ ...base, photos: [] }} as="span" className="hot-thumb" sizes="1px" />);
    expect(real.container.firstElementChild!.tagName).toBe("SPAN");
    expect(render(<ProductImage product={base} className="photo" sizes="1px" />).container.firstElementChild!.tagName).toBe("DIV");
  });
  it("uses the first sprite piece when no position is given", () => {
    const { container } = render(<ProductImage product={base} className="photo" sizes="100px" />);
    expect((container.firstElementChild as HTMLElement).style.backgroundPosition).toBe("0px 0px");
  });
});

describe("a database product with photos", () => {
  it("shows the cover as a lazy image with all sizes and no sprite", () => {
    const { container } = render(<ProductImage product={{ ...base, photos: [photo(1), photo(2)] }} className="hot-thumb" sizes="76px" />);
    const box = container.firstElementChild as HTMLElement;
    expect(box.className).toBe("hot-thumb has-photo");
    expect(box.style.backgroundPosition).toBe("");
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://cdn.test/1-800.webp");
    expect(img.getAttribute("srcset")).toBe("https://cdn.test/1-400.webp 400w");
    expect(img.getAttribute("sizes")).toBe("76px");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("width")).toBe("1600");
    expect(img.getAttribute("height")).toBe("1200");
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });
  it("uses the product name when the photo has no description", () => {
    const { container } = render(<ProductImage product={{ ...base, photos: [{ ...photo(1), alt: "" }] }} className="photo" sizes="1px" />);
    expect(container.querySelector("img")!.getAttribute("alt")).toBe("Mug Blush Daily");
  });
  it("leaves out the size attributes when they are unknown", () => {
    const { container } = render(<ProductImage product={{ ...base, photos: [{ ...photo(1), width: null, height: null }] }} className="photo" sizes="1px" />);
    const img = container.querySelector("img")!;
    expect(img.hasAttribute("width")).toBe(false);
    expect(img.hasAttribute("height")).toBe(false);
  });
  it("draws the children (tag, heart) after the image so they sit on top", () => {
    const { container } = render(<ProductImage product={{ ...base, photos: [photo(1)] }} className="photo" sizes="1px"><span>tag</span></ProductImage>);
    const kids = [...(container.firstElementChild as HTMLElement).children].map((c) => c.tagName);
    expect(kids).toEqual(["IMG", "SPAN"]);
  });
});

describe("a database product with no photo yet", () => {
  it("shows a plain box, not a piece of the demo sprite", () => {
    const { container } = render(<ProductImage product={{ ...base, photos: [], pos: 3 }} className="photo" sizes="1px" />);
    const box = container.firstElementChild as HTMLElement;
    expect(box.className).toBe("photo has-photo");
    expect(box.style.backgroundPosition).toBe("");
    expect(container.querySelector("img")).toBeNull();
  });
});
