import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    // Tests never call the real AI, even if the shell has a key.
    env: { ANTHROPIC_API_KEY: "" },
  },
});
