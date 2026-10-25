/// <reference types="vite/client" />

// Wiring between the backend and voice/, with the Cartesia calls replaced by fakes.

import { convexTest } from "convex-test";
import { withComponents } from "../testComponents";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const cartesia = vi.hoisted(() => ({
  mintSttToken: vi.fn(),
  synthesizeRecap: vi.fn(),
}));
vi.mock("../../voice/src/server/cartesia", () => cartesia);

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("CARTESIA_API_KEY", "test-key");
  cartesia.mintSttToken.mockReset().mockResolvedValue({ token: "stt-token", expiresAt: 123 });
  cartesia.synthesizeRecap
    .mockReset()
    .mockResolvedValue({ mp3: new Uint8Array([1, 2, 3]), words: 10, overLimit: false });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function setup() {
  return withComponents(convexTest(schema, modules));
}
type T = ReturnType<typeof setup>;

async function newRoom(t: T) {
  const r = await t.mutation(api.rooms.create, { name: "Alex" });
  return { token: r.sessionToken, roomId: r.room.id as Id<"rooms">, invite: r.room.inviteToken };
}
const storedFiles = (t: T) => t.run((ctx) => ctx.db.system.query("_storage").collect());

/**
 * Host says one line, then Taylor joins late and gets a recap. The recap action is called
 * directly: convex-test can't store files from scheduled actions (real Convex can).
 */
async function lateJoin(t: T) {
  const host = await newRoom(t);
  await t.mutation(api.lines.add, { sessionToken: host.token, text: "Kevin ate my cake", at: 1 });
  const taylor = await t.mutation(api.rooms.join, { inviteToken: host.invite, name: "Taylor" });
  await t.action(internal.ai.writeRecap, { memberId: taylor.member.id as Id<"members"> });
  return { host, taylor };
}

describe("speech-to-text tokens", () => {
  test("members get a token minted with the deployment's key", async () => {
    const t = setup();
    const host = await newRoom(t);
    expect(await t.action(api.voice.sttToken, { sessionToken: host.token })).toEqual({
      token: "stt-token",
      expiresAt: 123,
    });
    expect(cartesia.mintSttToken).toHaveBeenCalledWith("test-key");
  });

  test("outsiders and burned rooms get nothing, and Cartesia isn't called", async () => {
    const t = setup();
    const host = await newRoom(t);
    await expect(t.action(api.voice.sttToken, { sessionToken: "nope" })).rejects.toThrow("Not a member");
    await t.mutation(api.rooms.burn, { roomId: host.roomId, sessionToken: host.token });
    await expect(t.action(api.voice.sttToken, { sessionToken: host.token })).rejects.toThrow();
    expect(cartesia.mintSttToken).not.toHaveBeenCalled();
  });

  test("without a key, push-to-talk is refused clearly", async () => {
    vi.stubEnv("CARTESIA_API_KEY", "");
    const t = setup();
    const host = await newRoom(t);
    await expect(t.action(api.voice.sttToken, { sessionToken: host.token })).rejects.toThrow("Voice isn't set up");
  });
});

describe("narrated recap", () => {
  test("the recap text goes out first, then again with audioUrl once the MP3 is stored", async () => {
    const t = setup();
    const { taylor } = await lateJoin(t);

    expect(cartesia.synthesizeRecap).toHaveBeenCalledWith("test-key", expect.stringContaining("You joined after 1 lines"));
    const recap = await t.query(api.story.myRecap, { sessionToken: taylor.sessionToken });
    expect(recap?.audioUrl).toBeTruthy();
    expect(await storedFiles(t)).toHaveLength(1);

    const log = await t.query(api.events.listAfter, {
      roomId: taylor.room.id as Id<"rooms">,
      sessionToken: taylor.sessionToken,
      afterEventSeq: 0,
    });
    const recaps = log.events.filter((e) => e.event.type === "recap_ready").map((e) => e.event);
    expect(recaps).toHaveLength(2);
    expect(recaps[0]).toMatchObject({ recap: { id: recap!.id } });
    expect(recaps[0].type === "recap_ready" && recaps[0].recap.audioUrl).toBeFalsy();
    expect(recaps[1]).toMatchObject({ recap: { id: recap!.id, audioUrl: recap!.audioUrl } });
  });

  test("burn deletes the stored MP3", async () => {
    const t = setup();
    const { host } = await lateJoin(t);
    expect(await storedFiles(t)).toHaveLength(1);

    await t.mutation(api.rooms.burn, { roomId: host.roomId, sessionToken: host.token });
    expect(await storedFiles(t)).toHaveLength(0);
  });

  test("audio that finishes after a burn is thrown away", async () => {
    const t = setup();
    const { host, taylor } = await lateJoin(t);
    const recap = (await t.query(api.story.myRecap, { sessionToken: taylor.sessionToken }))!;
    await t.mutation(api.rooms.burn, { roomId: host.roomId, sessionToken: host.token });

    const storageId = await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([9])])));
    await t.mutation(internal.voice.saveRecapAudio, { recapId: recap.id as Id<"recaps">, storageId });
    expect(await storedFiles(t)).toHaveLength(0);
  });

  test("if Cartesia fails, the text-only recap stays", async () => {
    const t = setup();
    cartesia.synthesizeRecap.mockRejectedValue(new Error("Cartesia down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { taylor } = await lateJoin(t);

    const recap = await t.query(api.story.myRecap, { sessionToken: taylor.sessionToken });
    expect(recap?.text).toContain("You joined");
    expect(recap?.audioUrl).toBeUndefined();
  });

  test("without a key there is no audio and Cartesia isn't called", async () => {
    vi.stubEnv("CARTESIA_API_KEY", "");
    const t = setup();
    const { taylor } = await lateJoin(t);
    expect(cartesia.synthesizeRecap).not.toHaveBeenCalled();
    expect((await t.query(api.story.myRecap, { sessionToken: taylor.sessionToken }))?.audioUrl).toBeUndefined();
  });
});
