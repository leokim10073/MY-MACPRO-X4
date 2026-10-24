// Convex tables for Gossip Window. A sketch, not final.
// Shapes mirror shared/schema.ts. Convex adds `_id` and `_creationTime` to every
// document, and those stand in for the shared `id` field (convert at the edge).
// Change shared/schema.ts first, then this file.

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const reaction = v.object({
  memberId: v.id("members"),
  memberName: v.string(),
  quote: v.string(),
  lineId: v.id("transcriptLines"),
});

export const speculation = v.object({
  memberId: v.id("members"),
  memberName: v.string(),
  text: v.string(),
  lineId: v.id("transcriptLines"),
});

// People and stories live inside the StoryState snapshot, so their ids are
// AI-assigned strings (e.g. "p_kevin", "s_cake"), not Convex document ids.
export const person = v.object({
  id: v.string(),
  name: v.string(),
  aliases: v.array(v.string()),
  memberId: v.optional(v.id("members")),
  storyIds: v.array(v.string()),
});

export const story = v.object({
  id: v.string(),
  personIds: v.array(v.string()),
  keyword: v.string(),
  summary: v.string(),
  tellerId: v.id("members"),
  reactions: v.array(reaction),
  speculation: v.array(speculation),
  openQuestion: v.optional(v.string()),
  sourceLineIds: v.array(v.id("transcriptLines")),
  firstSeq: v.number(),
  lastSeq: v.number(),
});

export const openQuestion = v.object({
  text: v.string(),
  lineIds: v.array(v.id("transcriptLines")),
});

export default defineSchema({
  rooms: defineTable({
    // Optional only because the room is created before its host member exists.
    hostMemberId: v.optional(v.id("members")),
    status: v.union(v.literal("active"), v.literal("burned")),
    inviteToken: v.string(),
    expiresAt: v.number(),
    // Highest seq handed out so far. The addLine mutation bumps it, and
    // Convex mutations are transactional, so seqs never collide.
    lastSeq: v.number(),
    // True while an AI slow path run is scheduled, so lines don't stack up runs.
    slowPathScheduled: v.boolean(),
    // Highest eventSeq handed out so far in the events table.
    lastEventSeq: v.number(),
  })
    .index("by_inviteToken", ["inviteToken"])
    .index("by_status_expiresAt", ["status", "expiresAt"]),

  members: defineTable({
    roomId: v.id("rooms"),
    name: v.string(),
    joinedAtSeq: v.number(),
    // Secret the phone keeps and sends with every call. Never returned to other members.
    // Replay speakers have no token, so nobody can act as them.
    token: v.optional(v.string()),
    // Set when the member taps Leave; their token is removed at the same time.
    leftAt: v.optional(v.number()),
  })
    .index("by_room", ["roomId"])
    .index("by_token", ["token"]),

  transcriptLines: defineTable({
    roomId: v.id("rooms"),
    speakerId: v.id("members"),
    speakerName: v.string(),
    text: v.string(),
    seq: v.number(),
    at: v.number(),
  }).index("by_room_seq", ["roomId", "seq"]),

  // One row per room. Replace it only when the incoming uptoSeq is higher.
  storyStates: defineTable({
    roomId: v.id("rooms"),
    uptoSeq: v.number(),
    people: v.array(person),
    stories: v.array(story),
    currentTopic: v.string(),
    openQuestions: v.array(openQuestion),
    updatedAt: v.number(),
  }).index("by_room", ["roomId"]),

  recalls: defineTable({
    roomId: v.id("rooms"),
    lineId: v.id("transcriptLines"),
    seq: v.number(),
    personId: v.string(),
    storyIds: v.array(v.string()),
    focusStoryId: v.optional(v.string()),
    matchedText: v.string(),
    confidence: v.number(),
  }).index("by_room_seq", ["roomId", "seq"]),

  // Append-only log of every RoomEvent, written in the same mutation as the
  // state change it describes. Phones replay it in eventSeq order (web/docs/design.md, issue 4).
  events: defineTable({
    roomId: v.id("rooms"),
    eventSeq: v.number(),
    // A RoomEvent from shared/schema.ts. Only the server writes it, through appendEvent.
    event: v.any(),
  }).index("by_room_eventSeq", ["roomId", "eventSeq"]),

  recaps: defineTable({
    roomId: v.id("rooms"),
    // The latecomer this recap was written for.
    memberId: v.id("members"),
    uptoSeq: v.number(),
    text: v.string(),
    audioUrl: v.optional(v.string()),
    // The narrated MP3 in Convex file storage, deleted on burn.
    audioStorageId: v.optional(v.id("_storage")),
  }).index("by_member", ["memberId"]),
});
