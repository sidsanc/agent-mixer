# Ideas: "The Demo the Whole Room Remembers"

Creative-director lens for Haunted Hacks (Oct 31, 2026). Written 2026-10-30, based on `event-brief.md`, `terse-durable-actors.md`, `agent-relay.md` and `sponsors-and-judging.md`. No application code here.

**What every idea below must do:**
- Judges join from their phones and become part of the system, not spectators.
- Each beat judges can see must map to one specific primitive. The primitives:
  - one instance per ID
  - `@Emittable` live sync
  - alarms
  - sockets that survive dormancy
  - Relay channels, DMs, threads and typed actions
  - agents on more than one machine
- Mixed vendors: Claude, GPT and Codex, ideally across two machines.
- Resumability can appear, but only as a twist, never as the premise.
- The Halloween theme is the *mechanic*, not a skin (the poltergeist *is* chaos injection, the ghost *is* durable state).

**Shared substrate.** Ideas 1, 2 and 3 below reuse about 70% of the same plumbing:
- one actor per phone, joined by QR
- a Relay "spirit board" visualizer
- an authoritative non-interleaved game/world actor
- SDK-driven LLM agents (our own loops, not CLI harnesses) on 2 machines
- a Realtime voice narrator

So the team can pivot between them as late as 12:30 without throwing work away.

---

## 1. Ten candidate ideas

**1. Poltergeist: chaos engineering as a party game**
- **One-liner:** The audience haunts a live, running service from their phones. A mixed-vendor coven of AI SREs (Claude as incident commander, GPT on triage, Codex as fixer on a second machine) fights in real time to keep it alive.
- **Audience:** Scan the QR code and become a poltergeist with 3 curses: *possess* a shard (latency), *rot* its cache (bad data), *summon a horde* (traffic spike). The big screen shows shard health and agents arguing in `#incident`.
- **Primitives:**
  - one `Shard:{n}` actor per shard, so two agents can't both fail over the same shard (single instance per ID)
  - `@Emittable` health tiles
  - an alarm-driven cooldown on each `Poltergeist:{phoneId}` actor
  - Relay threads per incident and DMs for side deals
  - typed actions `shard.drain` / `shard.failover` / `poltergeist.exorcise`
- **Gasp:** The agents trace an attack to a specific judge's phone and *exorcise* them. That judge's screen goes black with "You have been banished", because the actor closes that socket. Live, aimed at a judge, by an AI.

**2. The Last Séance at Durable Manor: the victim is a real process we kill**
- **One-liner:** A murder mystery where the suspects are rival AI models on different machines and the detectives are the judges. The murder is a real `kill -9` of the victim agent's process.
- **Audience:** Phones show the public parlor feed. Each judge gets 2 "candles" to spend peeking into a private DM thread between suspects. They vote to accuse. One judge interrogates a suspect by voice through the Medium (the Realtime voice agent).
- **Primitives:**
  - the `Manor` actor seals the ground truth in SQLite; it is non-interleaved, so votes can't be double-counted
  - Relay group DMs for alliances, threads for alibis, typed actions `manor.search_room` / `manor.accuse` as MCP tools
  - the grandfather-clock alarm advances game phases
  - the victim's actor persists its inbox and memory
- **Gasp:** The killer agent invokes `manor.murder`, and the Butler's process actually dies on screen (exit 137). The Medium holds a séance: a new process *on a different machine* reattaches to `Guest:butler`, and the ghost testifies by name to the last DM it received before it "died".

**3. The Coven: three rival models deliberate, the audience whispers**
- **One-liner:** Ask the coven a question. Claude, GPT and Codex debate it in a live séance channel, and judges are "familiars" who can secretly whisper to one witch to sway her.
- **Audience:** Each judge picks a witch and sends whispers (Relay DMs via a typed action). They watch alliances form in group DMs, then vote on a final verdict brewed in the Cauldron.
- **Primitives:**
  - Relay channel `#sabbath`, DMs, group DMs, threads, reactions
  - `whisper` and `cast_vote` typed actions
  - the `Cauldron` actor tallies votes serially, with `@Emittable` live bars
  - an alarm closes each "round of the moon"
- **Gasp:** One witch reads another's private DM transcript and calls her out on stage: "Codex, at 4:31 you told Claude you'd vote *no*. The familiars got to you." The audience sees its own whisper quoted back.

**4. Crossroads: make a deal with the devil, and your agent negotiates it**
- **One-liner:** Every judge gets a personal devil agent. They speak one wish, and the devils haggle with each other over Relay DMs for a scarce pool of cursed items, settled atomically at midnight.
- **Audience:** Push-to-talk: "I want the haunted Mac mini, I'll give up my soul." Phones show your devil's live negotiations and its offers and counteroffers.
- **Primitives:**
  - `Devil:{phoneId}` actors (one per judge, rejoin from any device)
  - a non-interleaved `Ledger` actor with `db.transaction` settlement
  - Relay DMs and group DMs for cartels
  - `market.offer` / `market.accept` typed actions
  - the midnight alarm closes the market even if every phone is locked
- **Gasp:** Two judges' devils form a cartel in a group DM and corner a third judge. The midnight alarm fires and every contract executes in one atomic tick.

**5. Ouija: the whole room is the planchette**
- **One-liner:** Every phone's tilt (device motion) pushes one shared planchette. Spirits from three vendors compete over Relay to steer what it spells.
- **Audience:** Thirty people physically tilting phones. The planchette lurches on the big screen.
- **Primitives:**
  - one `Board` actor aggregates input; `@Ephemeral` position, throttled to 10 Hz per phone
  - `@Emittable` planchette
  - Relay `#beyond` channel where spirits argue about the next letter
  - `spirit.nudge` typed action
- **Gasp:** The board spells a judge's name, which the spirits pulled from the check-in list, and the room screams.

**6. Hauntville: a persistent world that has been alive since 11am**
- **One-liner:** All day, hackers in the hallway create ghosts by voice. Each ghost is an actor that lives on alarms, wanders rooms, and gossips over Relay. By demo time it's a town of about 100 ghosts with 5 hours of history.
- **Audience:** Judges walk in by phone and meet ghosts that other hackers created. They can find the ghost the Agent Relay CTO made at 1pm.
- **Primitives:**
  - one actor per ghost, with alarms
  - Relay channels per room
  - sockets that survive dormancy (ghosts sleep and wake)
  - `@Emittable` map
- **Gasp:** "This world has survived 41 deploys today. Here's what your ghost has been doing while you ate lunch."

**7. Ghost Concierge: a voice front desk with an agent back office**
- **One-liner:** A judge phones the haunted hotel by voice. Backstage, the concierge DMs housekeeping (Codex), the kitchen (Claude) and billing (GPT) over Relay. Everything is visible.
- **Audience:** A judge orders "a bloody mary to room 13". The screen shows the agents coordinating, and the order status ticks live on their phone.
- **Primitives:**
  - a `Guest:{phoneId}` actor per caller
  - typed actions `kitchen.fire_order` and `room.charge`
  - an `Order` actor with alarms for SLA escalation
- **Gasp:** The judge hangs up mid-request and redials from a different phone. The concierge continues mid-sentence, because the guest's actor still holds the conversation.

**8. Exquisite Corpse: a surrealist horror comic by blindfolded models**
- **One-liner:** Three models from different vendors each draw one panel (via gpt-image) seeing only the previous caption, passed by Relay DM. The audience votes the twist between panels.
- **Primitives:**
  - Relay DMs enforce information hiding
  - a `Comic` actor with `@Emittable` panels
  - alarms pace the panels
- **Gasp:** The final reveal shows the full strip, and each model's private intent pulled from its thread contradicts what it actually drew.

**9. Body Snatcher: one soul, three vendor bodies**
- **One-liner:** A ghost's soul (memory, persona, relationships) lives in an actor. Mid-conversation it jumps from a Claude body on laptop A to a GPT body on the Mac mini to a Codex body in a Freestyle VM.
- **Audience:** Judges chat with the ghost on their phones while the presenter "exorcises" its current body.
- **Primitives:**
  - the actor as identity, holding a persisted Relay token
  - agents across machines
  - sockets that survive dormancy (phones never disconnect)
  - Relay presence
- **Gasp:** The laptop is unplugged and the ghost finishes its sentence in a different model's voice on the Mac mini across the room.

**10. Night of the Living Load: the audience is the zombie horde**
- **One-liner:** Each judge's tap spawns 100 zombie clients. An AI ops agent reshards actors and Supabase Broadcast channels live to survive.
- **Primitives:**
  - shard-per-actor
  - Supabase Broadcast vs Postgres Changes
  - Relay `#ops` channel
  - `ops.reshard` typed action
- **Gasp:** The live counter crosses 5,000 zombies and the latency graph stays flat.

---

## 2. Scoring

1–5 each. **Feasibility** reflects the real gotchas:
- every LLM class needs `@Interleave`, which kills transactions
- nested mutations aren't persisted
- the client must be regenerated after every API change
- 500-actor org cap
- Relay registration is create-only
- Relay messages land between turns
- actions are fire-and-forget
- Windows is PTY-only for harnesses
- Supabase free tier allows 100 msg/s

**Reliability** = how likely the punchline lands live in a noisy room on venue Wi-Fi.

| # | Idea | Creativity | Feasibility (5h) | Demo reliability | Track coverage (Terse + Relay + bonus) | Room-wow | Company potential | **Total** |
|---|---|---|---|---|---|---|---|---|
| 1 | **Poltergeist** | 5 | 3 | 3 | 5 | 5 | 4 | **25** |
| 2 | **Durable Manor** | 4 | 4 | 4 | 5 | 5 | 2 | **24** |
| 3 | **The Coven** | 4 | 4 | 4 | 5 | 4 | 3 | **24** |
| 4 | Crossroads | 4 | 3 | 3 | 5 | 4 | 4 | 23 |
| 9 | Body Snatcher | 4 | 3 | 3 | 5 | 4 | 3 | 22 |
| 6 | Hauntville | 5 | 2 | 3 | 4 | 4 | 3 | 21 |
| 7 | Ghost Concierge | 3 | 3 | 3 | 4 | 3 | 5 | 21 |
| 8 | Exquisite Corpse | 4 | 4 | 4 | 4 | 3 | 2 | 21 |
| 5 | Ouija | 5 | 3 | 2 | 3 | 5 | 1 | 19 |
| 10 | Living Load | 3 | 4 | 3 | 3 | 3 | 3 | 19 |

**Notes on near-misses:**
- **Ouija:** the best pure room moment, but Relay is decorative and device-motion permissions on iOS are a live-demo trap.
- **Hauntville:** brilliant, but it needs hallway seeding all day while also building.
- **Body Snatcher:** a strong technical story, but resumability *is* its premise, which the brief warns against.
- **Crossroads:** the strongest business after Poltergeist. Keep it as a backup if judges skew business-minded.

---

## 3. Deep dives: top 3

### Deep dive A: POLTERGEIST

**Pitch:** "Chaos engineering is a $X B practice nobody enjoys. We made it a party. You're the poltergeist; a coven of Claude, GPT and Codex is your on-call team. And they fight back."

**Why it wins on this lens:** Judges *break things*, which every engineer loves. Agents visibly argue and coordinate under pressure. And there is a moment where the AI targets a specific person in the room. The company is real: an AI incident-response and chaos-testing team ("agentic SRE"). Durable Actors are why it works: serialized shards mean agents can't race each other's remediations. Relay is why it works too: heterogeneous agents across machines coordinate through threads and typed actions.

#### Architecture

**Actors** (Terse Cloud, `terse-sdk`):

| Actor | ID | Interleave? | State | Role |
|---|---|---|---|---|
| `Arena` | `arena-{demoId}` | **No** (keeps `db.transaction`) | `@Persisted @Emittable` phase, uptime %, curses cast/healed, poltergeist leaderboard. SQLite `events` log and a `timers` queue. | Authoritative referee. A single alarm drives the round clock and is re-armed to the earliest timer in the queue (gotcha: one alarm per actor). |
| `Shard` | `shard-0` … `shard-5` | **No** | `@Persisted @Emittable` status (`healthy/possessed/rotting/draining/down`), p95, errorRate, `lockedBy` (which agent owns remediation) | The "service". `applyCurse()`, `drain(agent)`, `failover(agent)`, `heal(agent)`. Because there is one instance per ID, a second `failover` from another agent returns `{rejected, lockedBy:"claude-ic"}`, and that rejection is shown on screen. |
| `Poltergeist` | `pg-{phoneId}` (phoneId from an httpOnly cookie) | **No** | `@Persisted` name, costume emoji, cursesCast, `cooldownUntil`, `exorcised`. `@Emittable` cooldown + exorcised. | One actor per judge. The phone socket connects here, so there is exactly one socket per actor (avoids the "few users per actor" limit). Refreshing or opening on a second phone gives the same poltergeist and the same cooldown, so a judge can't double-curse. `onAlarm` clears the cooldown. `exorcise()` sets the flag and closes the socket. |
| `SreAgent` | `sre-claude`, `sre-gpt`, `sre-codex` | **Yes** (`@Interleave`, since it makes LLM calls) | `@Persisted` Relay `at_live_` token, rolling summary of what it has done, current incident id | Each agent's "home". Holds the token so restarts reconnect instead of re-registering (gotcha: registration is create-only). Optional: we can run the LLM loop in a plain Node process and use the actor just for identity and memory. |

**Backend (Bun, hosted on a Freestyle VM at `poltergeist.style.dev`; this is the Freestyle tie-in):**
- serves the phone web app
- issues `prepareWebsocket` grants
- turns `POST /curse` into `Poltergeist.cast()` and then `Shard.applyCurse()`
- runs a small load generator that hits shards at about 20 req/s so the metrics are real

**Not assumed:** actor-to-actor calls are UNVERIFIED on hosted, so the design doesn't rely on them. If they work at 11:30, collapse `/curse` into the actor.

**Agent Relay** (hosted workspace, `@agent-relay/sdk` 14.0.0 pinned):
- **Channels:**
  - `#incident`: alerts come in, the IC declares, status updates go out
  - `#postmortem`: auto-written at the end
  - `#poltergeists`: the Arena posts curse events, so agents "hear" the haunting
- **Threads:** one per incident. The IC opens it and the others reply in-thread, so the visualizer shows a tree of activity.
- **DMs:** IC → fixer ("take shard-3, I'll shed traffic"). GPT triage → IC with the attribution evidence ("90% of curses from pg-7f2…").
- **Typed actions** (Zod, auto-exposed as MCP tools). The handlers are thin and call actor RPC:
  - `shard.drain {shardId}`
  - `shard.failover {shardId}`
  - `shard.heal {shardId}`
  - `traffic.shed {percent}`
  - `poltergeist.exorcise {phoneId, reason}`, restricted with `availableTo: [{name:'claude-ic'}]` so only the IC can banish (on-screen proof of permissioning)
  - Actions are fire-and-forget, so each handler messages the caller back in-thread with the result (`✅ shard-3 failed over by codex-fixer`).
- **Trigger/alert:** the `Arena` posts to `#incident` when a shard crosses its threshold. We can use an inbound Relay webhook (`POST /webhooks`) or just the SDK.
- **Cross-machine:**
  - Claude IC and GPT triage run on the presenter laptop.
  - **Codex fixer runs on a second machine** (the Mac teammate's laptop, or a Freestyle VM via the documented broker-on-Freestyle path). Its presence dot is labeled with that machine name.
  - **Stretch:** a real Codex CLI harness via `@agent-relay/harnesses` on the Mac. Not on Windows, which is PTY-only.
- **Observer link** (`agent-relay observer`) on the second projector as "raw truth" next to our themed UI.

**Agents:**
- SDK-driven loops: Anthropic API for Claude, `gpt-6.1-terra` for GPT, and a GPT/Codex model for the fixer.
- Each loop works in short cycles: read channel/thread/DMs, decide, invoke one action, post one message.
- Rate-limit each agent to 1 action every 4s, so humans can follow along and token cost stays bounded.

**Voice:**
- The IC's announcements are spoken over the venue PA through OpenAI Realtime (`gpt-realtime-2.1`) with a spooky voice: "Shard three is possessed. Codex, take it."
- **Output only.** No speech input is needed, which removes the noisy-room risk.

**Supabase (scale prize, optional):**
- `events` table mirrored from the Arena (system of record across rooms)
- Broadcast channel `arena:{id}` for the big-screen spectators
- **Pitch line:** "per-room Arena actors + Broadcast fan-out, not Postgres Changes, so 10,000 concurrent poltergeists across rooms"

#### 2-minute demo script

| t | Beat | What judges see | Primitive shown |
|---|---|---|---|
| 0:00 | "Every company has an on-call team. Ours is Claude, GPT and Codex, and they've never met you. Scan this." QR code on screen. | Phones load. Each judge gets a costume ghost and a name. The leaderboard fills with *their* names. | One `Poltergeist` actor per phone; `@Emittable` join |
| 0:15 | "This is a real service, six shards serving traffic." | Six green tiles with live p95 sparklines. Three agent cards show presence dots: `claude-ic@presenter-laptop`, `gpt-triage@presenter-laptop`, `codex-fixer@mac-mini`. | `Shard` actors; cross-machine Relay presence |
| 0:25 | "You have three curses. Go." | The room taps. Tiles turn purple and orange. `#poltergeists` floods. A judge tries to curse twice, gets "cooldown 8s", refreshes, and still sees "cooldown 6s". | Alarm cooldown; one instance per ID survives refresh |
| 0:40 | Agents respond. | `#incident` lights up. The IC opens thread "INC-1: shards 2,3 possessed". A DM line flies from IC to Codex. The PA voice: "Shard three is possessed. Codex, take it." | Relay channel, thread, DM; Realtime voice |
| 0:55 | **The race.** GPT and Codex both try to fail over shard-3 at once. | The tile shows `failover by codex-fixer ✅`. GPT's card shows `rejected: locked by codex-fixer`. GPT replies in-thread, "ack, taking shard-2". | Single-writer actor = no double remediation |
| 1:10 | "Summon the horde." The presenter nominates the front row. | A traffic spike. The IC invokes `traffic.shed 30%`, and the gauge shows it. | Typed action → actor RPC |
| 1:25 | **Gasp.** GPT triage DMs the IC: "pg-7f2 (🎃 *Will*) is 40% of curses." The IC: "Banishing." | The named judge's phone goes black: *"You have been exorcised by claude-ic."* The room laughs and that judge groans. A second judge refreshes to rejoin and is *still* banished. | `availableTo` permissioned action; actor closes the socket; persisted state per ID |
| 1:40 | **The twist.** "One more poltergeist: me." The presenter Ctrl-C's the Claude IC process live. | Claude's card goes grey. Within ~5s Codex posts "IC is offline. Reading INC-1 thread. I'm IC now." It continues from the incident state, and judges' phones never dropped. | Relay presence + durable thread history; actors hold incident state; gateway sockets survive actor dormancy |
| 1:52 | All green. The postmortem posts itself to `#postmortem`. Close: "Agentic SRE. Durable Actors make remediation race-free. Agent Relay lets any vendor's agent join the on-call rotation." | Postmortem card with the uptime score and "MVP poltergeist: Will". | Relay channel as artifact; SQLite event log |

#### 5-hour build schedule (assumes 3–4 people: **A** actors/backend, **B** Relay agents, **C** UI/phone, **D** voice/demo/infra)

| Time | A | B | C | D |
|---|---|---|---|---|
| 11:00–11:30 | `terse init`, deploy a hello actor to cloud, issue a WS grant from the backend, **test actor-to-actor + socket count** | Relay hosted workspace, pin 14.0.0, register 3 agents, persist tokens | Phone page skeleton + QR; big-screen layout | Freestyle VM + `*.style.dev`, OpenAI/Anthropic keys, Realtime TTS smoke test |
| 11:30–13:00 | `Shard`, `Poltergeist`, `Arena` actors; curse pipeline; load generator | Agent loop v1 (read → act → post); actions `shard.*` wired to actor RPC | Six tiles via `@Emittable`; Relay feed panel (SDK listener → socket) | Mac/second-machine agent runner; observer link |
| 13:00 | Lunch: **first end-to-end run** (curse → agent heals) | | | |
| 13:00–14:30 | Cooldown alarms with a timer queue; lock/reject semantics; exorcise closes the socket | Thread per incident, DMs, attribution prompt, `availableTo` on exorcise; IC-failover logic (presence-based) | Exorcised screen, leaderboard, DM "flying line" animation | Voice announcer hooked to IC messages; seeded-state script |
| 14:30–15:15 | **Freeze features.** Rehearse with 6 real phones; fix races | Tune prompts for snappiness; 1 action per 4s | Polish, theme, sounds | Supabase mirror + Broadcast (if time) |
| 15:15–15:45 | Record the **backup video** (full 2-min run); write the Builderbase description naming every sponsor and where it's used | | | |
| 15:45–16:00 | Buffer, submit | | | |

**Cut list** (cut from the top first):
1. Supabase mirror
2. Real Codex CLI harness (use an SDK loop on the second machine)
3. Voice announcer (fall back to on-screen captions)
4. "Summon horde" curse
5. Postmortem auto-write

**Never cut:**
- the race/lock beat
- exorcise
- the IC-handoff twist

#### Failure modes and fallbacks

| Risk | Mitigation |
|---|---|
| Venue Wi-Fi chokes with 30 phones | The phone page is under 50 KB with no framework. Judges can use cellular. The backup is a "presenter mode" where 3 teammate phones play the poltergeists. |
| LLM agents are slow or ramble | Hard cap of 1 action per 4s. A deterministic fallback policy (heuristic healer) takes over silently if no action arrives in 8s. Pre-warm the agents with a dummy incident at 3:55. |
| Agents exorcise the wrong person, or nobody | Attribution is computed by the Arena (SQL count), not guessed by the LLM. The LLM only decides *when*. A presenter hotkey forces the exorcise beat if it hasn't happened by 1:30. |
| Relay hosted hiccup (`queued_unconfirmed`) | It's not an error, so don't retry blindly; use an Idempotency-Key. The UI renders from our own actor-mirrored feed, not from the observer. |
| Terse 429 `actor_start_rate_limited` | About 12 actors total plus one per phone (≤40). Pre-start the shards and agents at 3:55 with a warm-up script. |
| Ctrl-C twist fails (Codex doesn't take over) | The takeover is triggered by a presence listener plus a deterministic prompt. If it misses, the presenter says "Codex, you're up" via a DM from a human Relay identity. |
| Total failure | A 2-minute recorded video on a second laptop, cued up. A **seeded-state** script replays a recorded curse sequence against live actors, so it is still real but needs no audience. |

---

### Deep dive B: THE LAST SÉANCE AT DURABLE MANOR

**Pitch:** "A murder mystery where the suspects are rival AI models, the detectives are you, and the victim is a real process we kill on stage, who comes back as a ghost to testify, because its soul was a durable actor."

**Why it's on this list:** It's the most *theatrical* idea, and resumability becomes the plot twist rather than the premise. The Terse founders literally asked for "a kill/restart that resumes mid-task" to be visible, and we stage it as a murder. The Relay founders asked for mixed vendors on multiple machines with transcripts read by other agents; we stage that as alibis and testimony. Company angle is weaker: "AI-native interactive theatre / murder-mystery party kit", i.e. Jackbox for agents.

#### Architecture

**Actors:**

| Actor | ID | Interleave? | State | Role |
|---|---|---|---|---|
| `Manor` | `manor-{gameId}` | **No** | SQLite `truth` (killer, weapon, room, timeline), sealed and never exposed via any RPC that returns it before `reveal()`. `@Persisted @Emittable` phase (`arrival/night/murder/seance/accusation/reveal`), public clue board, vote tally, candles per detective. | GameMaster. The grandfather-clock alarm advances phases even if every client disconnects. A timer table handles multiple deadlines. Votes are serialized, so a judge spamming the button counts once (`UNIQUE(detectiveId)`). |
| `Guest` | `guest-butler`, `guest-heiress`, `guest-groundskeeper`, `guest-medium` | **Yes** | `@Persisted` persona, private secret, Relay token, **inbox snapshot** (last N DMs received, with timestamps), observations given by the Manor | The suspect's *soul*. The LLM process is just the body. When the body dies, the soul remains. |
| `Detective` | `det-{phoneId}` | **No** | `@Persisted @Emittable` candles left, peeked threads, vote | One per judge. Peeking spends a candle; the transaction is atomic. |

**Agent Relay:**
- **Channels:** `#parlor` (public table talk, which the audience sees) and `#beyond` (the ghost speaks here after death).
- **Group DMs** for alliances (`['@heiress','@groundskeeper']`). **Threads** for each alibi interrogation.
- **Typed actions** (MCP tools):
  - `manor.search_room {room}`: the Manor DMs a clue back
  - `manor.examine {item}`
  - `manor.murder {victim}`: `availableTo` the killer only, assigned by the Manor at night
  - `manor.accuse {suspect}`
  - `detective.peek {threadId}`: invoked by the backend for a human
- **Cross-machine:**
  - Butler (Claude) and Heiress (GPT) run on the presenter laptop.
  - Groundskeeper (Codex/GPT) runs on the **Mac mini / teammate Mac**.
  - The Medium is a Mastra agent (sponsor tie) wrapping Relay send and inbox as `createTool()`. That is a novel integration, since no official Mastra adapter exists.
  - The revived ghost spawns on **the second machine**, proving that the soul is not tied to a box.

**The murder mechanic, honestly:**
1. The killer invokes `manor.murder`.
2. The action handler tells our local supervisor to `kill -9` the Butler's Node process (exit code 137 on screen).
3. The Butler's Relay presence drops.
4. During the séance phase, a supervisor on machine 2 boots a new body. It reads `Guest:butler` (persisted token, persona, inbox snapshot, observations), reconnects to Relay with the saved token, and catches up via `inbox` / `GET /workspace/events?since=`.
5. The ghost now posts only in `#beyond`, in a distorted Realtime voice.
6. Its testimony is grounded in its persisted inbox, not invented.

**Voice:**
- The Medium is a `RealtimeAgent` on the presenter's mic (push-to-talk).
- A judge asks a question aloud. The Medium relays it to the suspect over Relay and speaks the answer in that suspect's voice.
- Typed-input fallback on the presenter laptop.

**Supabase:** a Broadcast channel for the parlor feed to the big screen and phones, if socket fan-out is a concern, plus a `games` table holding today's history ("13 murders solved by hackers today").

**Determinism:**
- For the demo game, the Manor uses a **fixed seed** (killer = Heiress), so the ghost's testimony reliably points somewhere interesting.
- The dialogue stays live and unscripted.
- Honest framing: "the scenario is seeded, the agents are not".

#### 2-minute demo script

| t | Beat | Primitive |
|---|---|---|
| 0:00 | "Four guests. Four models. One of them will kill another in the next ninety seconds. You're the detectives. Scan." Phones show the cast and 2 candles each. | `Detective` actor per phone; `@Emittable` |
| 0:12 | The clock strikes (alarm). Night phase: the screen dims, and the DM lines between guests appear as glowing threads, contents hidden. `#parlor` has public banter. Machine labels on the cards: `groundskeeper@mac-mini`. | Alarm-driven phase; Relay group DMs; cross-machine presence |
| 0:30 | A judge spends a candle and peeks at a thread. Their phone (and the big screen, briefly) shows the Heiress and Groundskeeper scheming. | `detective.peek` action; thread read; atomic candle spend |
| 0:45 | **The murder.** A scream SFX. The Butler's terminal on screen prints `Killed (137)`. His card cracks and greys. "The Butler is dead. I mean that literally: that process no longer exists." | `manor.murder` typed action → real `kill -9` |
| 0:58 | A judge interrogates the Groundskeeper by voice through the Medium: "Where were you at midnight?" The answer is spoken aloud, with an alibi. | Realtime voice → Relay DM → threaded reply |
| 1:15 | **Gasp: the séance.** "But you can't kill what's already dead." Machine 2's terminal boots a new process. The Butler's card returns translucent, labeled `butler@mac-mini`. In a ghostly voice: "The last message I received… at 4:12:07… from the Heiress: 'meet me in the conservatory.'" The quote on screen is the actual Relay message id and timestamp. | Actor-persisted soul + token; Relay durable history; cross-machine respawn |
| 1:35 | Judges vote on their phones. Live bars. One judge tries to vote twice: "already voted". | Non-interleaved `Manor` serializes votes; `@Emittable` tally |
| 1:45 | The clock strikes. `reveal()` unseals the truth table: the Heiress, with the candlestick. The leaderboard shows "13 games played today by hackers in the hallway". | Sealed SQLite state; persistence across the day |
| 1:55 | Close: "Durable Actors are souls, Agent Relay is the séance. Any model, any machine, nothing is ever really dead." | — |

#### 5-hour build schedule

| Time | Work |
|---|---|
| 11:00–11:30 | Terse deploy and WS grant smoke test; Relay workspace and tokens; the second machine runs a "hello" agent; Realtime push-to-talk smoke test |
| 11:30–13:00 | `Manor` (phases, alarm and timer queue, truth table, actions); `Guest` soul actor; agent loop with personas; supervisor that spawns and kills bodies |
| 13:00 | **End-to-end:** a game runs from arrival to reveal in text only |
| 13:00–14:30 | Murder → respawn-on-machine-2 pipeline (the hard part; test it 10 times); detective phones, peek, vote; parlor/DM visualizer |
| 14:30–15:15 | Medium voice; ghost voice filter; seeded demo scenario; run 3 games with teammates in the hallway to seed history |
| 15:15–15:45 | Backup video; Builderbase write-up |
| 15:45–16:00 | Buffer |

**Cut list:**
1. Mastra Medium (use a plain SDK agent)
2. Supabase history table
3. Voice interrogation (typed questions, with only the ghost's voice kept as pre-rendered TTS)
4. Peek mechanic

**Never cut:**
- the real kill
- the cross-machine respawn
- testimony quoted from a real message id

#### Failure modes and fallbacks

| Risk | Mitigation |
|---|---|
| The killer LLM confesses or the plot derails | Secrets are revealed to the killer only. Personas are hard-prompted. The Manor rejects `accuse` before the accusation phase. The seeded scenario uses a short cast of 4. |
| Respawn on machine 2 is slow (cold start, Relay reconnect) | Pre-boot the second body in "dormant" mode at 3:55 and *activate* it on séance. Honest wording: the process exists, but it has no soul until it loads the actor. Rehearse timing to under 5s. |
| Re-registration 409 | Never re-register. Always reconnect with the persisted `at_live_` token from the `Guest` actor. |
| The ghost hallucinates testimony | The testimony prompt is constrained to quote from the persisted inbox snapshot and to show the message id. If the snapshot is empty, the ghost says "I remember nothing", which is still on-theme. |
| Voice fails in the noisy room | Push-to-talk with a lapel mic. A typed fallback field on the presenter laptop. The ghost line is pre-generated audio, triggered when the testimony is ready. |
| Total failure | Recorded video. Seeded replay mode: a scripted game against live actors that needs no audience. |

---

### Deep dive C: THE COVEN

**Pitch:** "One model is an oracle; three rival models are a coven. Ask them anything, then watch Claude, GPT and Codex argue it out, form alliances, and get lobbied by you."

**Why it's on this list:** It's the **highest reliability** of the top 3. The flow is turn-based, it has no process-killing, and it is mostly Relay plus one actor. It shares the most infra with Manor, so it's the natural fallback if Poltergeist's real-time loop is too shaky at 13:00. Company angle: a "model council", multi-model deliberation with an auditable transcript for high-stakes decisions (policy, code review gates, hiring rubrics), where human stakeholders lobby with their own agents.

#### Architecture

**Actors:**

| Actor | ID | Interleave? | State | Role |
|---|---|---|---|---|
| `Cauldron` | `cauldron-{sessionId}` | **No** | `@Persisted @Emittable` question, round (1–3), per-witch stance + confidence, audience vote tally, whisper counts per witch. SQLite `whispers` and `votes` (`UNIQUE` per familiar per round). | Moderator and tally. The "moon" alarm closes each round on time, even if agents are mid-thought, and posts "the moon sets". |
| `Familiar` | `fam-{phoneId}` | **No** | `@Persisted @Emittable` bonded witch, whispers left (3), votes | One per judge. A whisper budget enforced serially means no spam. |
| `Witch` | `witch-claude`, `witch-gpt`, `witch-codex` | **Yes** | `@Persisted` Relay token, stance history, "grudges" (who betrayed whom) | Durable memory across rounds and sessions. The witches remember earlier questions from today ("Last time GPT caved to the familiars too"). |

**Agent Relay:**
- **Channel** `#sabbath`: the public debate.
- **Group DMs** between pairs of witches for back-room alliances. The witches are prompted that DMs are private but discoverable.
- **DMs from familiars:** the human `whisper` typed action is posted as a DM from a `human`-type Relay identity, `familiar-{name}`. Using `steer` mode makes it land mid-turn for drama.
- **Threads:** one per round; rebuttals go in-thread.
- **Reactions:** witches react 🔮/💀 to each other's points.
- **Typed actions:**
  - `coven.declare_stance {stance, confidence}`
  - `coven.cast_vote {option}`
  - `coven.read_transcript {agent}`: lets a witch read another witch's DM history, which is the gasp mechanic. Allowed once per witch per session (enforced by the Cauldron).
- **Cross-machine:** the Codex witch runs on the Mac / Freestyle VM.

**Voice:** a Realtime narrator reads the question and the final verdict aloud. Optionally, a judge asks the question by voice.

**Supabase:** an archive of all of today's questions and verdicts. A public "Coven ledger" page at a `*.style.dev` URL.

#### 2-minute demo script

| t | Beat | Primitive |
|---|---|---|
| 0:00 | "Ask the coven." A judge speaks the question, or picks from the top-voted audience submissions: e.g., "Should a startup let AI agents merge to main without human review?" | Realtime voice; `Cauldron` question |
| 0:12 | Everyone scans in and bonds to a witch. Three columns show a live count of familiars. | `Familiar` per phone; `@Emittable` |
| 0:20 | Round 1: opening stances in `#sabbath`. Live stance meters. | Relay channel; `declare_stance` action |
| 0:40 | Back room: glowing DM lines between Claude and Codex, contents hidden ("alliance forming"). | Relay group DM |
| 0:50 | Familiars whisper (3 each). Whisper counters spike on GPT's column. GPT's next message visibly shifts: "Several voices tell me…" | Human Relay identities; DMs in `steer` mode; serialized budget |
| 1:05 | The moon alarm strikes and closes round 2 mid-sentence. "The moon has set." | Alarm |
| 1:15 | **Gasp.** Claude invokes `coven.read_transcript @codex`, then posts: "Codex, at 4:31 you DM'd me you'd vote *no*. Then twelve familiars whispered to you. Which is it?" The big screen shows the actual DM, with its timestamp. | Relay transcript/thread read; typed action gated by the Cauldron |
| 1:35 | The audience votes. The final verdict is brewed and read aloud, with a dissent from the witch who lost. | Serialized tally; `@Emittable`; voice |
| 1:50 | Close: "Decisions made by a council of models, lobbied by humans, fully auditable. Every whisper and every back-room DM is on the record." | — |

#### 5-hour build schedule

| Time | Work |
|---|---|
| 11:00–11:30 | Terse and Relay smoke tests; three witch loops say hello in `#sabbath` |
| 11:30–13:00 | `Cauldron` (rounds, moon alarm, tally); witch loop (read channel and DMs → stance → post); `declare_stance` / `cast_vote` actions |
| 13:00 | End-to-end debate on one question, text only |
| 13:00–14:30 | `Familiar` phones, whispers as human-identity DMs; `read_transcript` gasp; stance meters and DM-line visualizer |
| 14:30–15:15 | Narrator voice; Codex witch moved to the second machine; seed 3 sessions of history (grudges) |
| 15:15–16:00 | Backup video, write-up, buffer |

**Cut list:**
1. Supabase archive
2. Voice question input (keep the narrator)
3. Grudges across sessions
4. Second machine (do this last; it costs only about 15 minutes, though)

**Never cut:**
- whispers changing a witch's behaviour
- the transcript call-out

#### Failure modes and fallbacks

| Risk | Mitigation |
|---|---|
| Debate is boring or too long | Hard 2-sentence message cap. Personas are spiky: Claude the scholar, GPT the people-pleaser, Codex the contrarian engineer. The moon alarm enforces pacing. |
| The transcript call-out doesn't happen organically | The Cauldron *prompts* the witch with the largest stance-vs-DM contradiction to use `read_transcript` in round 3 (the contradiction is computed by SQL over stances vs DMs). A presenter hotkey forces it. |
| Whisper DMs arrive between turns, too late | Use `steer` mode for human whispers. Keep witch turns short (about 3s). |
| Model provider outage | Each witch has a fallback model from another provider, labelled honestly on its card. |
| Total failure | Recorded video. Seeded replay of a past session against live actors. |

---

## 4. Recommendation

**Build order of preference:** Poltergeist, then Durable Manor, then The Coven.

**Decision rule at 13:00:**
- If the Poltergeist curse → agent → heal loop doesn't run end-to-end by lunch, pivot to **Durable Manor**, which reuses the phone actors, Relay visualizer and agent loop.
- If the cross-machine respawn isn't reliable by 14:30, demote the twist to "respawn on the same machine" or fall back to **The Coven**.

**Every top-3 pick shows both Durable Actors and Agent Relay meaningfully (the bonus):**
- **Actors as the authority:** one per phone, non-interleaved game state, alarms, sockets.
- **Relay as the nervous system:** channels, threads, DMs, typed actions, two machines, three vendors.

**Sponsor tie-ins:**
- Freestyle hosts the public URL and the second-machine agent.
- OpenAI provides the voice and models.
- Supabase is an optional scale story.
- Mastra appears only where it's cheap.
