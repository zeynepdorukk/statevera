import { defineConfig } from "vitest/config";

// Unit tests for the Worker API and the build scripts. They run in plain Node:
// Request, Response, fetch and Web Crypto are all globals there, as on Workers.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,mjs}"],
    environment: "node",
    restoreMocks: true,
  },
});
