import type { Cache } from "./cache";
import { searchDestinations } from "./destinations";
import type { Destination, ShippingProvider } from "./types";

// What the shop's own address search answers to the browser. Kept apart from the route file so it can be tested without a server.

export type DestinationSearchBody = { destinations: Destination[] } | { error: "signIn" | "tooShort" | "quota" | "unavailable" | "notConfigured" };
export type Reply<B> = { status: number; body: B };

/** Only signed-in buyers may search (every search can spend one of the day's free hits), and nothing about the provider is passed on but the places. */
export async function answerDestinationSearch(input: { query: string | null; signedIn: boolean; provider: ShippingProvider; cache: Cache }): Promise<Reply<DestinationSearchBody>> {
  if (!input.signedIn) return { status: 401, body: { error: "signIn" } };
  const result = await searchDestinations(input.provider, input.cache, input.query ?? "");
  if (result.ok) return { status: 200, body: { destinations: result.value } };
  switch (result.error) {
    case "tooShort":
      return { status: 400, body: { error: "tooShort" } };
    case "quota":
      return { status: 429, body: { error: "quota" } };
    case "notConfigured":
      return { status: 503, body: { error: "notConfigured" } };
    // Our key refused or a request it did not accept is not something the buyer can fix; to them it is simply not available.
    default:
      return { status: 503, body: { error: "unavailable" } };
  }
}
