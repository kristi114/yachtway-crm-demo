import { defineConfig } from "vitest/config";

// Integration tests that hit a live Postgres. Requires the local DB up and
// `pnpm --filter @yachtway/api db:setup` run first (migrate + policies + seed).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    // DB writes must not race across files.
    fileParallelism: false,
  },
});
