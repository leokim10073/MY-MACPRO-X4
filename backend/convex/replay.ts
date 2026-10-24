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
import { appendEvent, requireHost, toMember } from "./lib";

const scripts: Record<string, ReplayScript> = { kevin };

/**
 * Host only. Schedules every line of the script using its delayMs. The script's
 * late joiner is skipped: a real person joins late from their own phone instead.
 */
export const start = mutation({
  args: { sessionToken: v.string(), script: v.optional(v.string()) },
  handler: async (ctx, { sessionToken, script = "kevin" }) => {
    const { room } = await requireHost(ctx, sessionToken);
    return await scheduleReplay(ctx, room._id, script);
  },
});

/**
 * For developers testing with the web app, where the host token lives in the
 * browser: `npx convex run replay:startLatest` replays into the newest active room.
 */
export const startLatest = internalMutation({
  args: { script: v.optional(v.string()) },
  handler: async (ctx, { script = "kevin" }) => {
    const room = await ctx.db
      .query("rooms")
      .order("desc")
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    if (!room) throw new ConvexError("No active room. Create one in the web app first.");
    return { roomId: room._id, ...(await scheduleReplay(ctx, room._id, script)) };
  },
});

async function scheduleReplay(ctx: MutationCtx, roomId: Id<"rooms">, script: string) {
  const replay = scripts[script];
  if (!replay) throw new ConvexError(`No replay script named "${script}"`);

  let delayMs = 0;
  for (const line of replay.lines) {
    delayMs += line.delayMs;
    await ctx.scheduler.runAfter(delayMs, internal.replay.playLine, {
      roomId,
      speakerName: line.speakerName,
      text: line.text,
    });
  }
  return { lines: replay.lines.length, durationMs: delayMs };
}

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
  // Scripted speakers are the members with no token who never left.
  const existing = members.find((m) => m.name === name && m.token === undefined && m.leftAt === undefined);
  if (existing) return existing;
  const room = (await ctx.db.get(roomId))!;
  const id = await ctx.db.insert("members", { roomId, name, joinedAtSeq: room.lastSeq });
  const member = (await ctx.db.get(id))!;
  await appendEvent(ctx, roomId, { type: "member_joined", member: toMember(member) });
  return member;
}
