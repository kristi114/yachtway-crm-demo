import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The spike and integration tests hit a live Postgres; keep them out of the
    // default (DB-free) suite.
    exclude: ["**/node_modules/**", "**/dist/**", "src/spike/**", "src/**/*.integration.test.ts"],
  },
});
