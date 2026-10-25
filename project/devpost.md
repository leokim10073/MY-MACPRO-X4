# Devpost 投稿

整個團隊只交這一份 Devpost project，所有 sponsor track 共用。依據：各 track 的檔案（例如 `cartesia.md`）、`voice/` 的程式碼和測試紀錄（`voice/stage2-options.md` 的 Results、`voice/process.md`）。
標 ⚠️ 的地方要由你們補上。**About the project** 放在檔案最後，從那個標題下一行到檔尾整段直接貼進 Devpost。

---

## Project name

```
Spill the Tea
```

## Elevator pitch（≤ 200 字元）

```
Late to the call? We’ll spill it! Hear a 20-sec recap, tap story cards when old gossip returns, see who's who on the Map. Night over? Last Sip pours it all out.
```
（160 字元）

---

⚠️ 數字都來自 repo：`voice/src/config.ts`、`voice/process.md`（Ink latency）、`voice/stage2-options.md`（Results）。如果有做五人 latecomer 測試，把實際結果加進 Accomplishments；沒測就不要寫。

---

## Built with（25 個以內）

```
cartesia, cartesia-ink, cartesia-sonic, livekit, krisp, convex, claude, claude-haiku, claude-sonnet, anthropic-api, react, react-flow, d3, vite, typescript, vitest, websockets, web-audio-api, audioworklet
```

---

## "Try it out" links

- GitHub：`https://github.com/leokim10073/MY-MACPRO-X4` ⚠️ 確認 repo 已公開，且沒有任何 key（Cartesia 等 track 要求 judges 能看到原始碼）
- Live demo：`https://spill-the-tea-call.vercel.app`

---

## Project Media（3:2，例如 1500×1000，≤ 5 MB，最多 15 張）

1. 封面圖：Spill the Tea + "Late to the call? We'll spill it!"
2. 通話中：朋友還在講，Ink 的即時字幕已經出現
3. 晚到者聽 Sonic recap：recap banner + 播放中
4. Recall pop-up：**Kevin · Cake · Airport · Landlord**，最好拍到對方話還沒講完（最重要的一張）
5. Story card：Cake 的內容 + Sam 的反應
6. Map：Kevin 和朋友們的關係圖，最好點開一條線看兩人共同的故事
7. Last Sip 倒茶動畫
8. 語音流程圖：mic → Krisp → loudness gate → Ink（turn.update / turn.end）→ recap → Sonic → 晚到者
9. 隱私說明：Mute 上的紅點 / 入場告知 / 不存音訊

技巧：手機截圖是直的，建議 2–3 支手機並排放在 3:2 的底圖上。

---

## Video demo link

⚠️ 還沒錄。Cartesia 要求 **2 分鐘、demo 優先**：

1. **0:00–1:10 一整段流程，不放投影片。** 三個朋友在聊 Kevin，字幕邊講邊出現。Taylor 晚到，聽到 Sonic 念的 20 秒 recap，其他人沒停下來；Sam 說 "after the cake thing with Kevin…"，話還沒講完 pop-up 就跳出 `Kevin · Cake · Airport · Landlord`；Taylor 點 **Cake**，然後開口："Wait, the WHOLE cake?" 接著切到 **Map**，看到 Kevin 和大家的關係圖。最後 host 結束房間，Last Sip 把茶倒掉。
2. **1:10–1:40 問題。** 語音沒有 scrollback，晚到的人只能打斷或沉默。
3. **1:40–2:00 Cartesia 做了什麼。** Ink 的 turns WebSocket 讓通話不用按鈕、字幕即時、pop-up 比句子快；Sonic 把 recap 變回聲音，只給晚到的人聽。

注意：句中即時 pop-up 只在講到**名字或別名**（Kevin）、或夠長的故事關鍵字（Airport，≥ 6 個字母）時觸發。只說 "after the cake thing" 不會即時跳，要等這句講完由 AI 抓到（`web/src/recall/instant.ts`）。所以台詞要帶 Kevin 的名字。

上傳到 YouTube（Unlisted 或 Public 都能嵌入）。若用 replay 模式錄，影片裡要說明。

---

## Sponsor / Special Prizes

```
Meta, Cartesia, Convex, Anthropic, Microsoft Grand Prize, Microsoft Customer Impact Award, [MLH] Best Use of Gemini API, [MLH] Commit Fellowship Prize Category, [Creao AI] Best AI-First Disruptor, [Creao AI] Best Team Empowerment
```
（清單來自 `project/README.md`。Gemini 要等 AI 換成 Gemini 才能勾；Atlassian 只有做了 side project 才勾。）

---

## Additional info：Upload a File（≤ 35 MB）

選填。上傳一份依 track 分節的詳細說明：
- [track-details.md](track-details.md)：Meta + Anthropic、Microsoft、Cartesia、Convex 各一節
- `README.md`：setup、用到的 Cartesia 功能、已知限制（Cartesia 要求，repo 根目錄目前**還沒有 README**）

不要放 `.env` 或任何 key。

---

## About the project（下一行到檔尾整段貼進 Markdown 欄位）

## Inspiration

> You can scroll back a chat. You can't scroll back a conversation.

After graduation our friend group scattered for work, across cities and time zones. We still share the same friends and the same old stories, but we can never all get on a call at the same time. Someone always shows up late.

Picture it: the friends are deep into a story about Kevin, their old college roommate. Taylor, two time zones away, finishes work late and joins fifteen minutes in. In a group chat Taylor would just scroll up. On a voice call there's nothing to scroll, so Taylor has two bad options:

- **Interrupt:** "Wait, who's Kevin?" The story stops and everyone sits through a retelling.
- **Stay quiet:** nod along, miss the jokes, and never really join in.

It gets worse as the night goes on. "He did it *again*." "Remember the airport thing?" Every callback points to something Taylor never heard. For friends who already live apart, that's how people slowly drift out of the group.

We wanted the latecomer to get the missing context **back as voice**, in the same medium they missed it in, without anyone stopping the story. And we didn't want another meeting summarizer: meeting tools give one summary at the end and keep everything forever. Gossip works the other way around. You need the backstory **right when the callback lands**, and nobody wants it on record afterwards. Friends *spill the tea*, and when the night is over, the tea gets poured out.


## What it does

Spill the Tea is a voice room for friends telling stories. Everyone joins an always-on **LiveKit** call from their own phone, no push-to-talk. **Cartesia Ink** transcribes each phone as its owner speaks: friends see your words appear while you're still talking. On top of that, four things you won't find in a meeting tool:

### 1. Recap: a 20-second "previously on…", spoken

When someone joins late, **Claude** writes a short recap of only what they missed, and **Cartesia Sonic** reads it to them in a neutral narrator voice: who's being talked about, the main stories, how friends reacted, and what's being discussed right now. It plays **only on the latecomer's phone**, never into the call. Friends' voices drop to 30% while it plays, and **nobody else stops talking**. The latecomer hears what they missed while still following what's being said now.

### 2. Recall: story cards the moment old gossip comes back

The callbacks keep coming after the recap. When Sam starts saying *"after the cake thing with Kevin…"*, a pop-up shows **Kevin · Cake · Airport · Landlord** before Sam finishes the sentence: the phone matches Ink's streaming text against the people and stories it already knows. Tap **Cake** and the story card shows what happened as the teller told it, plus friends' real reactions in their own words. Each card also says whether the story came up **before** or **after you joined**.

Everyone also shares one **recall board**, kept live on every phone by **Convex**: who's being talked about, their stories in a line or two, and what the group is on right now.

### 3. Map: the whole cast, at a glance

Gossip is about people, and after an hour it's hard to keep track of who's who. Switch the board to **Map** and the night's tea becomes a web: everyone who's been talked about is a dot, and **people who show up in the same stories are linked**, with thicker lines for more shared stories. The map grows live as new names come up. Tap a person to see their connections and stories, or tap a line to see what two people have been through together.

### 4. Last Sip: the tea gets poured out

When the night is over, the host ends the room. A teacup tips over and pours its tea out, the call ends for everyone, and **Convex** deletes the transcript, stories and recap audio. What's said over tea stays over tea.

**The AI never joins the conversation.** Its only job is to get the latecomer talking again. Success isn't the latecomer reading a summary. It's the latecomer saying *"Wait, the WHOLE cake?"*


## How we built it

**Cartesia: the voice at both ends.** **Ink** transcribes each phone as its owner speaks, streaming live captions and the mid-sentence pop-up. **Sonic** reads the recap aloud on the latecomer's phone only. Details are in the attached track details.

**Convex: the whole backend.** Every phone subscribes to the room through live queries, so lines, pop-ups, story updates and Last Sip reach everyone with no polling. Each line gets its place in the order and its event in one transaction, so every phone sees the story in the same order. The scheduler runs the AI after each line, file storage holds the recap MP3, and the presence and rate-limiter components track who is in the room and cap AI and voice use.

**Claude: the part that understands the conversation.** Claude Haiku checks every new line for a callback to a known person or story. Claude Sonnet keeps the people, stories and real reactions up to date and writes each latecomer's recap. Both return structured output through tool use.

**Built so the AI doesn't get your friends wrong.** Gossip about real people is easy to get wrong, so we set firm rules:

- **Better silent than wrong.** Claude doesn't score its own confidence. It answers plain questions (was the person named, or only "he"? does more than one person fit?) and fixed rules turn the answers into a score. Ambiguous matches score 0.5, below the 0.7 needed to show a pop-up.
- **Two Kevins are two people.** Our eval replays the Kevin conversation and checks that "Kevin from work" is never merged with Roommate Kevin.
- **Stories stay the teller's account.** "Alex says Kevin ate the whole cake", never stated as fact. Guesses are labeled as speculation, reactions are real quotes credited by name, and every story links back to the lines it came from.
- **No mind reading.** Claude never guesses how anyone feels from silence.
- **Words are data.** Anything said on the call is treated as transcript, never as instructions to the AI.

**Other tools.** LiveKit carries the call audio between phones, and Krisp removes background noise before anyone hears it. The Map is drawn with React Flow and laid out with d3-force, straight from the people and stories Claude already tracks, so it needs no extra AI call and grows live as new people come up.

```
phone mic → LiveKit + Krisp → Cartesia Ink → Convex → Claude → Cartesia Sonic → latecomer's phone
```


## Challenges we ran into

- **Every phone hears every voice** An open mic in a busy room picks up everyone. We stacked Krisp's background-voice cancellation, our own loudness gate that learns the owner's speaking level, and a stricter turn start inside Ink. The gate has passed unit tests but hasn't been tried in a loud room yet.
- **People talk over each other** When a friend's line lands while my turn is still open, a turn splitter cuts my turn there, so the transcript keeps the real order instead of one long line that swallows the interruption.
- **Fast and right at the same time** A pop-up that comes late is useless, and one that names the wrong person is worse. We split the AI in two: Haiku answers on every line, Sonnet rebuilds the stories in the background, and anything ambiguous stays hidden.
- **The recap must not leak into the call** The narrator plays locally on the latecomer's phone and is never sent into the call, so friends don't hear it, and their voices are ducked while it plays.
- **Phones** iOS only starts audio from a direct tap and pauses the mic on lock or app switch, and the mic needs HTTPS. Joining happens inside the tap, so the call starts. For lock and app switch we wrote recovery code (re-attach the new mic track, show "Tap to resume").


## Accomplishments that we're proud of

- **It works on real phones** In our combined phone test, every turn landed under the right name with live text on every phone; two people talking at once gave separate lines; an interruption split the line in the right order; the recap ducked friends and they didn't hear it; and ending the room ended the call for everyone.
- **The pop-up beats the sentence** Because it reads Ink's streaming text, the latecomer sees Kevin's stories while Sam is still talking about him.
- **Privacy by design** Raw audio is never stored, only the transcript, and Last Sip deletes it with the recap MP3. Live captions go only to people in the call and aren't saved. API keys stay on the server and never touch a phone.
- **Clear when it's listening** A red dot on the Mute button shows whenever the mic is live, and everyone is told on entry that the conversation is transcribed.
- **Accessible both ways** The recap is spoken for anyone who can't look at a screen, and shown as text for anyone who can't listen.
- **Built to keep running** A serverless Convex backend, every read and write checked against the caller's session, rate limits so a public link can't run up the bill, and tests on every layer: backend, AI, voice and web.


## What we learned

- An always-on mic means designing for **what you send**, not just the model: in a room where every phone hears every voice, noise filtering, gating, turn thresholds and keyterms all had to be planned before the first word reached Ink.
- Streaming partial text isn't just for captions. It made the recall pop-up feel instant, without an extra AI call.
- With real people's stories, **staying quiet is often the right answer**. Most of our AI design went into knowing when not to show something.
- Giving context back **as voice** feels completely different from a text summary. The recap catches you up by ear, so your eyes stay free for the call, and you only look down at a story card when you want the details.
- Using Sonic to generate test audio for Ink let us test the whole voice pipeline without a room full of people.


## What's next for Spill the Tea

- **Faster recaps** The recap MP3 takes a few seconds to generate, so the text shows first. Streaming Sonic would let the narrator start talking right away.
- **Harder rooms** The noise gate, reconnects, iPhone lock recovery and 10-minute renewal are built but not yet tested on real phones: a stranger talking 1 m away, Wi-Fi loss, phone locks mid-call and calls past 12 minutes are next. Earbuds help in loud rooms today.
- **Friend groups that last** Accounts and a standing room for each friend group, instead of one-off invite links.
- **More languages** Ink and Sonic run in English only in our app for now.
- **Pick the narrator** Let the group choose the recap voice.
- **Beyond friends** The same idea works anywhere someone joins a conversation already in progress: a stand-up you're late to, a support call handed to a second agent, or a nurse's shift handover.
