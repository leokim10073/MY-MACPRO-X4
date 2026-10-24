/// <reference types="vite/client" />

// Backend tests. Run with `npm test`. Uses convex-test, an in-memory Convex
// with a controllable scheduler, so replay and slow path timers run instantly.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import kevin from "../../shared/fixtures/kevin.replay.json";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  return convexTest(schema, modules);
}
type T = ReturnType<typeof setup>;

/** create/join results flattened to the ids the tests use. */
function ids(r: { room: { id: string; inviteToken: string }; member: { id: string }; sessionToken: string }) {
  return {
    token: r.sessionToken,
    roomId: r.room.id as Id<"rooms">,
    memberId: r.member.id as Id<"members">,
    inviteToken: r.room.inviteToken,
  };
}

async function newRoom(t: T) {
  return ids(await t.mutation(api.rooms.create, { name: "Alex" }));
}

async function joinRoom(t: T, inviteToken: string, name: string) {
  return ids(await t.mutation(api.rooms.join, { inviteToken, name }));
}

async function addLine(t: T, token: string, text: string) {
  return await t.mutation(api.lines.add, { sessionToken: token, text, at: Date.now() });
}

async function runScheduled(t: T) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function rowCounts(t: T) {
  return await t.run(async (ctx) => ({
    lines: (await ctx.db.query("transcriptLines").collect()).length,
    recalls: (await ctx.db.query("recalls").collect()).length,
    storyStates: (await ctx.db.query("storyStates").collect()).length,
    recaps: (await ctx.db.query("recaps").collect()).length,
  }));
}

async function pendingSlowPaths(t: T) {
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return jobs.filter((j) => j.name.includes("slowPath") && j.state.kind === "pending").length;
}

/** A minimal valid story state from the slow path. */
function storyState(uptoSeq: number, tellerId: Id<"members">, lineId: Id<"transcriptLines">) {
  return {
    uptoSeq,
    people: [{ id: "p_kevin", name: "Kevin", aliases: ["Roommate Kevin"], storyIds: ["s_cake"] }],
    stories: [
      {
        id: "s_cake",
        personIds: ["p_kevin"],
        keyword: "Cake",
        summary: "Alex says Kevin ate the whole birthday cake.",
        tellerId,
        reactions: [],
        speculation: [],
        sourceLineIds: [lineId],
        firstSeq: 1,
        lastSeq: 1,
      },
    ],
    currentTopic: `topic at ${uptoSeq}`,
    openQuestions: [],
  };
}

describe("rooms and membership", () => {
  test("members never see each other's tokens", async () => {
    const t = setup();
    const host = await newRoom(t);
    await joinRoom(t, host.inviteToken, "Sam");
    const view = await t.query(api.rooms.get, { sessionToken: host.token });
    expect(view?.members.map((m) => m.name)).toEqual(["Alex", "Sam"]);
    expect(JSON.stringify(view)).not.toContain(host.token);
  });

  test("a wrong token can't read or write", async () => {
    const t = setup();
    await newRoom(t);
    await expect(t.query(api.lines.list, { sessionToken: "nope" })).rejects.toThrow("Not a member");
    await expect(addLine(t, "nope", "hi")).rejects.toThrow("Not a member");
    expect(await t.query(api.rooms.get, { sessionToken: "nope" })).toBeNull();
  });

  test("bad nicknames are rejected", async () => {
    const t = setup();
    await expect(t.mutation(api.rooms.create, { name: "  " })).rejects.toThrow("Nickname");
    await expect(t.mutation(api.rooms.create, { name: "x".repeat(31) })).rejects.toThrow("Nickname");
  });

  test("only the host can burn or start replay", async () => {
    const t = setup();
    const host = await newRoom(t);
    const sam = await joinRoom(t, host.inviteToken, "Sam");
    await expect(t.mutation(api.rooms.burn, { sessionToken: sam.token })).rejects.toThrow("Only the host");
    await expect(t.mutation(api.replay.start, { sessionToken: sam.token })).rejects.toThrow("Only the host");
  });
});

describe("transcript", () => {
  test("lines get increasing seqs and come back in order", async () => {
    const t = setup();
    const host = await newRoom(t);
    const sam = await joinRoom(t, host.inviteToken, "Sam");
    await addLine(t, host.token, "one");
    await addLine(t, sam.token, "two");
    await addLine(t, host.token, "three");
    const lines = await t.query(api.lines.list, { sessionToken: sam.token });
    expect(lines.map((l) => [l.seq, l.speakerName, l.text])).toEqual([
      [1, "Alex", "one"],
      [2, "Sam", "two"],
      [3, "Alex", "three"],
    ]);
  });

  test("blank lines are ignored and huge lines rejected", async () => {
    const t = setup();
    const host = await newRoom(t);
    expect(await addLine(t, host.token, "   ")).toBeNull();
    await expect(addLine(t, host.token, "x".repeat(2001))).rejects.toThrow("too long");
    expect((await rowCounts(t)).lines).toBe(0);
  });
});

describe("late join recap", () => {
  test("someone there from the start gets no recap", async () => {
    const t = setup();
    const host = await newRoom(t);
    const sam = await joinRoom(t, host.inviteToken, "Sam");
    await runScheduled(t);
    expect(await t.query(api.story.myRecap, { sessionToken: sam.token })).toBeNull();
  });

  test("a late joiner gets a recap covering only lines before they joined", async () => {
    const t = setup();
    const host = await newRoom(t);
    await addLine(t, host.token, "one");
    await addLine(t, host.token, "two");
    const taylor = await joinRoom(t, host.inviteToken, "Taylor");
    await addLine(t, host.token, "three");
    await runScheduled(t);

    const me = await t.query(api.rooms.get, { sessionToken: taylor.token });
    expect(me?.me.joinedAtSeq).toBe(2);
    const recap = await t.query(api.story.myRecap, { sessionToken: taylor.token });
    expect(recap?.uptoSeq).toBe(2);
    expect(recap?.text).toContain("2 lines");
    expect(await t.query(api.story.myRecap, { sessionToken: host.token })).toBeNull();
  });
});

describe("replay mode", () => {
  test("plays the whole Kevin script in order", async () => {
    const t = setup();
    const host = await newRoom(t);
    const started = await t.mutation(api.replay.start, { sessionToken: host.token });
    expect(started.lines).toBe(kevin.lines.length);
    await runScheduled(t);

    const lines = await t.query(api.lines.list, { sessionToken: host.token });
    expect(lines.map((l) => l.text)).toEqual(kevin.lines.map((l) => l.text));
    expect(lines.map((l) => l.speakerName)).toEqual(kevin.lines.map((l) => l.speakerName));
    expect(lines.map((l) => l.seq)).toEqual(kevin.lines.map((_, i) => i + 1));
  });

  test("respects delayMs between lines", async () => {
    const t = setup();
    const host = await newRoom(t);
    await t.mutation(api.replay.start, { sessionToken: host.token });
    const firstTwo = kevin.lines[0].delayMs + kevin.lines[1].delayMs;
    vi.advanceTimersByTime(firstTwo);
    await t.finishInProgressScheduledFunctions();
    expect((await t.query(api.lines.list, { sessionToken: host.token })).length).toBe(2);
  });

  test("scripted speakers can't be impersonated", async () => {
    const t = setup();
    const host = await newRoom(t);
    await t.mutation(api.replay.start, { sessionToken: host.token });
    await runScheduled(t);
    const speakers = await t.run((ctx) => ctx.db.query("members").collect());
    const scripted = speakers.filter((m) => m._id !== host.memberId);
    expect(scripted.length).toBeGreaterThan(0);
    expect(scripted.every((m) => m.token === undefined)).toBe(true);
  });

  test("lines still waiting when the room is burned never arrive", async () => {
    const t = setup();
    const host = await newRoom(t);
    await t.mutation(api.replay.start, { sessionToken: host.token });
    vi.advanceTimersByTime(10_000);
    await t.finishInProgressScheduledFunctions();
    expect((await rowCounts(t)).lines).toBeGreaterThan(0);

    await t.mutation(api.rooms.burn, { sessionToken: host.token });
    await runScheduled(t);
    expect((await rowCounts(t)).lines).toBe(0);
  });
});

describe("burn", () => {
  test("deletes the conversation and locks everyone out", async () => {
    const t = setup();
    const host = await newRoom(t);
    const line = await addLine(t, host.token, "one");
    const taylor = await joinRoom(t, host.inviteToken, "Taylor");
    await runScheduled(t);
    await t.mutation(internal.ai.saveRecalls, {
      lineId: line!.lineId,
      recalls: [{ personId: "p_kevin", storyIds: ["s_cake"], matchedText: "he", confidence: 0.9 }],
    });
    await t.mutation(internal.ai.saveStoryState, {
      roomId: host.roomId,
      state: storyState(1, host.memberId, line!.lineId),
    });
    expect(await rowCounts(t)).toEqual({ lines: 1, recalls: 1, storyStates: 1, recaps: 1 });

    await t.mutation(api.rooms.burn, { sessionToken: host.token });

    expect(await rowCounts(t)).toEqual({ lines: 0, recalls: 0, storyStates: 0, recaps: 0 });
    for (const token of [host.token, taylor.token]) {
      expect(await t.query(api.rooms.get, { sessionToken: token })).toBeNull();
      await expect(t.query(api.lines.list, { sessionToken: token })).rejects.toThrow();
      await expect(addLine(t, token, "hello?")).rejects.toThrow();
    }
    await expect(
      t.mutation(api.rooms.join, { inviteToken: host.inviteToken, name: "Late" }),
    ).rejects.toThrow("ended");
  });

  test("AI results that land after the burn are dropped", async () => {
    const t = setup();
    const host = await newRoom(t);
    const line = await addLine(t, host.token, "one");
    const taylor = await joinRoom(t, host.inviteToken, "Taylor");
    await t.mutation(api.rooms.burn, { sessionToken: host.token });

    await t.mutation(internal.ai.saveRecalls, {
      lineId: line!.lineId,
      recalls: [{ personId: "p_kevin", storyIds: ["s_cake"], matchedText: "he", confidence: 0.9 }],
    });
    await t.mutation(internal.ai.saveStoryState, {
      roomId: host.roomId,
      state: storyState(1, host.memberId, line!.lineId),
    });
    await t.mutation(internal.ai.saveRecap, { memberId: taylor.memberId, uptoSeq: 1, text: "late" });
    // The recap and fast path jobs scheduled before the burn also run now.
    await runScheduled(t);

    expect(await rowCounts(t)).toEqual({ lines: 0, recalls: 0, storyStates: 0, recaps: 0 });
  });

  test("abandoned rooms burn automatically after they expire", async () => {
    const t = setup();
    const old = await newRoom(t);
    vi.advanceTimersByTime(13 * 60 * 60 * 1000);
    const fresh = await newRoom(t);

    await t.mutation(internal.rooms.burnExpired, {});

    expect(await t.query(api.rooms.get, { sessionToken: old.token })).toBeNull();
    expect(await t.query(api.rooms.get, { sessionToken: fresh.token })).not.toBeNull();
  });
});

describe("AI wiring", () => {
  test("saved recalls reach phones, filtered by afterSeq", async () => {
    const t = setup();
    const host = await newRoom(t);
    const l1 = await addLine(t, host.token, "one");
    const l2 = await addLine(t, host.token, "he did it again");
    for (const line of [l1!, l2!]) {
      await t.mutation(internal.ai.saveRecalls, {
        lineId: line.lineId,
        recalls: [{ personId: "p_kevin", storyIds: ["s_cake"], matchedText: "he", confidence: 0.9 }],
      });
    }
    const all = await t.query(api.story.recalls, { sessionToken: host.token, afterSeq: 0 });
    expect(all.map((r) => r.seq)).toEqual([1, 2]);
    const newer = await t.query(api.story.recalls, { sessionToken: host.token, afterSeq: 1 });
    expect(newer).toHaveLength(1);
    expect(newer[0]).toMatchObject({ seq: 2, lineId: l2!.lineId, roomId: host.roomId, personId: "p_kevin" });
  });

  test("an older story state never overwrites a newer one", async () => {
    const t = setup();
    const host = await newRoom(t);
    const line = await addLine(t, host.token, "one");
    const save = (uptoSeq: number) =>
      t.mutation(internal.ai.saveStoryState, {
        roomId: host.roomId,
        state: storyState(uptoSeq, host.memberId, line!.lineId),
      });

    expect(await t.query(api.story.state, { sessionToken: host.token })).toBeNull();
    const topic = async () => (await t.query(api.story.state, { sessionToken: host.token }))?.currentTopic;
    await save(5);
    await save(3);
    expect(await topic()).toBe("topic at 5");
    await save(5);
    expect(await topic()).toBe("topic at 5");
    await save(7);

    const state = await t.query(api.story.state, { sessionToken: host.token });
    expect(state?.uptoSeq).toBe(7);
    expect(state?.stories[0].roomId).toBe(host.roomId);
    expect(state?.people[0].roomId).toBe(host.roomId);
    expect((await rowCounts(t)).storyStates).toBe(1);
  });

  test("at most one slow path run is waiting per room", async () => {
    const t = setup();
    const host = await newRoom(t);
    await addLine(t, host.token, "one");
    await addLine(t, host.token, "two");
    await addLine(t, host.token, "three");
    expect(await pendingSlowPaths(t)).toBe(1);

    await runScheduled(t);
    expect(await pendingSlowPaths(t)).toBe(0);

    // Once that run has started, the next line schedules a fresh one.
    await addLine(t, host.token, "four");
    expect(await pendingSlowPaths(t)).toBe(1);
  });
});

describe("event log (events.listAfter)", () => {
  async function events(t: T, room: { roomId: Id<"rooms">; token: string }, afterEventSeq = 0) {
    return await t.query(api.events.listAfter, {
      roomId: room.roomId,
      sessionToken: room.token,
      afterEventSeq,
    });
  }
  const types = (r: Awaited<ReturnType<typeof events>>) => r.events.map((e) => e.event.type);

  test("create and join return what the web client needs, and log member_joined", async () => {
    const t = setup();
    const created = await t.mutation(api.rooms.create, { name: "Alex" });
    expect(created.room).toMatchObject({ status: "active", hostMemberId: created.member.id });
    expect(created.member).toMatchObject({ name: "Alex", joinedAtSeq: 0, roomId: created.room.id });
    const host = ids(created);
    await joinRoom(t, host.inviteToken, "Sam");

    const log = await events(t, host);
    expect(log.status).toBe("active");
    expect(log.events.map((e) => e.eventSeq)).toEqual([1, 2]);
    expect(log.events.map((e) => e.event.type === "member_joined" && e.event.member.name)).toEqual([
      "Alex",
      "Sam",
    ]);
  });

  test("every change is logged once, in the order it happened", async () => {
    const t = setup();
    const host = await newRoom(t);
    const line = (await addLine(t, host.token, "Kevin ate my cake"))!;
    await t.mutation(internal.ai.saveStoryState, {
      roomId: host.roomId,
      state: storyState(1, host.memberId, line.lineId),
    });
    await t.mutation(internal.ai.saveRecalls, {
      lineId: line.lineId,
      recalls: [{ personId: "p_kevin", storyIds: ["s_cake"], matchedText: "Kevin", confidence: 0.9 }],
    });
    const taylor = await joinRoom(t, host.inviteToken, "Taylor");
    await runScheduled(t);

    const log = await events(t, taylor);
    expect(types(log)).toEqual([
      "member_joined",
      "line_added",
      "story_state_updated",
      "recall",
      "member_joined",
      "recap_ready",
    ]);
    expect(log.events.map((e) => e.eventSeq)).toEqual([1, 2, 3, 4, 5, 6]);

    const byType = Object.fromEntries(log.events.map((e) => [e.event.type, e.event]));
    expect(byType.line_added).toMatchObject({ line: { seq: 1, text: "Kevin ate my cake", speakerName: "Alex" } });
    expect(byType.story_state_updated).toMatchObject({ storyState: { roomId: host.roomId, uptoSeq: 1 } });
    expect(byType.recall).toMatchObject({ recall: { lineId: line.lineId, seq: 1, personId: "p_kevin" } });
    // The recap's uptoSeq equals the joiner's joinedAtSeq, which is how web matches it.
    expect(byType.recap_ready).toMatchObject({ recap: { uptoSeq: 1, roomId: host.roomId } });
  });

  test("afterEventSeq returns only newer events", async () => {
    const t = setup();
    const host = await newRoom(t);
    await addLine(t, host.token, "one");
    await addLine(t, host.token, "two");
    const newer = await events(t, host, 2);
    expect(newer.events.map((e) => e.eventSeq)).toEqual([3]);
    expect(newer.events[0].event).toMatchObject({ type: "line_added", line: { text: "two" } });
  });

  test("stale story states are not logged", async () => {
    const t = setup();
    const host = await newRoom(t);
    const line = (await addLine(t, host.token, "one"))!;
    const save = (uptoSeq: number) =>
      t.mutation(internal.ai.saveStoryState, {
        roomId: host.roomId,
        state: storyState(uptoSeq, host.memberId, line.lineId),
      });
    await save(5);
    await save(3);
    expect(types(await events(t, host)).filter((x) => x === "story_state_updated")).toHaveLength(1);
  });

  test("replay speakers are announced before their first line", async () => {
    const t = setup();
    const host = await newRoom(t);
    await t.mutation(api.replay.start, { sessionToken: host.token });
    await runScheduled(t);
    const log = await events(t, host);
    const firstLineOf = new Map<string, number>();
    const joinedAt = new Map<string, number>();
    for (const { eventSeq, event } of log.events) {
      if (event.type === "member_joined") joinedAt.set(event.member.id, eventSeq);
      if (event.type === "line_added" && !firstLineOf.has(event.line.speakerId)) {
        firstLineOf.set(event.line.speakerId, eventSeq);
      }
    }
    expect(firstLineOf.size).toBeGreaterThan(1);
    for (const [speakerId, seq] of firstLineOf) expect(joinedAt.get(speakerId)).toBeLessThan(seq);
    expect(types(log).filter((x) => x === "line_added")).toHaveLength(kevin.lines.length);
  });

  test("outsiders and members of other rooms can't read the log", async () => {
    const t = setup();
    const host = await newRoom(t);
    const other = await newRoom(t);
    await expect(events(t, { roomId: host.roomId, token: "nope" })).rejects.toThrow("Not a member");
    await expect(events(t, { roomId: host.roomId, token: other.token })).rejects.toThrow("Not a member");
    await expect(
      t.mutation(api.rooms.burn, { roomId: host.roomId, sessionToken: other.token }),
    ).rejects.toThrow("Not a member");
  });

  test("after a burn the log is deleted and every phone gets status burned", async () => {
    const t = setup();
    const host = await newRoom(t);
    const sam = await joinRoom(t, host.inviteToken, "Sam");
    await addLine(t, host.token, "one");
    await t.mutation(api.rooms.burn, { roomId: host.roomId, sessionToken: host.token });

    for (const member of [host, sam]) {
      expect(await events(t, member)).toEqual({ status: "burned", events: [] });
    }
    const rows = await t.run((ctx) => ctx.db.query("events").collect());
    expect(rows).toHaveLength(0);
  });

  test("replay:startLatest replays into the newest active room", async () => {
    const t = setup();
    const older = await newRoom(t);
    vi.advanceTimersByTime(1000);
    const newer = await newRoom(t);
    const started = await t.mutation(internal.replay.startLatest, {});
    expect(started.roomId).toBe(newer.roomId);
    await runScheduled(t);
    expect(types(await events(t, newer)).filter((x) => x === "line_added")).toHaveLength(kevin.lines.length);
    expect(types(await events(t, older))).toEqual(["member_joined"]);
  });
});
