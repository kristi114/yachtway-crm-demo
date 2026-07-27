import { defineConfig } from "vitest/config";

// Dedicated config for the permission spike. Requires the Docker Postgres up
// and `pnpm --filter @yachtway/api spike:apply` run first.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/spike/**/*.spike.test.ts"],
  },
});
