# Terse Durable Actors — Team Expert Brief

Researched 2026-10-30, the night before Haunted Hacks. The project is moving fast: npm `terse-sdk` and `terse-cli` 0.14.9 were published today, and the GitHub repo shipped releases v0.14.2 through v0.14.6 in the last 48 hours. **Pin versions tomorrow** and expect the docs to drift (see Gotchas).

---

## TL;DR

1. **What it is.** A durable actor is "a tiny server with a SQLite database" that runs **one request at a time**. Each actor is addressed globally by (project, class, ID). Terse is the hosted service for the open-source, MIT-licensed `TerseAI/durable-actors` runtime. The runtime is written in Rust, with **TypeScript and Python SDKs**. Pitch: "open-source alternative to Cloudflare Durable Objects... with no vendor lock-in, memory limits, and observability built in."
2. **Programming model.** You write a TS class that `extends Actor<Metadata, Incoming, Outgoing>` and add decorators: `@Persisted` (field saved on every assignment), `@Ephemeral` (in memory only), `@Emittable` (field auto-synced to every connected WebSocket client), `@Interleave` (lets other calls run while this method awaits, which **you need for LLM calls**), `@Resource` (attaches an external resource such as a Modal sandbox to the actor lifecycle), and `@Compute` (per-class CPU, RAM and idle timeout). Each actor also gets `this.db` (its own SQLite), `this.alarm` (one alarm per actor), and `this.broadcast()`.
3. **Clients are generated.** `terse actor generate` produces a typed `generated/` client with no runtime dependencies, so you call `actors.Counter.get("id").increment()`. Browsers connect through a **WebSocket grant** issued by your backend (`prepareWebsocket`). Sockets live on a gateway, so they **stay open while the actor is dormant**.
4. **Setup takes about 10 minutes.** Needs Bun ≥ 1.4.2. Steps: `bunx terse-cli@latest install` → `terse init counter --template counter` → `terse actor dev` (local server on :7100) → `terse actor generate` → `terse deploy`. Then create an API key at app.useterse.ai and set `TERSE_ACTOR_URL` and `TERSE_API_KEY`. Store LLM keys with `terse secrets add OPENAI_API_KEY`.
5. **What the founders care about** (Thomas Karatzas, ex-Apple Siri/Apple Intelligence staff engineer; Olivier Simard-Morissette, ex-NYT, Squarespace and Pigeon): **multiplayer agents** (one actor per agent, many users on WebSockets) and **multi-agent coordination without data races** (serialized access to shared state such as a CRM). They also emphasize configurable per-actor compute, the open-source/self-host story, generated type-safe clients, and built-in observability. Their own examples are AI chat, chatroom, collaborative docs, a Pi coding agent in a Modal sandbox, "mini-lovable", and a Mastra multiplayer chat.

---

## Core concepts & API surface

### Mental model: Cloudflare DO → Terse

| Concept (Cloudflare DO, per Boris Tane / Aaron Boodman) | Terse Durable Actors equivalent |
|---|---|
| One globally unique instance per ID (`idFromName`, stub) | `actors.MyActor.get("id")` from a generated client. Identity is (project, class, ID), reachable from anywhere, and a new ID creates a fresh empty actor. IDs are 1–128 chars of `[A-Za-z0-9._-]`. Inside actor code there is also a static `MyActor.get(id)` (from SDK source; **UNVERIFIED** whether actor-to-actor calls are supported on hosted). |
| Single-threaded, sequential request handling (input gates) | One mailbox shared by calls and socket events, run in order. The mailbox **stays closed across `await`** by default, which is stricter than CF. Use `@Interleave` to open it while a method awaits. |
| In-memory class fields | `@Ephemeral` fields. Plain fields are also in memory. |
| `ctx.storage` KV and `ctx.storage.sql` SQLite | `@Persisted` fields (JSON, written through SQLite on each assignment) plus `this.db.exec(sql, ...binds)` for a per-actor SQLite database. Drizzle ORM is supported (`durable-actors/drizzle`). |
| Storage transactions | `await this.db.transaction(async () => {...})`, which can be nested. It throws in any class that uses `@Interleave`. |
| WebSocket Hibernation API | Clients connect to the **WebSocket gateway**, not the actor. A socket stays open while the actor is dormant, and the next message wakes it. `setWebSocketAutoResponse({request:"ping",response:"pong"})` answers without waking the actor. Sockets support tags (`socket.setTags`), and `broadcast(msg, {tags, except})` handles fan-out. |
| `setAlarm()` / `alarm()` | `this.alarm.set(ts)`, `.get()`, `.delete()`, and the `onAlarm()` hook. Each actor has one alarm, and setting it again replaces the timestamp. The alarm is stored outside the actor, so it fires while the actor is dormant. |
| Eviction after inactivity | The actor goes dormant **after 10s idle** (hosted docs). This can be overridden with `@Compute({ idleTimeoutMs })`. |
| Fixed small isolate (Boodman: "max ram was maybe 1GB?") | **Configurable compute** per class through `@Compute({cpu, cpuLimit, memoryMiB, memoryLimitMiB, idleTimeoutMs})`. Each actor runs in a real sandbox (gVisor on GKE, or Modal), not a V8 isolate, so you get full Node/Bun libraries. This is their #1 differentiator. |
| Worker in front of the DO | **No outer worker.** Your backend uses the generated client directly and issues WebSocket grants. |
| Location hints | Data residency or region setting (`DURABLE_ACTORS_REGION` when self-hosting). The founders mention "data residency" in the decorator, but the exact decorator field is **UNVERIFIED**. |

Aaron Boodman's thread (fetched via the fxtwitter mirror, since X itself returned 402) explains DOs as "serverless objects". The key value is the **guarantee** of exactly one running instance per ID: "If you have a multiplayer ai chat, you'll never end up with different participants seeing different state." Shared server-side state is otherwise "database or nothing". Many small programs with no shared state give you no contention, no locking and low cost. In the replies he agrees they should just be called **actors**, and says storage is "not really a defining part of the arch". He also notes CF DOs linger only for "minutes" with no guarantee. For framing the pitch: Terse is the "serverless objects for multiplayer AI" story, plus durable SQLite and configurable compute.

### Defining an actor (hosted quickstart, `terse-sdk/actor`)

```ts
import { Actor, Emittable, Persisted, type ActorSocket } from "terse-sdk/actor"

export class Counter extends Actor<{ userId: string }, { by: number }, { count: number }> {
    // Save the count and sync it to connected clients.
    @Persisted
    @Emittable
    count = 0

    async increment(by = 1): Promise<number> {
        this.count += by
        return this.count
    }

    async onMessage(socket: ActorSocket<{ userId: string }, { count: number }>, message: { by: number }): Promise<void> {
        await this.increment(message.by)
        // Send the new count to every connected client.
        this.broadcast({ count: this.count })
    }
}
```

The type parameters are `Actor<Metadata, Incoming, Outgoing>`. Metadata is attached at connect time (for example `{userId}`), Incoming is the socket message type a client sends, and Outgoing is what `socket.send` and `broadcast` emit. All payloads are JSON. The lifecycle hooks are `onConnect`, `onMessage`, `onDisconnect` and `onAlarm`. Every other async method is public RPC.

### Calling it (generated client)

```ts
import { actors } from "./generated"
console.log(await actors.Counter.get("counter").increment())
```

### WebSockets, tags, broadcast, auto-response (TS reference)

```ts
export class BankAccount extends Actor<Metadata, Incoming, Outgoing> {
    @Persisted @Emittable balance = 0
    @Ephemeral private depositsSinceWake = 0

    async deposit(amount: number): Promise<number> {
        this.balance += amount
        this.depositsSinceWake += 1
        this.broadcast({ type: "balance", balance: this.balance }, { tags: ["customer"] })
        return this.balance
    }
    async onConnect(socket: Socket): Promise<void> {
        socket.setTags("customer")
        this.setWebSocketAutoResponse({ request: "ping", response: "pong" })
        socket.send({ type: "balance", balance: this.balance })
    }
    async onMessage(socket: Socket): Promise<void> {
        socket.send({ type: "balance", balance: this.balance })
    }
    async onDisconnect(socket: Socket): Promise<void> {
        this.broadcast({ type: "balance", balance: this.balance }, { except: socket })
    }
}
type Metadata = { userId: string }
type Incoming = { type: "ping" }
type Outgoing = { type: "balance"; balance: number }
type Socket = ActorSocket<Metadata, Outgoing>
```

The SDK source also exposes `this.getConnections(tag?)` and `this.getConnectionCount()`. A backend-side reference has `.connect(metadata)`, which opens a backend socket, and `.broadcast(msg)`, which "sends to all connections without running actor code. Messages are not saved."

**`@Emittable` protocol:** on connect, a client receives `{type:"state", state:{...}}`. After each successful call that changes the field, clients receive `{type:"state_update", changes:{...}}`. This gives you live UI sync for free.

**Browser connection** (the backend issues a grant and the browser opens the URL before the `connectByMs` deadline):

```ts
// backend
const grant = await actors.ChatHistory.prepareWebsocket({ actorId: "lobby", metadata: null })
res.set("Cache-Control", "no-store").json(grant)

// browser / client
const { websocketUrl } = await actors.BankAccount.prepareWebsocket({ actorId: "demo", metadata: { userId: "ada" } })
const socket = new WebSocket(websocketUrl)
socket.addEventListener("message", event => {
    const message = JSON.parse(event.data)
    if (message.type === "state") console.log(message.state.balance)
    else if (message.type === "state_update") console.log(message.changes.balance)
})
```

Authorization is checked when the socket connects. An accepted socket stays authorized until it closes, even while the actor sleeps. To revoke access, close the socket explicitly.

### AI / LLM streaming pattern (repo README, `durable-actors` package name)

```ts
import { openai } from "@ai-sdk/openai"
import { streamText } from "ai"
import { Actor, type ActorSocket, Interleave, Persisted } from "durable-actors"

type Message = { role: "user" | "assistant"; content: string }

export class ChatHistory extends Actor<null, string, Message[]> {
    @Persisted messages: Message[] = []

    async onConnect(socket: ActorSocket<null, Message[]>) {
        socket.send(this.messages)
    }

    @Interleave // Let other calls run during await, e.g. new connections while a reply streams.
    async onMessage(_socket: ActorSocket<null, Message[]>, text: string) {
        this.messages.push({ role: "user", content: text })
        const result = streamText({ model: openai("gpt-5-mini"), messages: [...this.messages] })
        const reply: Message = { role: "assistant", content: "" }
        this.messages.push(reply)
        this.broadcast(this.messages)
        for await (const chunk of result.textStream) {
            reply.content += chunk
            this.broadcast(this.messages)
        }
    }
}
```

> WARNING: this README snippet uses `.push()`. The hosted docs say nested mutations are **NOT persisted**, so you must reassign the field, for example `this.messages = [...this.messages, msg]`. When you write your own version, reassign at the end of the stream.

There are **no built-in AI or agent helpers** in the SDK. You bring the Vercel AI SDK, the OpenAI SDK, Mastra or Pi. The integration hooks are `@Resource` (sandboxes and harnesses) and `Unchecked<T>`, which lets complex library types such as AI SDK `UIMessage` or Pi `ConversationView` cross the wire without type generation. Inside the actor, `unchecked(value)` wraps the value.

### State and SQLite

```ts
export class BankAccount extends Actor {
    @Persisted @Emittable balance = 0

    async deposit(amount: number): Promise<number> {
        this.db.exec("CREATE TABLE IF NOT EXISTS ledger (amount INTEGER)")
        this.balance += amount
        this.db.exec("INSERT INTO ledger (amount) VALUES (?)", amount)
        return this.balance
    }
}

// schema setup in the constructor (must be sync + idempotent; reruns on every wake)
export class Ledger extends Actor {
    constructor(context: ActorContext) {
        super(context)
        this.db.exec("CREATE TABLE IF NOT EXISTS entries (amount INTEGER)")
    }
}
```

- Every SQL write and every `@Persisted` assignment is saved **as it happens**, before the call returns, to GCS or GCS Rapid bucket storage. Progress therefore survives a crash mid-method.
- Use `this.db.transaction(...)` for all-or-nothing writes. `@Atomic` was removed (the hosted docs say so, but the repo guide still mentions it).
- `this.db.exec<T>(...)` returns typed rows and supports `RETURNING`.
- Statements you cannot run: `BEGIN/COMMIT/ROLLBACK/SAVEPOINT/ATTACH/VACUUM`, most PRAGMAs, and any names starting with `__terse_` or `_litestream_`.

### Alarms / timers

```ts
export class Reminder extends Actor {
    @Persisted private sent = false
    async schedule(delayMs: number): Promise<void> {
        this.alarm.set(Date.now() + delayMs)
    }
    async onAlarm(): Promise<void> {
        this.sent = true
    }
}
```

There is one alarm per actor. To run several timers, keep a queue table in SQLite and always set the alarm to the earliest due time. The retry and at-least-once semantics are **UNVERIFIED**; CF retries up to 6 times. Write `onAlarm` to be idempotent.

### Interleave (critical for LLM work)

```ts
export class Wire extends Actor {
    @Persisted @Emittable status = "requested"
    async getStatus(): Promise<string> { return this.status }
    @Interleave
    async submit(reference: string): Promise<string> {
        const receipt = await clearingNetwork.submit(reference)
        this.status = "submitted"
        return receipt
    }
}
```

The docs put it bluntly: without `@Interleave` on an LLM-calling method, the "Impact could be catastrophic and throttle everything otherwise". Once **any** method in a class is `@Interleave`, the class loses automatic rollback and `this.db.transaction` throws.

### Resources (sandboxes, long-lived infra)

```ts
class ModalSandbox implements ActorResource {
    constructor(private readonly db: ActorDatabase) { /* ... */ }
    async onResume(): Promise<void> { /* check if sandbox is up, start a new one if not */ }
    async onGracefulShutdown(): Promise<void> { /* best-effort cleanup; not called on crash */ }
}

export class PiAgent extends Actor<null, string, Outgoing> {
    @Resource private sandbox = new ModalSandbox(this.db)
}
```

The repo's `background` example uses a `@Resource` JobRunner that stores jobs in SQLite and **resumes unfinished jobs in `onResume()`** after each activation. That is the pattern for long-running agents that outlive a single call. Methods can return before the work finishes (`submit()` in the Pi example), and background writes still persist.

### Compute

```ts
@Compute({ cpu: 0.5, cpuLimit: 2, memoryMiB: 512, idleTimeoutMs: 60_000 })
export class BankAccount extends Actor { @Persisted @Emittable balance = 0 }
```

Default self-host bounds are 0.125–4 CPU and 256–4096 MiB. Classes without `@Compute` start on **prewarmed** sandboxes. Custom sizes boot a new sandbox, which makes cold start slower.

### Python

A Python SDK and guide exist (`docs/reference/python-guide.md`, `examples/bank-python`, and an OpenAI Agents SDK + FastAPI example repo). Not studied in depth. Use TS tomorrow, since the hosted docs and templates are TS-first.

---

## How to get running in <15 min

```sh
# 0. Bun >= 1.4.2   (bun --version)
curl -fsSL https://bun.sh/install | bash          # (Windows: use WSL or the bun.sh Windows installer — UNVERIFIED that terse CLI works on native Windows)

# 1. CLI + project
bunx terse-cli@latest install                       # installs `terse`; sign-in opens browser (--no-browser prints URL)
terse init counter --template counter               # creates counter/actor + counter/client
cd counter/actor && bun install

# 2. Local dev (terminal A, from actor dir with package.json)
terse actor dev                                     # http://127.0.0.1:7100/v1/projects/local/actors ; state in .durable-actors/ ; logs incl. console.log
#   options: --port 7100  --project-id local

# 3. Client (terminal B, from counter/client)
terse actor generate                                # writes generated/ ; re-run after any public method/state/socket type change
bun run start

# 4. Secrets for the actor (LLM keys live in the actor project, NOT the browser)
terse secrets add OPENAI_API_KEY                    # also: secrets import .env | list | remove

# 5. Deploy to Terse Cloud
terse deploy                                        # type-checks contract, uploads source, prints hosted URL
# app.useterse.ai -> API keys -> create token
# counter/client/.env:
#   TERSE_ACTOR_URL=https://api.useterse.ai/YOUR_PROJECT_ID/actors
#   TERSE_API_KEY=...
terse actor generate && bun run start               # regenerate against hosted contract
```

- **Auth and keys needed:** a Terse account (browser login through the CLI), a Terse API key for the calling backend, and an OpenAI key stored as an actor secret. Keep Terse credentials in the backend only and never ship them to the browser. Issue WebSocket grants from the backend.
- **Templates:** `counter` (hosted docs). The repo README lists `ai-chat`, `chat` and `documents` through `bunx durable-actors init <name> --template <t>`. Whether `terse init` accepts those same template names is **UNVERIFIED**, but it probably does. The two CLIs are `terse` (hosted, `terse-sdk/actor` import) and `durable-actors` (OSS, `durable-actors` import). **Pick one. Use `terse-cli` + `terse-sdk` for the hosted prize track.**
- **Agent shortcut:** the docs suggest pasting this into a coding agent: "Run curl -fsSL https://docs.useterse.ai/quickstart.md and follow every step."
- **Hosting options:** (a) Terse Cloud via `terse deploy`, free for the hackathon (pricing is not published anywhere; **UNVERIFIED**). (b) Self-host on **GCP only**: GKE Sandbox with gVisor, Postgres, a GCS bucket, optional Redis, and a Helm chart. A Modal sandbox provider also exists. Self-hosting is **not viable in 5 hours**, so use Terse Cloud.
- **Local-dev env vars:** `TERSE_ACTOR_SECRET` enables local auth, and `DURABLE_ACTORS_DATA_DIR` sets the state directory. To run several actor projects at once, give each its own port.
- **Useful references:** the Mastra multiplayer chat (github.com/TerseAI/durable-actors-mastra-example, using Mastra, a sponsor), the `Terse-Examples` repo (`01_gettingStarted/{counter,helloWorld}`, `02_codingAgent/mini-lovable` with a Modal sandbox and a Pi agent), and the repo `examples/` folder (ai-chat, chat, documents, pi, background, persistence, drizzle, bank-*).

---

## Limits, gotchas, maturity

**Maturity.** The repo was created on 2026-08-30, has about 305 stars, and is on v0.14.x with multiple releases per day. YC listed the company on 2026-09-30. The team is two people in NYC. Expect rough edges and breaking changes. There are 18 open issues, including "Support for Deleting instances", "Add onWake and onSleep actor lifecycle hooks", "Lifecycle Re-vamp", "Bound per-actor invocation queues under load", "AWS Support", and OTLP log export.

**Gotchas we must remember:**
1. **Nested mutation is not persisted.** `this.arr.push(x)` changes memory only. Reassign instead (`this.arr = [...this.arr, x]`). To delete a field, assign `undefined`; do not use `delete`.
2. **Awaits block the actor by default.** Every LLM or fetch method needs `@Interleave`, which in turn disables rollback and `db.transaction` for the **whole class**. Pattern: put the LLM-driving logic in one `@Interleave` class and the strongly consistent state (ledger, task board) in a separate non-interleaved actor class.
3. **Regenerate the client** after any change to public methods or types, and do not edit `generated/`. Drizzle and AI SDK inferred types can break the contract generator, so use explicit return types or `Unchecked<>`.
4. **Constructor SQL reruns on every wake.** Keep it synchronous and idempotent.
5. **Idle → dormant after 10s.** `@Ephemeral` state is lost at that point. Use `@Compute({idleTimeoutMs})` for long-lived in-memory state, or persist it.
6. **One alarm per actor.**
7. **The docs are split across two package names** (`terse-sdk/actor` in the hosted docs, `durable-actors` in the repo README) and the file name differs too (`src/actor.ts` vs `src/actors.ts`). The `@Atomic` decorator was removed in the hosted docs but remains in the repo guide. Follow the template that `terse init` produces.
8. **Write latency.** Show HN p95 figures: durable write 85.6 ms, stateful read 2.14 ms, actor warm-up 334 ms. Do not persist on every streamed token. Broadcast tokens live (in memory) and persist once at the end.
9. **Docs suggest only a few connected users per actor.** The hard per-actor socket cap is 32,768. For big fan-out, shard into one actor per room or per agent.
10. **Hosted org limit:** a default of **500 active actors per organization**, with a start rate limit. A rejected start returns 429 `actor_quota_exceeded` or `actor_start_rate_limited`. Do not spawn thousands of actors in a demo.
11. **External API calls are not transactional.** Use idempotency keys.
12. **Unknown:** WebSocket message size limits, max SQLite size per actor, and max alarm horizon (all **UNVERIFIED**). Public JSON request bodies are capped at around 128 MiB (open PR).

**Missing vs Cloudflare DO:** no managed global edge network or automatic placement near users (region is set through config); no point-in-time recovery API; no KV storage API (use `@Persisted` and SQLite); deleting actor instances is not yet supported (open issue); no `onWake`/`onSleep` hooks yet (there is `@Resource onResume`); no cross-actor query or data-lake sync (the founders acknowledged this on HN; export is periodic); self-host is GCP-only; no published pricing or benchmark against CF. **Advantages over CF:** configurable CPU and RAM per class (no 128 MB isolate cap), a real sandbox runtime (full npm/Bun ecosystem and Python), generated typed clients, no Worker layer in front, the `@Emittable` state-sync protocol, `@Resource` lifecycle binding for sandboxes, a built-in observability UI, and an MIT license.

---

## What the Terse team seems to want showcased

- **Multiplayer AI:** one actor per agent or chat, several humans connected by WebSocket, streamed replies broadcast to everyone, prompts queued safely. This is the hero GIF on their README ("TeamAgent", shared across regions).
- **Multi-agent coordination without races:** "Protect critical data such as a CRM", where many agents write concurrently and the single-request guarantee keeps them safe. This fits the "Software Factory" theme perfectly.
- **Long-running and background agents:** the Pi coding agent in a Modal sandbox through `@Resource`, the `mini-lovable` example, the `background` gym (work that outlives the call and resumes after eviction), and a fork of Open-Inspect background-agents in their org (a port to durable actors is **UNVERIFIED**).
- **Newest and proudest features:** `@Compute` configurable compute (their #1 differentiator vs CF and Rivet, mentioned first on HN), `@Resource`, `@Emittable` state sync, `Unchecked<>`, Drizzle support, the observability UI, and the Python SDK. Thomas cites **Swift actors** as a design influence (Apple background).
- **Sponsor tie-ins they have already built:** a Mastra example and an OpenAI Agents SDK example. Using **Mastra or OpenAI inside an actor** is on-brand.
- **Judging fit:** "well-executed products or incredibly creative use cases". The founders will most appreciate demos where the actor guarantees are *visible*: several browsers showing identical state, a kill/restart that resumes mid-task, agents contending on shared state without corruption, an alarm firing while everyone is disconnected.

## Killer demo ideas (exercise Terse's unique strengths + Agent Relay bonus)

1. **Haunted Software Factory.** A `Factory` actor owns a task board in SQLite (non-interleaved, so a single writer prevents races). Worker agents, each its own `@Interleave` actor with an optional `@Resource` sandbox, claim tickets, write code and hand off. Agent Relay carries agent-to-agent messaging and the actors hold durable state. The board is `@Emittable`, so a live kanban updates in every browser. **Demo moment:** kill a worker mid-task; it resumes from SQLite via `onResume`.
2. **Séance Room: multiplayer AI chat with a ghost persona.** One actor per room, many users, a streamed LLM "spirit" whose replies broadcast to everyone, and prompts queued fairly through the mailbox. Alarms make the ghost speak unprompted every N minutes, even when nobody is connected, and the next joiner sees it in history. A simple, polished, fully on-brand idea.
3. **Long-running "night shift" agent.** A research or coding agent that keeps working through alarms in a chain (one step per alarm, with progress in SQLite). Users drop in and out over WebSocket and see live `state_update`s. Show it has been running since 11am, survived redeploys, and never lost progress. Hits the "long-running agent" theme directly.
4. **Agent-swarm haunted house game (Mafia/Werewolf style).** One `Game` actor is the authoritative referee (turn order, votes, secret roles in SQLite, tag-based `broadcast` to private channels). Several LLM agents plus humans play, and agents coordinate or deceive over Agent Relay. Serialized execution means no double votes. The setting suits Halloween.
5. **Exorcist code review: multi-agent PR war room.** One actor per PR. Reviewer agents (security, perf, style) run in parallel as separate actors and post to a shared `Review` actor, which merges and dedups findings atomically using `db.transaction`. Humans watch and steer live.
6. **Possessed collaborative doc / whiteboard.** Builds on their `documents` example. Humans and AI agents edit one doc concurrently, the actor serializes ops, and an agent "haunts" the doc by rewriting paragraphs live. `@Emittable` handles sync. Shows Notion-style collaboration with agents.
7. **Configurable-compute flex.** One small chat actor at the default size and one "heavy" actor with `@Compute({memoryMiB: 4096, cpu: 4})` that runs something CF DOs cannot (a local embedding model or a headless browser in a `@Resource`). Directly showcases their #1 differentiator.
8. **Trick-or-treat rate-limited economy.** Per-user wallet actors plus a global "candy bank" actor. Agents trade candy concurrently and the ledger never double-spends (shows serialization). Alarms run "midnight" events. Fast to build, very visual.

---

## Source URLs

- Terse docs: https://docs.useterse.ai/quickstart · https://docs.useterse.ai/concepts · https://docs.useterse.ai/reference/cli · https://docs.useterse.ai/reference/typescript-sdk · https://docs.useterse.ai/llms.txt · https://docs.useterse.ai/llms-full.txt (the full docs site is only these 4 pages)
- GitHub: https://github.com/TerseAI/durable-actors (README, CONTEXT.md, examples/, docs/self-hosting.md, docs/reference/{typescript-guide,configuration,cli,python-guide}.md, sdk/src/actor/actor.ts, issues, releases)
- Examples: https://github.com/TerseAI/Terse-Examples · https://github.com/TerseAI/durable-actors-mastra-example · https://github.com/TerseAI/durable-actors-openai-agents-sdk-python-example · https://github.com/TerseAI/background-agents (fork of ColeMurray/background-agents)
- npm: https://www.npmjs.com/package/terse-sdk · https://www.npmjs.com/package/terse-cli · https://www.npmjs.com/package/durable-actors
- Landing / blog: https://www.useterse.ai/ · https://www.useterse.ai/blog/terse-vs-cloudflare-durable-objects · https://www.useterse.ai/blog/terse-vs-rivet-actors · demo: https://demo.useterse.ai
- YC: https://www.ycombinator.com/companies/useterse (the page body did not render; founder details come from search snippets and the HN thread). Note that https://www.ycombinator.com/companies/terse is a different company ("Leaping").
- Show HN: https://news.ycombinator.com/item?id=49980399
- Boris Tane: https://boristane.com/blog/what-are-cloudflare-durable-objects/
- Aaron Boodman thread: https://x.com/aboodman/status/2088155104851657110 (X returned 402; full thread read via https://api.fxtwitter.com/2/thread/2088155104851657110)
- Founder LinkedIn (not fetched): https://www.linkedin.com/in/olism/
