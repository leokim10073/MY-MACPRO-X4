import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    // Tests never call the real AI or Cartesia, even if the shell has keys.
    env: { ANTHROPIC_API_KEY: "", CARTESIA_API_KEY: "" },
  },
});
