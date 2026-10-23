// Public API of the brand module for client code: the shop's name and logo, and changing them. (Route handlers use "@/features/brand/server".)

export { BrandProvider, useBrand, type BrandContextValue } from "./brand-provider";
export { brandInDatabase } from "./lib/services";
export { cleanName } from "./lib/validate";
export { DEFAULT_SHOP_NAME, MAX_NAME_LENGTH, type BrandError, type BrandResult, type BrandServices, type ShopProfile } from "./lib/types";
export { ACCEPTED_LOGO_TYPES, MAX_LOGO_SOURCE_BYTES } from "./lib/logo-image";
