// Who still has the room open, using the @convex-dev/presence component. Each
// phone sends a heartbeat while the room is open; a phone that stops (tab
// closed, browser killed) shows as offline after 2.5 heartbeat intervals, so
// the other phones drop it from the people count without anyone pressing Leave.

import { Presence } from "@convex-dev/presence";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireMember } from "./lib";

export const presence = new Presence(components.presence);

/**
 * Members only. The room and user come from the sessionToken, so a phone can
 * only mark itself online. `sessionId` is per tab. Returns the token for
 * `list` and the token for `disconnect`.
 */
export const heartbeat = mutation({
  args: { sessionToken: v.string(), sessionId: v.string(), interval: v.number() },
  handler: async (ctx, { sessionToken, sessionId, interval }) => {
    const { member, room } = await requireMember(ctx, sessionToken);
    const tokens = await presence.heartbeat(ctx, room._id, member._id, sessionId, interval);
    return { roomToken: tokens.roomToken, presenceToken: tokens.sessionToken };
  },
});

/** Everyone with a heartbeat in the room, online or not. The roomToken comes from `heartbeat`. */
export const list = query({
  args: { roomToken: v.string() },
  handler: async (ctx, { roomToken }) => {
    const people = await presence.list(ctx, roomToken);
    return people.map(({ userId, online }) => ({ memberId: userId, online }));
  },
});

/** Called with sendBeacon when the tab closes, so it can't send the sessionToken; the presenceToken is enough. */
export const disconnect = mutation({
  args: { presenceToken: v.string() },
  handler: async (ctx, { presenceToken }) => {
    await presence.disconnect(ctx, presenceToken);
  },
});
