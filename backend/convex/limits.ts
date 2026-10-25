// Rate limits, using the @convex-dev/rate-limiter component. The room keeps
// working when a limit is hit: lines are still saved, and only the extra AI or
// voice work is skipped. Requests a phone makes directly get a clear error.

import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError } from "convex/values";
import { components } from "./_generated/api";
import type { ActionCtx, MutationCtx } from "./_generated/server";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Whole deployment: new rooms from the public link.
  createRoom: { kind: "token bucket", rate: 60, period: HOUR, capacity: 20 },
  // Per room: lines from phones, and the AI recall check that runs on each line.
  addLine: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 30 },
  aiFastPath: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 30 },
  // Per room: story updates. Normally one every 25 s while people talk; over the
  // limit they come about once a minute instead.
  aiSlowPath: { kind: "token bucket", rate: 60, period: HOUR, capacity: 10 },
  // Per room: AI recaps with narration for latecomers. Over it, a short text recap.
  recap: { kind: "token bucket", rate: 10, period: HOUR, capacity: 5 },
  // Per member: speech-to-text tokens (each lives 120 s) and call tokens.
  sttToken: { kind: "token bucket", rate: 60, period: HOUR, capacity: 10 },
  callToken: { kind: "token bucket", rate: 30, period: HOUR, capacity: 10 },
});

type LimitName = "createRoom" | "addLine" | "aiFastPath" | "aiSlowPath" | "recap" | "sttToken" | "callToken";

/** Takes one unit, or throws a ConvexError the phone can show. */
export async function requireUnderLimit(ctx: MutationCtx | ActionCtx, name: LimitName, key?: string) {
  const { ok, retryAfter } = await rateLimiter.limit(ctx, name, { key });
  if (!ok) {
    const seconds = Math.max(1, Math.ceil(retryAfter / 1000));
    throw new ConvexError(`Too many requests. Try again in ${seconds} s.`);
  }
}

/** Takes one unit if there is one. False means skip the optional work. */
export async function underLimit(ctx: MutationCtx | ActionCtx, name: LimitName, key?: string) {
  const { ok } = await rateLimiter.limit(ctx, name, { key });
  return ok;
}
