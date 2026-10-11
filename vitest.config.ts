import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    env: {
      DATABASE_URL: "pglite://memory",
      NODE_ENV: "test",
      LOG_LEVEL: "error",
      // Turn the optional features on; tests swap in fakes for the providers.
      VOICE_PROVIDER: "simulated",
      ANTHROPIC_API_KEY: "test-key",
      RESEND_API_KEY: "test-key",
    },
    testTimeout: 30_000,
  },
});
