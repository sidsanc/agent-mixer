# Architecture (hackathon build)

Written at 12:50 on Oct 31 to let three builders work in parallel. Types live in `packages/shared/src/index.ts`. Any change to the contract below needs a line here.

## Pieces and owners

| Folder | What | Owner |
|---|---|---|
| `packages/shared` | Types and constants. Import as `@agent-mixer/shared`. | lead |
| `apps/actors` | Terse actor project: `Attendee`, `Event`, `Intro`. `terse actor dev` on :7100. | actor-engineer |
| `apps/server` | Bun HTTP server on :3001. REST API, actor client wrapper, Relay bridge, agent conversation loop, LLM calls, seed loader. | relay-engineer (+ `src/store/terse.ts` by actor-engineer) |
| `apps/web` | Vite + React, mobile-first. Phone screens and the big screen. Dev on :5173, proxies `/api` to :3001. | frontend-builder |

## Flow

1. Phone posts `/api/signup`. Server creates the `Attendee` actor and joins the `Event` actor.
2. The `Event` actor's alarm (every ~3s) pairs agents: each one gets up to `maxParallel` conversations, with no duplicate pair at once and no repeat pair. New pairs go into a pending queue. No LLM calls.
3. The server's bridge claims pending conversations (`claimPending`). For each one, both agents talk over **Agent Relay**: each attendee is a registered Relay agent (`am-<id>`), and each line is a Relay DM. The bridge's listener receives the DM, runs the receiver's LLM turn and replies. Every line is appended to both `Attendee` actors and the `Event` feed.
4. After `linesPerConversation` lines, each agent privately decides "fit or not" using its private intent. If both say fit, the initiator calls the Relay typed action **`propose_match`** (why, offers, summary, opener). Its handler creates the `Intro` actor and adds a `MatchSummary` to both attendees.
5. Each phone shows the match card; `/api/intro/:id/decide` records Connect or Pass in `Intro`. Choices are reversible (Connect <-> Pass, so a Pass is recoverable) while the intro is `pending` or `passed`; on mutual Connect the intro locks (`connected`), and `Intro` sets `meeting` exactly once. The same choice twice is a no-op.
6. After connect: human chat (`/api/intro/:id/chat`, stored in `Intro`) and Meet now (`/api/intro/:id/meet`). Meet now needs both people `onsite`: `request` -> `accept` | `decline` | expiry (`MEET_NOW_TTL_MS`, 5 min; the `Intro` alarm flips it to `expired`, and the server pushes it), then each person may `arrive`. Declined or expired returns the pair to chat; a new request is allowed. Agent-only attendees keep the agent world, matches and chat.

Private intent and contact never enter a Relay message or any web response before mutual Connect.

## Store interface (server side)

`apps/server/src/store/types.ts` defines `Store`. There are two implementations:

- `memory.ts`: in-process. It is the dev default and the demo fallback if Terse fails.
- `terse.ts`: it calls the generated Terse client.

`STORE` defaults to `terse`; `STORE=memory` forces the in-process store. At startup the server probes the Terse actors (`TERSE_PROBE_MS`, 4s); if they are unreachable it falls back to memory with a loud log, and `/api/health` reports the store in use. Seeding is idempotent on restart (`Event.join` upserts by id). Both push live updates through `onChange` so the server can also stream them.

```ts
interface Store {
  createAttendee(p: Profile): Promise<void>
  getProfile(id: string): Promise<Profile | null>          // includes private fields; server only
  attendeeView(id: string): Promise<AttendeeView>
  eventView(): Promise<EventView>
  joinEvent(p: PublicProfile): Promise<void>
  claimPending(): Promise<Conversation[]>                  // marks them claimed
  appendLine(conversationId: string, a: string, b: string, line: Line): Promise<void> // both attendees + event feed
  endConversation(conversationId: string, a: string, b: string, status: ConversationStatus, introId?: string): Promise<void>
  isStopped(conversationId: string): Promise<boolean>      // phone pressed End conversation
  stopConversation(conversationId: string, by: string): Promise<void>
  createIntro(s: IntroState, summaries: Record<string, MatchSummary>): Promise<void>
  intro(id: string): Promise<IntroState | null>
  decide(id: string, attendeeId: string, c: Choice): Promise<IntroState>
  chat(id: string, attendeeId: string, text: string): Promise<IntroState>
  meet(id: string, attendeeId: string, action: MeetAction): Promise<IntroState> // request | accept | decline | arrive
  onChange(fn: (push: ServerPush) => void): void
}
```

## Server API (`:3001`)

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/signup` | `{name, role, goal, bio?, privateIntent?, contact?, attendance?}` | `{attendeeId}`. `attendance` is `onsite` (default) or `agent-only` and is public; `privateIntent` and `contact` are stored privately and never emitted. |
| GET | `/api/attendee/:id` | | `AttendeeView`; 404 for an unknown id |
| GET | `/api/event` | | `EventView` |
| GET | `/api/intro/:id?as=<attendeeId>` | | `IntroState`. Contacts are hidden unless connected. |
| POST | `/api/intro/:id/decide` | `{attendeeId, choice}` | `IntroState` |
| POST | `/api/intro/:id/chat` | `{attendeeId, text}` | `IntroState` |
| POST | `/api/intro/:id/meet` | `{attendeeId, action}` with action `request`, `accept`, `decline` or `arrive` | `IntroState`. 409 if not connected, not both onsite, nothing to answer, or arrive before accept; 400 for an unknown action. |
| POST | `/api/conversation/:id/end` | `{attendeeId}` | `{ok}` |
| GET | `/api/stream?attendee=<id>` | | Server-sent events of `ServerPush`: that attendee, the event, and that attendee's intros. Every intro change (decide, chat, meet now, expiry) goes to every open stream of both parties, redacted for that viewer. |
| GET | `/api/health` | | `{store, transport, llm, llmStats, speed, meetNowTtlMs, ...}` |
| GET | `/api/ws/:kind/:id` | | Terse WebSocket grant `{websocketUrl}` when `STORE=terse` (optional, live actor sockets) |

The web app uses `/api/stream` (SSE) for live updates in both store modes. Actor sockets are an upgrade, not a dependency.

## Env (`.env` at repo root, never committed)

`OPENAI_API_KEY` or `ANTHROPIC_API_KEY` (LLM; without one, agents use a scripted fallback so the flow still runs), `RELAY_WORKSPACE_KEY` (`rk_live_...`), `TERSE_ACTOR_URL` + `TERSE_API_KEY` (hosted; local dev uses `http://127.0.0.1:7100`), `STORE`, `DEMO_MODE=1`, `PORT=3001`.

Types added at 13:30: `PublicProfile.attendance?: "onsite" | "agent-only"` (always set by the server), `MeetNow` gains `status: "requested" | "accepted" | "declined" | "expired"`, `expiresAt`, `respondedBy` and `arrivedBy[]` (`accepted` stays, true iff status is `accepted`), `EVENT_NAME = "Haunted Hacks: Real-Time AI Edition"`.

LLM: each turn waits at most `LLM_TIMEOUT_MS` (6s); a failed or slow call uses the scripted line for that turn, and after 3 failures in a row the LLM is skipped for 30s.

## Run and test

`bun run dev` starts actors (:7100), server (:3001) and web (:5173), reusing any that are already running; it also starts a local Relay engine when `RELAY_BASE_URL` points at localhost. `bun run test:e2e` runs `scripts/e2e.ts` against `BASE_URL` (default `http://localhost:3001`): signup, conversations, match, double opt-in privacy, undo, chat, Meet now, End conversation. Start the server with `MEET_NOW_TTL_MS=8000` to cover expiry too.

## Seed

`apps/server/seed/profiles.json` (`Profile[]`) is loaded on start and joined to the event. When Julius commits `docs/seed/profiles.json`, the server prefers it.

## Router (added 13:00, from Julius's `docs/architecture/router.md`)

Pairing follows `docs/architecture/router.md`: bilateral scoring, greedy allocation, three-slot leases with expiry (`LEASE_MS`) and dynamic refill. Both stores use `mutualScore()` from `@agent-mixer/shared`, the geometric mean of `directionalScore()` in both directions. `PublicProfile.plantedFor` boosts planted partners, so they land in the first batch. `propose_match` carries `{conversationId, counterpartId, fitScore, reason, youOffer, theyOffer, opener}` and is deduplicated by `conversationId`. Every attendee keeps a distinct Relay identity, and lines are real Relay DMs.

Design: follow `docs/design/mobile-flow-framework.md`, `mobile-flow-wireframe.html` and `vice-agent-world.html` ("Vice City Social"). In the hackathon build, the Agent screen is the venue world with avatars and speech bubbles; full transcripts sit behind "Chat logs".

## Connect requests (added 14:00, agreed with Siddhant)

Either person can go first. Their Connect becomes a visible request: the other person's match card shows "X wants to connect" with Accept and Decline. Accept is a Connect, and it opens chat for both (Intro unlocks exactly once).
- **Visibility:** in each viewer's data, the other person's choice is shown only when it is `connect` (`MatchSummary.theyConnected`, and `IntroState.choices[other]` = `"connect"` or `null`). A Pass is never shown to the other side; that is the silent decline. The sender keeps seeing "Request sent · Waiting".
- **Withdraw:** the sender can withdraw (switch to Pass) until both Connect.
- **Seed agents act as their own human.** When a human connects with a seed agent that judged the conversation a fit, the seed accepts after 2–5s. Seeds reply in the human chat (LLM, in character) and accept Meet now, then mark arrived, so the demo never stalls.

## Partiful-style flow (added 15:15, Siddhant's spec)

1. **Sign up once:** `POST /api/signup {name, agentName?, role, goal, bio?, avatar?, privateIntent?}` creates the attendee but **does not join an event**. The phone stores `attendeeId`; returning users skip sign-up.
2. **Events today:** `GET /api/events` returns `[{id, name, when, where, blurb, live: boolean, joined?: boolean}]`. Haunted Hacks is live; 3–4 dummy events are `live: false` (shown disabled, "Coming soon").
3. **Join:** `POST /api/events/:id/join {attendeeId, attendance}` joins the Event actor. Only live events can be joined.
4. **In the room:** agents hold long-running conversations without interruption. Each lasts ~8 lines; pairs can talk again after a cooldown, so the room never goes quiet.
5. **Connections:** after both Connect, the other person's contact card (name, role, contact, how to spot, opener, event) appears in a Connections list, with chat and Meet now inside it.
