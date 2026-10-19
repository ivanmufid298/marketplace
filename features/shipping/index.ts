// Public API of the shipping module for client code: looking a place up for an address. (Route handlers use "@/features/shipping/server".)

export { DestinationPicker } from "./components/destination-picker";
export { etdText } from "./lib/etd";
export { cityLine, placeLine, placeParts, titleCase } from "./lib/places";
export { forgetDestinations, useDestinationSearch, type DestinationSearch, type SearchError } from "./lib/use-destination-search";
export type { Destination, ProviderRate } from "./lib/types";

// Courier prices for the checkout: what each service would charge to send this cart to the buyer's saved address.
export { fetchQuote, useShippingQuote, type QuoteFailure, type ShippingQuote } from "./lib/use-shipping-quote";
export type { QuoteOption } from "./lib/quote";

// The shop's own shipping settings and manual rates, for the admin screen.
export { useShippingSettings, type ShippingSettingsState } from "./use-shipping-settings";
export { COURIERS, MAX_FEE, MAX_MARKUP, type ManualMethod, type SettingsError, type SettingsRepository, type SettingsResult, type SettingsServices, type ShippingSettings } from "./lib/settings-types";
export { settingsInDatabase } from "./lib/settings-services";
export { parseRupiah, groupRupiah } from "./lib/rupiah";
export { validateMethod, validateSettings } from "./lib/settings-validate";
