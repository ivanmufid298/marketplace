import type { ReviewsError } from "./types";

// The review function in the database fails with a short code as its message; the connection can fail with no code at
// all. This turns both into one small set of reasons.

type DbErrorLike = { code?: string | null; message?: string | null };

const BY_MESSAGE: Record<string, ReviewsError> = {
  not_signed_in: "notSignedIn",
  item_not_found: "itemNotFound",
  not_reviewable: "notReviewable",
  invalid_rating: "invalidRating",
  invalid_review: "invalidReview",
};

export function mapReviewWriteError(error: DbErrorLike | null | undefined): ReviewsError {
  if (!error) return "unknown";
  const message = (error.message ?? "").trim();
  if (!error.code && /failed to fetch|network|load failed|fetch failed/i.test(message)) return "network";
  if (error.code === "28000") return "notSignedIn";
  if (BY_MESSAGE[message]) return BY_MESSAGE[message];
  if (error.code === "42501" || /row-level security|permission denied/i.test(message)) return "forbidden";
  return "unknown";
}
