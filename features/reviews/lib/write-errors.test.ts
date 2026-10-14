// Run with `npm run test:ui`. How a failure of the review function or the connection becomes a reason the shop can word.
import { describe, expect, it } from "vitest";
import { mapReviewWriteError } from "./write-errors";

describe("mapReviewWriteError", () => {
  it("maps each code the review function raises", () => {
    const cases: [string, string][] = [["not_signed_in", "notSignedIn"], ["item_not_found", "itemNotFound"], ["not_reviewable", "notReviewable"], ["invalid_rating", "invalidRating"], ["invalid_review", "invalidReview"]];
    for (const [message, kind] of cases) expect(mapReviewWriteError({ code: "P0001", message })).toBe(kind);
  });
  it("maps a signed-out caller by its code too", () => {
    expect(mapReviewWriteError({ code: "28000", message: "anything" })).toBe("notSignedIn");
  });
  it("maps a request that never reached the server, but not a database error that merely mentions the network", () => {
    for (const message of ["Failed to fetch", "NetworkError when attempting to fetch", "Load failed", "TypeError: fetch failed"]) expect(mapReviewWriteError({ message })).toBe("network");
    expect(mapReviewWriteError({ code: "XX000", message: "network exploded" })).toBe("unknown");
  });
  it("maps a refusal by Row Level Security or missing privileges", () => {
    expect(mapReviewWriteError({ code: "42501", message: "permission denied for function submit_review" })).toBe("forbidden");
    expect(mapReviewWriteError({ message: "new row violates row-level security policy" })).toBe("forbidden");
  });
  it("falls back to unknown", () => {
    expect(mapReviewWriteError({ code: "XX000", message: "boom" })).toBe("unknown");
    expect(mapReviewWriteError(null)).toBe("unknown");
    expect(mapReviewWriteError(undefined)).toBe("unknown");
  });
});
