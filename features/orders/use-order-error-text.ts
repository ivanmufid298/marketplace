"use client";

import { useCallback } from "react";
import { t } from "@/lib/i18n";
import { useCatalog } from "@/features/catalog";
import type { OrderError } from "./lib/types";

/** The words for a failed order action; products are named so the buyer knows which line to fix. */
export function useOrderErrorText() {
  const { getProduct } = useCatalog();
  return useCallback(
    (error: OrderError) => t(`store.orderErrors.${error.kind}`, { name: (error.productId ? getProduct(error.productId)?.name : undefined) ?? t("store.orderErrors.thisProduct") }),
    [getProduct],
  );
}
