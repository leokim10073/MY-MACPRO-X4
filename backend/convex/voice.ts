// Wiring between the backend and voice/: short-lived speech-to-text tokens for
// the phones, and the narrated recap.
//
// Both need the deployment's Cartesia key, which never reaches the browser:
//   npx convex env set CARTESIA_API_KEY sk_car_...
// Without it, push-to-talk can't start and recaps stay text-only.

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { mintSttToken, synthesizeRecap } from "../../voice/src/server/cartesia";
import { appendEvent, isRoomClosed, requireMember, toRecap } from "./lib";
import { requireUnderLimit } from "./limits";

function cartesiaKey() {
  return process.env.CARTESIA_API_KEY || undefined;
}

/**
 * A speech-to-text token that lives 120 s, for members of an active room only.
 * The phone's TokenSource calls this before it expires.
 */
export const sttToken = action({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }): Promise<{ token: string; expiresAt: number }> => {
    const { memberId } = await ctx.runQuery(internal.voice.callIdentity, { sessionToken });
    const key = cartesiaKey();
    if (!key) throw new ConvexError("Voice isn't set up on this deployment");
    await requireUnderLimit(ctx, "sttToken", memberId);
    return await mintSttToken(key);
  },
});

/** Who is asking, for voice.sttToken and call.callToken. Members of an active room only. */
export const callIdentity = internalQuery({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const { member, room } = await requireMember(ctx, sessionToken);
    return { roomId: room._id as string, memberId: member._id as string, name: member.name };
  },
});

/**
 * Reads the recap aloud with Sonic, stores the MP3 and sends recap_ready again
 * with audioUrl set. Failures leave the text-only recap in place.
 */
export async function narrateRecap(ctx: ActionCtx, recapId: Id<"recaps">, text: string) {
  const key = cartesiaKey();
  if (!key) return;
  try {
    const { mp3, overLimit } = await synthesizeRecap(key, text);
    if (overLimit) console.warn("Recap is longer than RECAP_MAX_WORDS; tell the AI owner");
    const storageId = await ctx.storage.store(new Blob([mp3 as Uint8Array<ArrayBuffer>], { type: "audio/mpeg" }));
    await ctx.runMutation(internal.voice.saveRecapAudio, { recapId, storageId });
  } catch (error) {
    console.error("Recap audio failed, keeping the text-only recap", error);
  }
}

export const saveRecapAudio = internalMutation({
  args: { recapId: v.id("recaps"), storageId: v.id("_storage") },
  handler: async (ctx, { recapId, storageId }) => {
    const recap = await ctx.db.get(recapId);
    // Burned while the audio was being made: don't keep the file.
    if (!recap || (await isRoomClosed(ctx, recap.roomId))) {
      await ctx.storage.delete(storageId);
      return;
    }
    const audioUrl = (await ctx.storage.getUrl(storageId)) ?? undefined;
    await ctx.db.patch(recapId, { audioUrl, audioStorageId: storageId });
    await appendEvent(ctx, recap.roomId, { type: "recap_ready", recap: toRecap((await ctx.db.get(recapId))!) });
  },
});
