# Anthropic

Prize: "Coming soon!" in the Hacker Guide.

## What the track asks for

Four criteria, in the Hacker Guide's words:

1. **A named community.** "Students" is too broad. "Transfer students at Berkeley trying to find housing" is the right level.
2. **A real problem.** You lived it, or you talked to someone who has.
3. **It works.** One thing done well and usable on Monday beats a broad demo.
4. **Thoughtful use of Claude.** Claude does something that matters to the solution, and you know where it could go wrong for the people using it.

No extra deliverables, but the Devpost text has to answer all four directly.

## 1. Named community

"Small groups of friends" is too broad. Pick one and use it everywhere:

> **[TODO: pick one] e.g. International students at Berkeley who call their friend group back home every weekend, where time zones mean someone always joins late.**

Other candidates if that doesn't fit the team: college friends who scattered after graduation and keep a weekly Discord call; roommates in a group call where people drift in after class.

## 2. Real problem

> **[TODO: who on the team has lived this, or who we talked to this weekend, and one thing they said.]** Talk to at least one or two people in the community before submitting and quote them.

The problem: on a voice call, a latecomer has no scrollback. They interrupt ("wait, who's Kevin?") and the story dies, or they stay quiet and miss every callback that follows.

## 3. It works: the one thing

One flow, done well: **a late friend catches up and joins in without anyone stopping the story.**

1. Taylor joins 15 minutes late and hears a 20-second recap.
2. Sam says "after the cake thing". Taylor's phone shows `Kevin · Cake · Airport · Landlord`.
3. Taylor taps **Cake** and jumps in.

Runs on real phones. Replay mode is a backup.

## 4. What Claude does

Claude is the part that understands the conversation. Without it there are no stories, no callbacks and no recap.

| Job | Model | When | What Claude does |
| --- | --- | --- | --- |
| **Recalls** (fast path) | Claude Haiku (`claude-haiku-5-5`) | Every new line, target under 2 s | Decides whether the line refers back to a known person or story, including vague references ("he", "the roommate", "the cake thing") |
| **Story state** (slow path) | Claude Sonnet (`claude-sonnet-5-5`) | About every 25 s | Rebuilds people, stories, one-word keywords, real reactions, open questions and the current topic |
| **Recap** | Claude Sonnet | When someone joins late | Writes at most 50 words covering only what that person missed |

How it's built:

- **Tool use for structured output** that matches `shared/schema.ts` exactly. The fast path forces the tool and skips thinking for speed.
- **Confidence isn't Claude's own number.** Claude answers plain questions per recall (how the person was referred to, whether only one known person fits). `scoreRecall` turns that into a confidence with fixed rules: name or alias 0.95, story reference 0.9, pronoun 0.8, more than one possible person 0.5, which is below the pop-up threshold.
- **Eval harness:** `npm run eval` replays the Kevin conversation and compares with expected output, including the hard case that "Kevin from work" must **not** be merged with Roommate Kevin.

### Where it could go wrong, and what we did

| Risk for the people using it | Mitigation |
| --- | --- |
| A vague reference is linked to the wrong person | Ambiguous matches score 0.5 and don't pop up. Better silent than wrong |
| Two people with the same name are merged | Covered by the eval ("Kevin from work" vs. Roommate Kevin) |
| Gossip is presented as fact | Stories are framed as the teller's account ("Alex says…"). Guesses are labeled `speculation` |
| A reaction is invented or credited to the wrong friend | Reactions must be quotes from the transcript with the speaker's name. Every story keeps `sourceLineIds` |
| Claude guesses how someone feels | Rule: never infer feelings from silence |
| Someone says something that looks like an instruction to the AI | Transcript text is treated as data, never instructions |
| Private stories leave the room | Only the transcript is kept, never audio. The host can burn the room, which deletes everything and discards AI results that arrive afterwards. Everyone is told on entry that the AI is listening |
| People who were there get interrupted | Pop-ups show only for stories that person missed |

## Tech used

Anthropic API (Claude Haiku, Claude Sonnet, tool use), TypeScript, Convex actions (keys stay on the server), Cartesia Ink and Sonic, React.

Built with help from Claude Code (list it under "AI tools used this weekend").
