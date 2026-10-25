/// <reference types="vite/client" />

// Registers the app's Convex components (see convex/convex.config.ts) with a
// convex-test instance. Lives outside convex/ so it is never deployed.

import type { TestConvex } from "convex-test";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import presence from "@convex-dev/presence/test";
import rateLimiter from "@convex-dev/rate-limiter/test";

export function withComponents<T extends TestConvex<SchemaDefinition<GenericSchema, boolean>>>(t: T): T {
  presence.register(t);
  rateLimiter.register(t);
  return t;
}
