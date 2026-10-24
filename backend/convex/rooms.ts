// Rooms: create, join with a nickname, read room info, and burn.

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ROOM_TTL_MS, randomToken, requireHost, toMember, toRoom } from "./lib";

function cleanName(name: string) {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 30) {
    throw new ConvexError("Nickname must be 1 to 30 characters");
  }
  return trimmed;
}

/** Creates a room with the caller as host. The phone keeps `token` and sends it with every call. */
export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const roomId = await ctx.db.insert("rooms", {
      status: "active",
      inviteToken: randomToken(),
      expiresAt: Date.now() + ROOM_TTL_MS,
      lastSeq: 0,
      slowPathScheduled: false,
    });
    const token = randomToken();
    const memberId = await ctx.db.insert("members", {
      roomId,
      name: cleanName(name),
      joinedAtSeq: 0,
      token,
    });
    await ctx.db.patch(roomId, { hostMemberId: memberId });
    const room = (await ctx.db.get(roomId))!;
    return { token, memberId, roomId, inviteToken: room.inviteToken };
  },
});

/** Joins from an invite link or QR code. Late joiners get a recap. */
export const join = mutation({
  args: { inviteToken: v.string(), name: v.string() },
  handler: async (ctx, { inviteToken, name }) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_inviteToken", (q) => q.eq("inviteToken", inviteToken))
      .unique();
    if (!room || room.status !== "active") throw new ConvexError("This room has ended");

    const token = randomToken();
    const memberId = await ctx.db.insert("members", {
      roomId: room._id,
      name: cleanName(name),
      joinedAtSeq: room.lastSeq,
      token,
    });
    if (room.lastSeq > 0) {
      await ctx.scheduler.runAfter(0, internal.ai.writeRecap, { memberId });
    }
    return { token, memberId, roomId: room._id };
  },
});

/** The room, its members and who "me" is. Returns null once the room is burned, so the page can show the ended screen. */
export const get = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!member) return null;
    const room = await ctx.db.get(member.roomId);
    if (!room || room.status !== "active") return null;

    const members = await ctx.db
      .query("members")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    return { room: toRoom(room), me: toMember(member), members: members.map(toMember) };
  },
});

/** Host only. Ends the room for everyone and deletes the conversation. */
export const burn = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const { room } = await requireHost(ctx, token);
    await burnRoom(ctx, room._id);
  },
});

/** Burns abandoned rooms. Run by the cron in crons.ts. */
export const burnExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("rooms")
      .withIndex("by_status_expiresAt", (q) =>
        q.eq("status", "active").lt("expiresAt", Date.now()),
      )
      .take(20);
    for (const room of expired) await burnRoom(ctx, room._id);
  },
});

/**
 * Marks the room burned, deletes transcript, story state, recalls and recaps,
 * and invalidates every member token so nothing can be read or written again.
 * AI results that arrive later are dropped by the isRoomClosed checks in ai.ts.
 */
async function burnRoom(ctx: MutationCtx, roomId: Id<"rooms">) {
  await ctx.db.patch(roomId, { status: "burned" });

  const lines = await ctx.db
    .query("transcriptLines")
    .withIndex("by_room_seq", (q) => q.eq("roomId", roomId))
    .collect();
  const recalls = await ctx.db
    .query("recalls")
    .withIndex("by_room_seq", (q) => q.eq("roomId", roomId))
    .collect();
  const states = await ctx.db
    .query("storyStates")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();
  const members = await ctx.db
    .query("members")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();

  for (const doc of [...lines, ...recalls, ...states]) await ctx.db.delete(doc._id);
  for (const member of members) {
    const recaps = await ctx.db
      .query("recaps")
      .withIndex("by_member", (q) => q.eq("memberId", member._id))
      .collect();
    for (const recap of recaps) await ctx.db.delete(recap._id);
    await ctx.db.patch(member._id, { token: undefined });
  }
}
