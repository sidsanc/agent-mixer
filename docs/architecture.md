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
5. Each phone shows the match card; `/api/intro/:id/decide` records Connect or Pass in `Intro`. On mutual Connect, `Intro` sets `meeting` exactly once. A double tap is a no-op.
6. After connect: human chat (`/api/intro/:id/chat`, stored in `Intro`) and Meet now (`/api/intro/:id/meet`).

Private intent and contact never enter a Relay message or any web response before mutual Connect.

## Store interface (server side)

`apps/server/src/store/types.ts` defines `Store`. There are two implementations:

- `memory.ts`: in-process. It is the dev default and the demo fallback if Terse fails.
- `terse.ts`: it calls the generated Terse client.

`STORE=memory|terse` picks one. Both push live updates through `onChange` so the server can also stream them.

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
  meet(id: string, attendeeId: string, action: "request" | "accept"): Promise<IntroState>
  onChange(fn: (push: ServerPush) => void): void
}
```

## Server API (`:3001`)

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/signup` | `{name, role, goal, bio?}` | `{attendeeId}` |
| GET | `/api/attendee/:id` | | `AttendeeView` |
| GET | `/api/event` | | `EventView` |
| GET | `/api/intro/:id?as=<attendeeId>` | | `IntroState`. Contacts are hidden unless connected. |
| POST | `/api/intro/:id/decide` | `{attendeeId, choice}` | `IntroState` |
| POST | `/api/intro/:id/chat` | `{attendeeId, text}` | `IntroState` |
| POST | `/api/intro/:id/meet` | `{attendeeId, action}` | `IntroState` |
| POST | `/api/conversation/:id/end` | `{attendeeId}` | `{ok}` |
| GET | `/api/stream?attendee=<id>` | | Server-sent events of `ServerPush`: that attendee, the event, and that attendee's intros |
| GET | `/api/ws/:kind/:id` | | Terse WebSocket grant `{websocketUrl}` when `STORE=terse` (optional, live actor sockets) |

The web app uses `/api/stream` (SSE) for live updates in both store modes. Actor sockets are an upgrade, not a dependency.

## Env (`.env` at repo root, never committed)

`OPENAI_API_KEY` or `ANTHROPIC_API_KEY` (LLM; without one, agents use a scripted fallback so the flow still runs), `RELAY_WORKSPACE_KEY` (`rk_live_...`), `TERSE_ACTOR_URL` + `TERSE_API_KEY` (hosted; local dev uses `http://127.0.0.1:7100`), `STORE`, `DEMO_MODE=1`, `PORT=3001`.

## Seed

`apps/server/seed/profiles.json` (`Profile[]`) is loaded on start and joined to the event. When Julius commits `docs/seed/profiles.json`, the server prefers it.
