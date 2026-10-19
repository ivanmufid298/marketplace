// Public API of the shipping module for client code: looking a place up for an address. (Route handlers use "@/features/shipping/server".)

export { DestinationPicker } from "./components/destination-picker";
export { cityLine, placeLine, placeParts, titleCase } from "./lib/places";
export { forgetDestinations, useDestinationSearch, type DestinationSearch, type SearchError } from "./lib/use-destination-search";
export type { Destination, ProviderRate } from "./lib/types";
