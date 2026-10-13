import path from "node:path";
import { defineConfig } from "vitest/config";

// Component, provider, and browser-API tests (jsdom): *.test.ts and *.test.tsx. Pure-logic tests that need no bundler
// are *.test.mts and run with `node --test` (see the "test" script); vitest does not pick those up.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    environment: "jsdom",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "prototype/**"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
