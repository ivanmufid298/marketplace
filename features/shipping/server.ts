// Public API of the shipping module for server code (route handlers). No React in here.

import { defaultCache } from "./lib/cache";
import { createRajaOngkirProvider } from "./lib/rajaongkir";
import type { ShippingProvider } from "./lib/types";

export { answerDestinationSearch, type DestinationSearchBody, type Reply } from "./lib/handlers";

/** The shipping provider this deployment uses: RajaOngkir, with its key from the environment (never `NEXT_PUBLIC_`). */
export const shippingProvider = (): ShippingProvider => createRajaOngkirProvider({ apiKey: process.env.RAJAONGKIR_API_KEY });
export { defaultCache };
