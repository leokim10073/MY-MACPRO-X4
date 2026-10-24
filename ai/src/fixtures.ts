// Loads shared/fixtures into the shapes the AI functions take. Used by eval.ts and the tests.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { DemoFixture, ReplayScript, TranscriptLine } from "../../shared/schema";

const FIXTURES_DIR = fileURLToPath(new URL("../../shared/fixtures/", import.meta.url));

export interface LoadedFixture {
  script: ReplayScript;
  expected: DemoFixture;
  /** Line N has id "lN" and seq N; `at` is the running total of delayMs. */
  lines: TranscriptLine[];
}

export function loadFixture(name: string): LoadedFixture {
  const script = JSON.parse(readFileSync(`${FIXTURES_DIR}${name}.replay.json`, "utf8")) as ReplayScript;
  const expected = JSON.parse(readFileSync(`${FIXTURES_DIR}${name}.expected.json`, "utf8")) as DemoFixture;
  const memberByName = new Map(expected.members.map((m) => [m.name, m]));
  let at = 0;
  const lines = script.lines.map((l, i): TranscriptLine => {
    at += l.delayMs;
    const member = memberByName.get(l.speakerName);
    if (!member) throw new Error(`${name}: speaker ${l.speakerName} is not in expected.members`);
    return {
      id: `l${i + 1}`,
      roomId: expected.roomId,
      speakerId: member.id,
      speakerName: l.speakerName,
      text: l.text,
      seq: i + 1,
      at,
    };
  });
  return { script, expected, lines };
}
