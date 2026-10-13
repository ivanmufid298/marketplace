import type { CSSProperties, ReactNode } from "react";
import { spritePosition } from "@/lib/format";
import type { Product } from "@/lib/mock/store";

type ProductImageProps = {
  product: Pick<Product, "name" | "photos" | "pos">;
  /** The element's own class (photo, hot-thumb, cart-thumb, ...), which sets its size and shape. */
  className: string;
  /** The `sizes` hint for the browser's choice between the photo sizes, such as "76px". */
  sizes: string;
  style?: CSSProperties;
  /** `span` where the picture sits inside a button, since a `div` is not allowed there. */
  as?: "div" | "span";
  /** The parent already picks the sprite piece through CSS (the product card's `data-pos`), so no inline position is added. */
  spriteFromParent?: boolean;
  /** Drawn over the photo, such as the tag and the heart on a product card. */
  children?: ReactNode;
};

/**
 * The picture of a product. A product with photos shows the cover as a real image (several sizes, lazy loaded). The
 * demo catalog has no photos and shows its piece of the demo sprite. A database product that has no photo yet shows
 * a plain tinted box, not somebody else's picture.
 */
export function ProductImage({ product, className, sizes, style, as: Tag = "div", spriteFromParent = false, children }: ProductImageProps) {
  const cover = product.photos?.[0];
  if (product.photos === undefined) {
    return <Tag className={className} style={spriteFromParent ? style : { ...style, backgroundPosition: spritePosition(product.pos ?? 0) }}>{children}</Tag>;
  }
  return (
    <Tag className={`${className} has-photo`} style={style}>
      {cover && (
        // eslint-disable-next-line @next/next/no-img-element -- already resized in the admin's browser, so next/image has nothing to add
        <img src={cover.src} srcSet={cover.srcSet} sizes={sizes} alt={cover.alt || product.name} width={cover.width ?? undefined} height={cover.height ?? undefined} loading="lazy" decoding="async" />
      )}
      {children}
    </Tag>
  );
}
