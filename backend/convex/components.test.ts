/// <reference types="vite/client" />

// The Convex components: presence (who still has the room open) and the rate limiter.

import { convexTest } from "convex-test";
import { withComponents } from "../testComponents";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function room() {
  const t = withComponents(convexTest(schema, modules));
  const host = await t.mutation(api.rooms.create, { name: "Alex" });
  const sam = await t.mutation(api.rooms.join, { inviteToken: host.room.inviteToken, name: "Sam" });
  const beat = (who: { sessionToken: string }, sessionId: string) =>
    t.mutation(api.presence.heartbeat, { sessionToken: who.sessionToken, sessionId, interval: 15_000 });
  return { t, host, sam, beat };
}

describe("presence", () => {
  test("members who send heartbeats show as online, keyed by member id", async () => {
    const { t, host, sam, beat } = await room();
    const { roomToken } = await beat(host, "tab-a");
    await beat(sam, "tab-s");
    const people = await t.query(api.presence.list, { roomToken });
    expect(people).toHaveLength(2);
    expect(new Set(people.map((p) => p.memberId))).toEqual(new Set([host.member.id, sam.member.id]));
    expect(people.every((p) => p.online)).toBe(true);
  });

  test("closing the tab (disconnect) shows the member offline", async () => {
    const { t, host, sam, beat } = await room();
    const { roomToken } = await beat(host, "tab-a");
    const { presenceToken } = await beat(sam, "tab-s");
    await t.mutation(api.presence.disconnect, { presenceToken });
    const people = await t.query(api.presence.list, { roomToken });
    expect(people.find((p) => p.memberId === sam.member.id)?.online).toBe(false);
    expect(people.find((p) => p.memberId === host.member.id)?.online).toBe(true);
  });

  test("only members can send a heartbeat", async () => {
    const { beat } = await room();
    await expect(beat({ sessionToken: "nope" }, "tab-x")).rejects.toThrow("Not a member");
  });

  test("leaving removes the member from presence", async () => {
    const { t, host, sam, beat } = await room();
    const { roomToken } = await beat(host, "tab-a");
    await beat(sam, "tab-s");
    await t.mutation(api.rooms.leave, { sessionToken: sam.sessionToken });
    const people = await t.query(api.presence.list, { roomToken });
    expect(people.map((p) => p.memberId)).toEqual([host.member.id]);
  });

  test("burning the room clears its presence", async () => {
    const { t, host, sam, beat } = await room();
    const { roomToken } = await beat(host, "tab-a");
    await beat(sam, "tab-s");
    await t.mutation(api.rooms.burn, { sessionToken: host.sessionToken });
    expect(await t.query(api.presence.list, { roomToken })).toEqual([]);
  });
});

describe("rate limits", () => {
  test("a burst of new rooms is cut off with a clear error", async () => {
    const t = withComponents(convexTest(schema, modules));
    for (let i = 0; i < 20; i++) await t.mutation(api.rooms.create, { name: `Host ${i}` });
    await expect(t.mutation(api.rooms.create, { name: "One more" })).rejects.toThrow("Too many requests");
  });

  test("a flood of lines in one room is cut off; other rooms are not affected", async () => {
    const { t, host } = await room();
    for (let i = 0; i < 30; i++) {
      await t.mutation(api.lines.add, { sessionToken: host.sessionToken, text: `line ${i}`, at: i });
    }
    await expect(
      t.mutation(api.lines.add, { sessionToken: host.sessionToken, text: "too many", at: 99 }),
    ).rejects.toThrow("Too many requests");

    const other = await t.mutation(api.rooms.create, { name: "Jo" });
    expect(await t.mutation(api.lines.add, { sessionToken: other.sessionToken, text: "hi", at: 1 })).not.toBeNull();
  });

  test("the line limit refills over time", async () => {
    const { t, host } = await room();
    for (let i = 0; i < 30; i++) {
      await t.mutation(api.lines.add, { sessionToken: host.sessionToken, text: `line ${i}`, at: i });
    }
    vi.advanceTimersByTime(5_000); // 60 a minute: 5 more after 5 s
    expect(await t.mutation(api.lines.add, { sessionToken: host.sessionToken, text: "later", at: 100 })).not.toBeNull();
  });
});
