import path from "node:path";
import { defineConfig } from "vitest/config";

// Component and provider tests (jsdom). The pure-logic tests under lib/ and features/ run with `node --test`
// (see the "test" script) and are not picked up here: only *.test.tsx files are.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    environment: "jsdom",
    include: ["**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "prototype/**"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
