// Transcript lines: voice submits them, the backend orders and stores them,
// and every new line kicks off the AI fast path.

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { SLOW_PATH_DELAY_MS, appendEvent, requireMember, toLine } from "./lib";
import { requireUnderLimit, underLimit } from "./limits";

/** Voice sends each finished phrase here (a NewTranscriptLine, minus roomId and speakerId, which come from the sessionToken). */
export const add = mutation({
  args: { sessionToken: v.string(), text: v.string(), at: v.number() },
  handler: async (ctx, { sessionToken, text, at }) => {
    const { member, room } = await requireMember(ctx, sessionToken);
    const trimmed = text.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length > 2000) throw new ConvexError("Line is too long");
    await requireUnderLimit(ctx, "addLine", room._id);
    return await insertLine(ctx, room, member, trimmed, at);
  },
});

/** The room's transcript in order. */
export const list = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const { room } = await requireMember(ctx, sessionToken);
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
  const line = (await ctx.db.get(lineId))!;
  await appendEvent(ctx, room._id, { type: "line_added", line: toLine(line) });

  // Over the limit the line is still saved and shown; it just isn't checked for recalls.
  if (await underLimit(ctx, "aiFastPath", room._id)) {
    await ctx.scheduler.runAfter(0, internal.ai.fastPath, { lineId });
  }
  if (!room.slowPathScheduled) {
    await ctx.scheduler.runAfter(SLOW_PATH_DELAY_MS, internal.ai.slowPath, { roomId: room._id });
  }
  return { lineId, seq };
}
