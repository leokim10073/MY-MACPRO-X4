// Replays a fixture through the three AI functions and compares with <name>.expected.json.
//
//   npm run eval                 # kevin, recalls use the live StoryState rebuilt every ~25 s of replay time
//   npm run eval -- kevin --isolate   # recalls use the expected StoryState, to test the fast path alone
//
// Needs ANTHROPIC_API_KEY (put it in ai/.env). Exits 1 if any hard check fails.

import { mkdirSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { RECALL_MIN_CONFIDENCE, RECAP_MAX_WORDS, type Recall, type Story, type StoryState } from "../shared/schema";
import { buildStoryState } from "./src/buildStoryState";
import { detectRecalls } from "./src/detectRecalls";
import { loadFixture } from "./src/fixtures";
import { countWords, storyStateViolations } from "./src/validate";
import { writeRecap } from "./src/writeRecap";

const STATE_INTERVAL_MS = 25_000;
const FAST_PATH_BUDGET_MS = 2_000;

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--")) ?? "kevin";
const isolate = args.includes("--isolate");
const { expected, lines, script } = loadFixture(name);
const members = expected.members;
const joinSeq = script.lateJoiner?.afterLine ?? expected.recap.uptoSeq;

let failures = 0;
let warnings = 0;
const pass = (msg: string) => console.log(`  \x1b[32mPASS\x1b[0m ${msg}`);
const fail = (msg: string) => (failures++, console.log(`  \x1b[31mFAIL\x1b[0m ${msg}`));
const warn = (msg: string) => (warnings++, console.log(`  \x1b[33mWARN\x1b[0m ${msg}`));
const check = (ok: boolean, msg: string, soft = false) => (ok ? pass(msg) : soft ? warn(msg) : fail(msg));

/** Expected state as it would have looked just before `seq`: only stories that were already over. */
function expectedStateBefore(seq: number): StoryState {
  const s = expected.storyState;
  const stories = s.stories.filter((st) => st.lastSeq < seq);
  const ids = new Set(stories.map((st) => st.id));
  return {
    ...s,
    uptoSeq: seq - 1,
    stories,
    people: s.people.map((p) => ({ ...p, storyIds: p.storyIds.filter((id) => ids.has(id)) })),
  };
}

async function main() {
  console.log(`Eval: ${name} (${lines.length} lines, ${isolate ? "isolated recalls" : "live state"})\n`);

  // 1. Replay line by line.
  let state: StoryState | null = null;
  let lastBuildAt = 0;
  let recapState: StoryState | null = null;
  const recalls: Recall[] = [];
  const recallLatency: number[] = [];
  const builds: StoryState[] = [];

  for (const line of lines) {
    const seen = lines.filter((l) => l.seq <= line.seq);
    const recallState = isolate ? expectedStateBefore(line.seq) : state;
    const t0 = Date.now();
    const found = await detectRecalls({ line, state: recallState, recentLines: seen });
    if (recallState?.people.length) recallLatency.push(Date.now() - t0);
    recalls.push(...found);
    for (const r of found) console.log(`  recall ${r.lineId} "${r.matchedText}" -> ${r.personId} focus=${r.focusStoryId ?? "-"} (${r.confidence})`);

    if (line.seq === joinSeq) {
      // Backend would rebuild before the recap so it covers everything up to the join.
      state = await buildStoryState({ roomId: expected.roomId, lines: seen, members, previous: state });
      recapState = state;
      builds.push(state);
      lastBuildAt = line.at;
      console.log(`  state @${line.seq}: ${state.stories.map((s) => `${s.id}(${s.keyword})`).join(", ")}`);
    } else if (line.at - lastBuildAt >= STATE_INTERVAL_MS) {
      state = await buildStoryState({ roomId: expected.roomId, lines: seen, members, previous: state });
      builds.push(state);
      lastBuildAt = line.at;
      console.log(`  state @${line.seq}: ${state.stories.map((s) => `${s.id}(${s.keyword})`).join(", ")}`);
    }
  }
  const finalState = await buildStoryState({ roomId: expected.roomId, lines, members, previous: state });
  builds.push(finalState);
  const recap = await writeRecap({
    roomId: expected.roomId,
    lines,
    state: recapState,
    uptoSeq: joinSeq,
    joinerName: script.lateJoiner?.name,
  });

  // 2. Compare.
  console.log("\nInvariants");
  builds.forEach((b) => {
    const v = storyStateViolations(b, lines.filter((l) => l.seq <= b.uptoSeq));
    check(v.length === 0, `state @${b.uptoSeq} follows the rules${v.length ? `: ${v.join("; ")}` : ""}`);
  });
  for (let i = 1; i < builds.length; i++) {
    const kept = builds[i - 1].stories.every((s) => builds[i].stories.some((n) => n.id === s.id));
    check(kept, `state @${builds[i].uptoSeq} keeps every story id from @${builds[i - 1].uptoSeq}`);
  }

  console.log("\nStories");
  const storyMap = new Map<string, Story>(); // expected id -> actual
  for (const exp of expected.storyState.stories) {
    const act = matchStory(exp, finalState.stories);
    if (!act) {
      fail(`${exp.id} (${exp.keyword}) not found`);
      continue;
    }
    storyMap.set(exp.id, act);
    check(act.keyword.toLowerCase() === exp.keyword.toLowerCase(), `${exp.id} keyword "${act.keyword}" (expected "${exp.keyword}")`, true);
    check(act.firstSeq === exp.firstSeq && act.lastSeq === exp.lastSeq, `${exp.id} seq ${act.firstSeq}-${act.lastSeq} (expected ${exp.firstSeq}-${exp.lastSeq})`);
    check(act.tellerId === exp.tellerId, `${exp.id} teller ${act.tellerId}`);
    for (const r of exp.reactions) {
      check(act.reactions.some((a) => a.lineId === r.lineId && a.memberId === r.memberId), `${exp.id} reaction ${r.memberName} @${r.lineId}`);
    }
    const extra = act.reactions.filter((a) => !exp.reactions.some((r) => r.lineId === a.lineId));
    if (extra.length) warn(`${exp.id} extra reactions: ${extra.map((r) => `${r.memberName} @${r.lineId}`).join(", ")}`);
    const teller = members.find((m) => m.id === exp.tellerId)?.name ?? "";
    check(new RegExp(`\\b${teller}\\b.*\\b(says|said|claims|told)\\b`, "i").test(act.summary), `${exp.id} summary framed as ${teller}'s account`, true);
  }
  const extraStories = finalState.stories.filter((s) => ![...storyMap.values()].includes(s));
  if (extraStories.length) warn(`extra stories: ${extraStories.map((s) => `${s.id}(${s.keyword})`).join(", ")}`);

  console.log("\nPeople");
  const personMap = new Map<string, string>(); // expected id -> actual id
  for (const exp of expected.storyState.people) {
    const expStories = exp.storyIds.map((id) => storyMap.get(id)?.id);
    const act = finalState.people.find((p) => expStories.some((id) => id && p.storyIds.includes(id)));
    if (!act) {
      fail(`${exp.id} (${exp.name}) not found`);
      continue;
    }
    personMap.set(exp.id, act.id);
    check(act.name.toLowerCase().includes(exp.name.toLowerCase()), `${exp.id} name "${act.name}"`);
    check(expStories.every((id) => id && act.storyIds.includes(id)), `${exp.id} has all ${exp.storyIds.length} stories`);
  }
  const sameName = finalState.people.filter((p) => /work/i.test([p.name, ...p.aliases].join(" ")));
  const roommate = finalState.people.find((p) => p.id === personMap.get("p_kevin"));
  if (roommate) check(!/work/i.test(roommate.aliases.join(" ")), `"Kevin from work" not merged into ${roommate.id} (aliases: ${roommate.aliases.join(", ")})`);
  if (sameName.length) warn(`listed people from work: ${sameName.map((p) => p.id).join(", ")}`);

  console.log("\nRecalls");
  for (const exp of expected.recalls) {
    const act = recalls.find((r) => r.lineId === exp.lineId && r.personId === personMap.get(exp.personId));
    if (!act) {
      fail(`${exp.id} @${exp.lineId} "${exp.matchedText}" not detected`);
      continue;
    }
    check(act.confidence >= RECALL_MIN_CONFIDENCE, `${exp.id} confidence ${act.confidence} >= ${RECALL_MIN_CONFIDENCE}`);
    const wantFocus = exp.focusStoryId ? storyMap.get(exp.focusStoryId)?.id : undefined;
    check(act.focusStoryId === wantFocus, `${exp.id} focus ${act.focusStoryId ?? "none"} (expected ${wantFocus ?? "none"})`);
    const wantStories = exp.storyIds.map((id) => storyMap.get(id)?.id);
    check(JSON.stringify(act.storyIds) === JSON.stringify(wantStories), `${exp.id} storyIds ${act.storyIds.join(",")}`);
    const overlap = exp.matchedText.toLowerCase().split(/\s+/).some((w) => act.matchedText.toLowerCase().includes(w));
    check(overlap, `${exp.id} matchedText "${act.matchedText}" (expected "${exp.matchedText}")`, true);
  }
  const extraRecalls = recalls.filter((r) => r.confidence >= RECALL_MIN_CONFIDENCE && !expected.recalls.some((e) => e.lineId === r.lineId));
  if (extraRecalls.length) warn(`extra shown recalls: ${extraRecalls.map((r) => `${r.lineId} "${r.matchedText}"`).join(", ")}`);
  if (recallLatency.length) {
    const sorted = [...recallLatency].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length / 2)];
    const max = sorted[sorted.length - 1];
    check(p50 < FAST_PATH_BUDGET_MS, `fast path p50 ${p50} ms, max ${max} ms (budget ${FAST_PATH_BUDGET_MS} ms)`, true);
  }

  console.log("\nRecap");
  console.log(`  "${recap.text}"`);
  const words = countWords(recap.text);
  check(words <= RECAP_MAX_WORDS, `${words} words <= ${RECAP_MAX_WORDS}`);
  check(recap.uptoSeq === joinSeq, `uptoSeq ${recap.uptoSeq}`);
  const after = lines.filter((l) => l.seq > joinSeq).map((l) => l.text).join(" ");
  const leaked = ["reunion", "texted", "restaurant"].filter((w) => after.toLowerCase().includes(w) && recap.text.toLowerCase().includes(w));
  check(leaked.length === 0, `nothing from after line ${joinSeq}${leaked.length ? ` (mentions ${leaked.join(", ")})` : ""}`);
  for (const p of expected.storyState.people) check(recap.text.includes(p.name), `mentions ${p.name}`);
  for (const s of expected.storyState.stories.filter((st) => st.firstSeq <= joinSeq)) {
    check(recap.text.toLowerCase().includes(s.keyword.toLowerCase()), `mentions ${s.keyword}`, true);
  }

  mkdirSync(new URL("./eval-out/", import.meta.url), { recursive: true });
  const out = new URL(`./eval-out/${name}.actual.json`, import.meta.url);
  writeFileSync(out, JSON.stringify({ storyState: finalState, recalls, recap, builds }, null, 2));

  console.log(`\n${failures === 0 ? "\x1b[32mOK\x1b[0m" : "\x1b[31mFAILED\x1b[0m"}: ${failures} failed, ${warnings} warnings. Output: ai/eval-out/${name}.actual.json`);
  process.exit(failures === 0 ? 0 : 1);
}

/** Same keyword, else the story sharing the most lines (Jaccard >= 0.3). */
function matchStory(exp: Story, actual: Story[]): Story | undefined {
  const byKeyword = actual.find((a) => a.keyword.toLowerCase() === exp.keyword.toLowerCase());
  if (byKeyword) return byKeyword;
  const lineSet = (s: Story) => new Set([...s.sourceLineIds, ...s.reactions.map((r) => r.lineId)]);
  const e = lineSet(exp);
  let best: Story | undefined;
  let bestScore = 0.3;
  for (const a of actual) {
    const set = lineSet(a);
    const inter = [...e].filter((id) => set.has(id)).length;
    const score = inter / new Set([...e, ...set]).size;
    if (score >= bestScore) [best, bestScore] = [a, score];
  }
  return best;
}

main().catch((err) => {
  if (err instanceof Anthropic.AuthenticationError) console.error("Invalid or missing ANTHROPIC_API_KEY (set it in ai/.env).");
  else console.error(err);
  process.exit(1);
});
