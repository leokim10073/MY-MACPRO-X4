// Checks the validation and assembly code with hand-written model output. No API calls.

import assert from "node:assert/strict";
import { test } from "node:test";
import { assembleStoryState, type StoryStateDraft } from "./buildStoryState";
import { assembleRecalls, scoreRecall, type RecallDraft } from "./detectRecalls";
import { loadFixture } from "./fixtures";
import { assembleRecap, recapProblems } from "./writeRecap";
import { countWords, isOneWord, quoteInLine, slugId, storyStateViolations, toOneWord, truncateToWords } from "./validate";

const kevin = loadFixture("kevin");
const upTo = (n: number) => kevin.lines.filter((l) => l.seq <= n);

const goodDraft: StoryStateDraft = {
  people: [{ key: "kevin", name: "Kevin", aliases: ["Roommate Kevin", "Kevin"], memberId: "" }],
  stories: [
    {
      id: "",
      personKeys: ["kevin"],
      keyword: "Cake",
      summary: "Alex says Kevin ate their whole birthday cake.",
      sourceLineIds: ["l3", "l4", "l7"],
      reactions: [
        { lineId: "l5", quote: "NO WAY he ate the entire cake." },
        { lineId: "l6", quote: "Honestly that’s kind of impressive" },
      ],
      speculation: [],
      openQuestion: "",
    },
  ],
  currentTopic: "Kevin's cake",
  openQuestions: [],
};
const ctx = { roomId: "demo", lines: upTo(8), members: kevin.expected.members, previous: null, now: 0 };

test("validate helpers", () => {
  assert.ok(quoteInLine("he ate the entire cake", "NO WAY he ate the entire cake."));
  assert.ok(!quoteInLine("he ate the cake", "NO WAY he ate the entire cake."));
  assert.ok(!quoteInLine("  ", "anything"));
  assert.ok(isOneWord("Cake") && isOneWord("Kevin's") && !isOneWord("Wrong airport") && !isOneWord(""));
  assert.equal(toOneWord("wrong airport!"), "Wrong");
  assert.equal(slugId("s", "Cake", new Set(["s_cake"])), "s_cake_2");
  assert.equal(countWords(" a  b\nc "), 3);
  assert.equal(truncateToWords("One two. Three four five.", 4), "One two.");
});

test("assembleStoryState fills ids, members and seq range", () => {
  const { state, problems } = assembleStoryState(goodDraft, ctx);
  assert.deepEqual(problems, []);
  const [cake] = state.stories;
  assert.equal(cake.id, "s_cake");
  assert.equal(cake.tellerId, "m_alex");
  assert.equal(cake.firstSeq, 3);
  assert.equal(cake.lastSeq, 7);
  assert.deepEqual(cake.reactions.map((r) => r.memberId), ["m_sam", "m_jamie"]);
  assert.equal(state.people[0].id, "p_kevin");
  assert.deepEqual(state.people[0].aliases, ["Roommate Kevin"]);
  assert.deepEqual(state.people[0].storyIds, ["s_cake"]);
  assert.equal(state.uptoSeq, 8);
  assert.deepEqual(storyStateViolations(state, ctx.lines), []);
});

test("assembleStoryState rejects invented quotes, multi-word keywords and bad sources", () => {
  const draft: StoryStateDraft = {
    ...goodDraft,
    people: [...goodDraft.people, { key: "work", name: "Kevin", aliases: ["Kevin from work"], memberId: "" }],
    stories: [
      {
        ...goodDraft.stories[0],
        keyword: "Birthday cake",
        reactions: [{ lineId: "l5", quote: "That's hilarious" }],
      },
      { ...goodDraft.stories[0], keyword: "Ghost", sourceLineIds: ["l99"], reactions: [] },
    ],
  };
  const { state, problems } = assembleStoryState(draft, ctx);
  // keyword, invented quote, unknown line l99, and the Ghost story left with no source
  assert.equal(problems.length, 4);
  assert.equal(state.stories.length, 1);
  assert.equal(state.stories[0].keyword, "Birthday");
  assert.deepEqual(state.stories[0].reactions, []);
  assert.equal(state.stories[0].firstSeq, 3);
  // Kevin from work has no story, so he is not listed.
  assert.deepEqual(state.people.map((p) => p.id), ["p_kevin"]);
});

test("assembleStoryState keeps previous ids and never drops old stories", () => {
  const first = assembleStoryState(goodDraft, ctx).state;
  const next: StoryStateDraft = {
    ...goodDraft,
    people: [{ key: "p_kevin", name: "Kevin", aliases: [], memberId: "" }],
    stories: [
      {
        id: "",
        personKeys: ["p_kevin"],
        keyword: "Airport",
        summary: "Alex says Kevin went to the wrong airport.",
        sourceLineIds: ["l8", "l9", "l12"],
        reactions: [{ lineId: "l10", quote: "How do you even do that?" }],
        speculation: [],
        openQuestion: "",
      },
    ],
  };
  const { state } = assembleStoryState(next, { ...ctx, lines: upTo(12), previous: first });
  assert.deepEqual(state.stories.map((s) => s.id), ["s_cake", "s_airport"]);
  assert.deepEqual(state.people[0].storyIds, ["s_cake", "s_airport"]);
  assert.equal(state.stories[1].firstSeq, 8);
  assert.equal(state.stories[1].lastSeq, 12);
});

test("assembleRecalls fills storyIds and drops unverifiable recalls", () => {
  const state = kevin.expected.storyState;
  const line = kevin.lines[18]; // l19 "After the cake thing? ..."
  const recalls = assembleRecalls(
    [
      draft({ matchedText: "the cake thing", focusStoryId: "s_cake", reference: "story_reference" }),
      draft({ matchedText: "He's lucky", reference: "pronoun", onlyOneFits: false }),
      draft({ personId: "p_nobody", matchedText: "cake" }),
      draft({ matchedText: "the birthday disaster", reference: "story_reference" }),
    ],
    line,
    state,
  );
  // Both remaining drafts point at Kevin; only the strongest per person is kept.
  assert.deepEqual(
    recalls.map((r) => [r.matchedText, r.confidence]),
    [["the cake thing", 0.9]],
  );
  assert.equal(recalls[0].focusStoryId, "s_cake");
  assert.deepEqual(recalls[0].storyIds, ["s_cake", "s_airport", "s_landlord"]);
  assert.equal(recalls[0].seq, 19);
});

function draft(over: Partial<RecallDraft> = {}): RecallDraft {
  return {
    personId: "p_kevin",
    matchedText: "Kevin",
    focusStoryId: "",
    reference: "name",
    onlyOneFits: true,
    continuesCurrentStory: false,
    ...over,
  };
}

test("scoreRecall: confidence comes from fixed rules, not from the model", () => {
  const kevinPerson = kevin.expected.storyState.people.find((p) => p.id === "p_kevin")!;
  assert.equal(scoreRecall(draft({ reference: "name" }), kevinPerson), 0.95);
  assert.equal(scoreRecall(draft({ reference: "alias" }), kevinPerson), 0.95);
  assert.equal(scoreRecall(draft({ reference: "story_reference" }), kevinPerson), 0.9);
  assert.equal(scoreRecall(draft({ reference: "pronoun" }), kevinPerson), 0.8);
  // Could mean more than one known person: kept below the 0.7 pop-up threshold.
  assert.equal(scoreRecall(draft({ reference: "name", onlyOneFits: false }), kevinPerson), 0.5);
  // Not a recall at all.
  assert.equal(scoreRecall(draft({ continuesCurrentStory: true }), kevinPerson), null);
  assert.equal(scoreRecall(draft(), { ...kevinPerson, memberId: "m_kevin" }), null);
});

test("assembleRecalls drops lines about people in the room and lines continuing the current story", () => {
  const state = kevin.expected.storyState;
  const line = kevin.lines[18];
  const inRoom = { ...state, people: state.people.map((p) => ({ ...p, memberId: "m_kevin" })) };
  assert.deepEqual(assembleRecalls([draft({ matchedText: "the cake thing" })], line, inRoom), []);
  assert.deepEqual(
    assembleRecalls([draft({ matchedText: "the cake thing", continuesCurrentStory: true })], line, state),
    [],
  );
});

test("recap word limit", () => {
  const long = Array.from({ length: 60 }, (_, i) => `w${i}`).join(" ");
  assert.equal(recapProblems(long).length, 1);
  assert.equal(recapProblems(kevin.expected.recap.text).length, 0);
  assert.ok(countWords(assembleRecap(long, "demo", 16, 0).text) <= 50);
});

test("expected fixture itself passes the invariants", () => {
  assert.deepEqual(storyStateViolations(kevin.expected.storyState, kevin.lines), []);
});
