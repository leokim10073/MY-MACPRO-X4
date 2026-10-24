// The event log phones subscribe to. Each row is one RoomEvent from
// shared/schema.ts, in the order the server made the changes.

import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import type { RoomEvent } from "../../shared/schema";

export interface RoomEventEnvelope {
  eventSeq: number;
  event: RoomEvent;
}

/**
 * Every event after `afterEventSeq`, oldest first. Once the room is burned the
 * log is gone, so this returns status "burned" and the phone shows the ended screen.
 */
export const listAfter = query({
  args: { roomId: v.id("rooms"), sessionToken: v.string(), afterEventSeq: v.number() },
  handler: async (
    ctx,
    { roomId, sessionToken, afterEventSeq },
  ): Promise<{ status: "active" | "burned"; events: RoomEventEnvelope[] }> => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "active") return { status: "burned", events: [] };

    const member = await ctx.db
      .query("members")
      .withIndex("by_token", (q) => q.eq("token", sessionToken))
      .unique();
    if (!member || member.roomId !== roomId) throw new ConvexError("Not a member of this room");

    const rows = await ctx.db
      .query("events")
      .withIndex("by_room_eventSeq", (q) => q.eq("roomId", roomId).gt("eventSeq", afterEventSeq))
      .collect();
    return {
      status: "active",
      events: rows.map((r) => ({ eventSeq: r.eventSeq, event: r.event as RoomEvent })),
    };
  },
});
