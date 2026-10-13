// Public API of the reviews module for server code: the product page reads reviews through this.
// Nothing reachable from here may import React or a "use client" file; features/architecture.test.mts enforces that.

export { getProductReviews } from "./lib/reviews-server";
export { aggregateRatingJsonLd } from "./lib/summary";
export { NO_REVIEWS, type ProductReview, type ProductReviews, type ReviewStats } from "./lib/types";
