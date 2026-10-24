// What the AI produced, for the web app to subscribe to. Each phone decides
// what to show with missedStory and shouldShowRecall from shared/schema.ts.

import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireMember, toRecall, toRecap, toStoryState } from "./lib";

/** Latest people, stories and current topic. Null until the first slow path run. */
export const state = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const { room } = await requireMember(ctx, sessionToken);
    const state = await ctx.db
      .query("storyStates")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .unique();
    return state && toStoryState(state);
  },
});

/** Recalls from lines after `afterSeq`, oldest first. Pass the last seq the phone has seen. */
export const recalls = query({
  args: { sessionToken: v.string(), afterSeq: v.number() },
  handler: async (ctx, { sessionToken, afterSeq }) => {
    const { room } = await requireMember(ctx, sessionToken);
    const recalls = await ctx.db
      .query("recalls")
      .withIndex("by_room_seq", (q) => q.eq("roomId", room._id).gt("seq", afterSeq))
      .take(50);
    return recalls.map(toRecall);
  },
});

/** The caller's own catch-up recap. Null if they weren't late or it isn't written yet. */
export const myRecap = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const { member } = await requireMember(ctx, sessionToken);
    const recap = await ctx.db
      .query("recaps")
      .withIndex("by_member", (q) => q.eq("memberId", member._id))
      .first();
    return recap && toRecap(recap);
  },
});
