"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { Product } from "@/lib/mock/store";
import { useCatalog } from "@/features/catalog";

/**
 * The widest screen that counts as a phone. It is the same width at which the product panel turns full-screen in
 * store.css, so "phone" means the same thing here and there.
 */
export const PHONE_QUERY = "(max-width: 500px)";

/**
 * What tapping a product does. On a phone the product's own page opens, because a full-screen panel is a page anyway
 * and a real page can be shared and reached with the back button. On a bigger screen the side panel opens, like
 * WhatsApp Web, and the shopper stays on the list. The screen is measured at the moment of the tap, so turning the
 * phone or resizing the window needs no refresh. A product without an address (the sample products) always uses the panel.
 */
export function useOpenProduct() {
  const { openDetail } = useCatalog();
  const router = useRouter();
  return useCallback(
    (product: Product) => {
      const onPhone = typeof window.matchMedia === "function" && window.matchMedia(PHONE_QUERY).matches;
      if (onPhone && product.slug) router.push(`/produk/${product.slug}`);
      else openDetail(product);
    },
    [openDetail, router],
  );
}
