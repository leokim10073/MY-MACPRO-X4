"use node";

// The always-on voice call (LiveKit), using voice/'s server helpers. Node runtime because
// livekit-server-sdk needs it. Needs the deployment's LiveKit keys, which never reach the browser:
//   npx convex env set LIVEKIT_URL wss://...   (and LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
// Without them the call is refused clearly and push-to-talk keeps working.

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import { requireUnderLimit } from "./limits";
import { endCall, mintCallToken, type LiveKitConfig } from "../../voice/src/server/livekit";

function liveKit(): LiveKitConfig | null {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  return url && apiKey && apiSecret ? { url, apiKey, apiSecret } : null;
}

/** A token to join this room's call (audio only), for members of an active room. */
export const callToken = action({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }): Promise<{ url: string; token: string }> => {
    const who = await ctx.runQuery(internal.voice.callIdentity, { sessionToken });
    const cfg = liveKit();
    if (!cfg) throw new ConvexError("The call isn't set up on this deployment");
    await requireUnderLimit(ctx, "callToken", who.memberId);
    return await mintCallToken(cfg, who);
  },
});

/** Scheduled by burn: removes everyone from the room's call. */
export const endRoomCall = internalAction({
  args: { roomId: v.string() },
  handler: async (_ctx, { roomId }) => {
    const cfg = liveKit();
    if (!cfg) return;
    await endCall(cfg, roomId);
  },
});
