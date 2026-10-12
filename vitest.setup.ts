import { vi } from "vitest";

// With no Supabase env, auth only runs the demo adapter in development (features/auth/lib/config.ts). Tests need a
// sign in that works without a network, so they run as "development".
vi.stubEnv("NODE_ENV", "development");

// jsdom does not implement scrolling; the storefront scrolls to the top on some navigation.
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
