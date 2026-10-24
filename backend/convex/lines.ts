// Transcript lines: voice submits them, the backend orders and stores them,
// and every new line kicks off the AI fast path.

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { SLOW_PATH_DELAY_MS, requireMember, toLine } from "./lib";

/** Voice sends each finished phrase here (a NewTranscriptLine, minus roomId and speakerId, which come from the token). */
export const add = mutation({
  args: { token: v.string(), text: v.string(), at: v.number() },
  handler: async (ctx, { token, text, at }) => {
    const { member, room } = await requireMember(ctx, token);
    const trimmed = text.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length > 2000) throw new ConvexError("Line is too long");
    return await insertLine(ctx, room, member, trimmed, at);
  },
});

/** The room's transcript in order. */
export const list = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const { room } = await requireMember(ctx, token);
    const lines = await ctx.db
      .query("transcriptLines")
      .withIndex("by_room_seq", (q) => q.eq("roomId", room._id))
      .collect();
    return lines.map(toLine);
  },
});

/**
 * Gives the line the next seq, stores it, sends it to the AI fast path and
 * makes sure a slow path run is scheduled. Used by voice and by replay mode.
 */
export async function insertLine(
  ctx: MutationCtx,
  room: Doc<"rooms">,
  speaker: Doc<"members">,
  text: string,
  at: number,
) {
  const seq = room.lastSeq + 1;
  const lineId = await ctx.db.insert("transcriptLines", {
    roomId: room._id,
    speakerId: speaker._id,
    speakerName: speaker.name,
    text,
    seq,
    at,
  });
  await ctx.db.patch(room._id, { lastSeq: seq, slowPathScheduled: true });

  await ctx.scheduler.runAfter(0, internal.ai.fastPath, { lineId });
  if (!room.slowPathScheduled) {
    await ctx.scheduler.runAfter(SLOW_PATH_DELAY_MS, internal.ai.slowPath, { roomId: room._id });
  }
  return { lineId, seq };
}
