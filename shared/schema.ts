// Shared data contract for Gossip Window.
// Every folder (voice, backend, ai, web) uses these shapes.
// Change this file only after telling the whole team.

export type Id = string;

/** Order number the backend gives each transcript line. Strictly increasing within a room, starting at 1. */
export type Seq = number;

/** Milliseconds since the Unix epoch. */
export type Timestamp = number;

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/** Recalls below this confidence are never shown. */
export const RECALL_MIN_CONFIDENCE = 0.7;

/** A recall pop-up fades away after this long if nobody taps it. */
export const RECALL_CHIP_TIMEOUT_MS = 6000;

/** After a pop-up for a person, don't show another for the same person until this has passed. */
export const RECALL_COOLDOWN_MS = 15000;

/** Target length of the spoken catch-up. */
export const RECAP_MAX_SECONDS = 20;

/** Roughly 2.5 spoken words per second keeps the recap under RECAP_MAX_SECONDS. */
export const RECAP_MAX_WORDS = 50;

// ---------------------------------------------------------------------------
// Room and people in the room (owned by backend)
// ---------------------------------------------------------------------------

export type RoomStatus = "active" | "burned";

export interface Room {
  id: Id;
  hostMemberId: Id;
  status: RoomStatus;
  /** Unguessable token in the invite link and QR code. */
  inviteToken: string;
  createdAt: Timestamp;
  /** Abandoned rooms are burned automatically after this time. */
  expiresAt: Timestamp;
}

/** Someone in the room (a friend on the call), not someone being talked about. */
export interface Member {
  id: Id;
  roomId: Id;
  /** Nickname typed on the join screen. */
  name: string;
  /** Highest seq that existed when this member joined. 0 if they were there from the start. */
  joinedAtSeq: Seq;
  joinedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Transcript (voice produces it, backend stores and orders it)
// ---------------------------------------------------------------------------

/** One finished sentence or phrase from one speaker. Voice sends it without id/seq; backend assigns both. */
export interface TranscriptLine {
  id: Id;
  roomId: Id;
  speakerId: Id; // Member.id
  speakerName: string;
  text: string;
  seq: Seq;
  at: Timestamp;
}

/** What voice (or the replay script) submits to the backend. */
export type NewTranscriptLine = Pick<TranscriptLine, "roomId" | "speakerId" | "text" | "at">;

// ---------------------------------------------------------------------------
// Story state (AI slow path, roughly every 20-30 seconds)
// ---------------------------------------------------------------------------

/** Someone being talked about. May or may not also be a Member. */
export interface Person {
  id: Id;
  roomId: Id;
  /** Display name, e.g. "Kevin". */
  name: string;
  /** Other stable ways people refer to them, e.g. "Roommate Kevin", "Alex's old roommate". Not pronouns. */
  aliases: string[];
  /** Set when the person being discussed is also in the room. */
  memberId?: Id;
  storyIds: Id[];
}

/** A friend's actual words in response to a story. Never invented. */
export interface Reaction {
  memberId: Id;
  memberName: string;
  quote: string;
  lineId: Id;
}

/** A guess or interpretation, always shown labeled as a guess. */
export interface Speculation {
  memberId: Id;
  memberName: string;
  text: string;
  lineId: Id;
}

export interface Story {
  id: Id;
  roomId: Id;
  /** People the story is about. The first one is the main subject. */
  personIds: Id[];
  /** Exactly one word shown on the recall pop-up, e.g. "Cake". */
  keyword: string;
  /** 1-3 sentences, framed as the teller's account ("Alex says..."), not as verified fact. */
  summary: string;
  tellerId: Id; // Member.id
  reactions: Reaction[];
  speculation: Speculation[];
  /** What's still unresolved about this story, if anything. */
  openQuestion?: string;
  /** Lines the summary is based on. Every story must have at least one. */
  sourceLineIds: Id[];
  /** seq of the first line of this story. Used to decide who missed it. */
  firstSeq: Seq;
  lastSeq: Seq;
}

/** Something the group is still debating right now. */
export interface OpenQuestion {
  text: string;
  lineIds: Id[];
}

/**
 * Full snapshot from the AI slow path. Backend saves it only if uptoSeq is
 * higher than the saved snapshot's, so a slow AI reply can't overwrite a newer one.
 */
export interface StoryState {
  roomId: Id;
  /** Highest transcript seq this snapshot covers. */
  uptoSeq: Seq;
  people: Person[];
  stories: Story[];
  /** One short line on what everyone is talking about now. */
  currentTopic: string;
  openQuestions: OpenQuestion[];
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Recall (AI fast path, per transcript line, target under 2 seconds)
// ---------------------------------------------------------------------------

/** "This line mentioned someone who has already come up." Drives the pop-up. */
export interface Recall {
  id: Id;
  roomId: Id;
  lineId: Id;
  seq: Seq;
  personId: Id;
  /** All stories about this person, in the order they were told. One keyword chip each. */
  storyIds: Id[];
  /** Set when the line points at one specific story ("after the cake thing"); that chip is highlighted. */
  focusStoryId?: Id;
  /** The words in the line that triggered the recall, e.g. "he", "the cake thing". */
  matchedText: string;
  /** 0-1. Not shown below RECALL_MIN_CONFIDENCE. */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Recap (AI writes the text, Cartesia Sonic turns it into audio)
// ---------------------------------------------------------------------------

export interface Recap {
  id: Id;
  roomId: Id;
  /** Highest transcript seq the recap covers. */
  uptoSeq: Seq;
  /** At most RECAP_MAX_WORDS words. */
  text: string;
  /** Missing until the audio is ready; the web app shows the text meanwhile. */
  audioUrl?: string;
  createdAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Realtime events (backend pushes these to every phone in the room)
// ---------------------------------------------------------------------------

export type RoomEvent =
  | { type: "member_joined"; member: Member }
  /** Someone tapped Leave. They drop out of the people count; their lines stay. */
  | { type: "member_left"; memberId: Id }
  | { type: "line_added"; line: TranscriptLine }
  | { type: "story_state_updated"; storyState: StoryState }
  | { type: "recall"; recall: Recall }
  | { type: "recap_ready"; recap: Recap }
  | { type: "room_burned"; roomId: Id };

// ---------------------------------------------------------------------------
// "Only what you missed" rules (shared so web and backend agree)
// ---------------------------------------------------------------------------

/** A member missed a story if it started before they joined. */
export function missedStory(member: Member, story: Story): boolean {
  return story.firstSeq <= member.joinedAtSeq;
}

/** Whether this member should see a pop-up for this recall at all. */
export function shouldShowRecall(member: Member, recall: Recall, stories: Story[]): boolean {
  if (recall.confidence < RECALL_MIN_CONFIDENCE) return false;
  return stories.some((s) => recall.storyIds.includes(s.id) && missedStory(member, s));
}

// ---------------------------------------------------------------------------
// Fixtures (replay mode and mock data, see shared/fixtures/)
// ---------------------------------------------------------------------------

/** A scripted conversation that the replay script plays into a room line by line. */
export interface ReplayScript {
  title: string;
  speakers: string[];
  lines: ReplayLine[];
  /** Someone who joins partway through, after line number afterLine (1-based). */
  lateJoiner?: { name: string; afterLine: number };
}

export interface ReplayLine {
  /** Wait this long after the previous line before sending this one. */
  delayMs: number;
  speakerName: string;
  text: string;
}

/**
 * What the AI should produce for a ReplayScript, written by hand.
 * Web uses it as mock data; AI checks its output against it.
 * Line N of the script has id "lN" and seq N.
 */
export interface DemoFixture {
  roomId: Id;
  members: Member[];
  storyState: StoryState;
  recalls: Recall[];
  /** The recap the late joiner hears when they arrive. */
  recap: Recap;
}
