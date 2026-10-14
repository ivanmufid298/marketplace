// Public API of the reviews module: what buyers say about a product, shown in the detail panel and on the product page.

export { ProductReviews } from "./components/product-reviews";
export { ProductReviewsLoader } from "./components/product-reviews-loader";
export { useMyReviews, type MyReviews } from "./my-reviews";
export { useAdminReviews, type AdminReviews } from "./admin-reviews";
export type { AdminReview } from "./lib/admin-review-repository";
export type { BuyerReviewServices, AdminReviewServices } from "./lib/services";
export type { ReviewsError } from "./lib/types";
export { NO_REVIEWS, type ProductReview, type ProductReviews as ProductReviewsData, type ReviewStats } from "./lib/types";
