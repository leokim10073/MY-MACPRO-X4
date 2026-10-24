// Replay mode: plays a scripted conversation into a room line by line, so AI
// and web can work without microphones, and the demo has a backup.

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { ReplayScript } from "../../shared/schema";
import kevin from "../../shared/fixtures/kevin.replay.json";
import { insertLine } from "./lines";
import { requireHost } from "./lib";

const scripts: Record<string, ReplayScript> = { kevin };

/**
 * Host only. Schedules every line of the script using its delayMs. The script's
 * late joiner is skipped: a real person joins late from their own phone instead.
 */
export const start = mutation({
  args: { token: v.string(), script: v.optional(v.string()) },
  handler: async (ctx, { token, script = "kevin" }) => {
    const { room } = await requireHost(ctx, token);
    const replay = scripts[script];
    if (!replay) throw new ConvexError(`No replay script named "${script}"`);

    let delayMs = 0;
    for (const line of replay.lines) {
      delayMs += line.delayMs;
      await ctx.scheduler.runAfter(delayMs, internal.replay.playLine, {
        roomId: room._id,
        speakerName: line.speakerName,
        text: line.text,
      });
    }
    return { lines: replay.lines.length, durationMs: delayMs };
  },
});

export const playLine = internalMutation({
  args: { roomId: v.id("rooms"), speakerName: v.string(), text: v.string() },
  handler: async (ctx, { roomId, speakerName, text }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "active") return;
    const speaker = await replaySpeaker(ctx, roomId, speakerName);
    await insertLine(ctx, room, speaker, text, Date.now());
  },
});

/** Finds the scripted speaker's member row, creating it (with no token) the first time they speak. */
async function replaySpeaker(ctx: MutationCtx, roomId: Id<"rooms">, name: string) {
  const members = await ctx.db
    .query("members")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();
  const existing = members.find((m) => m.name === name && m.token === undefined);
  if (existing) return existing;
  const room = (await ctx.db.get(roomId))!;
  const id = await ctx.db.insert("members", { roomId, name, joinedAtSeq: room.lastSeq });
  return (await ctx.db.get(id))!;
}
