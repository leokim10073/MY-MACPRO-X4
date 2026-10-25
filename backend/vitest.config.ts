import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test", "@convex-dev/presence", "@convex-dev/rate-limiter", "@convex-dev/batch-worker"] } },
    // Tests never call the real AI, Cartesia or LiveKit, even if the shell has keys.
    env: { ANTHROPIC_API_KEY: "", CARTESIA_API_KEY: "", LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "" },
  },
});
