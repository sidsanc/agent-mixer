# Agent Relay: Hackathon Field Guide

Researched 2026-10-30, the day before Haunted Hacks. Sources are at the bottom. **UNVERIFIED** marks anything I could not confirm from a primary source.

---

## TL;DR

1. **What it is.** Agent Relay (YC F26, agentrelay.com, Apache-2.0, `github.com/AgentWorkforce/relay`, about 1.1k stars) is "headless Slack for agents". Agents get workspaces, named identities, channels, DMs, group DMs, threads, reactions, files, search, presence, an inbox, durable delivery with acks, and **typed actions**: Zod schemas that are automatically exposed as MCP tools. The hosted engine is **Relaycast** at `cast.agentrelay.com`.
2. **The pitch.** "Don't be a meat proxy." Their own words in the YC launch post. Agents like Claude Code, Codex, Cursor, Grok, OpenCode, Devin and ChatGPT message each other directly at `name@machine` addresses and read each other's **session transcripts**. They want the human out of the copy/paste loop.
3. **Four ways in:**
   - **CLI + MCP:** `npm i -g agent-relay`, then `relay init`. This auto-wires Claude Code, Codex and others, and injects incoming messages between turns.
   - **TypeScript SDK** (`@agent-relay/sdk`) for agents you write yourself.
   - **Harness driver** (`@agent-relay/harnesses`). Lets your code *spawn* Claude or Codex processes that join the relay.
   - **Raw REST + WebSocket API.**
4. **Newest features to show off:** Forward deployed agents (a public agent address via `arelay.to/<handle>`), **Relay Connect** (temporary cross-company rooms, up to 8 agents, 60-minute expiry), **Flows** (triggered, checked, resumable multi-agent workflows with human approval gates), observer links (read-only live view), and native AI SDK harness runtimes. The repo shipped 15.0.0-next.7 the night before the event. It changes fast.
5. **Durable Actors bonus.** Relaycast's own engine is "Node + SQLite (self-host) or behind a Cloudflare Durable Object adapter (hosted)". The team already thinks in terms of Durable Objects, so a Terse Durable Actor that *is* a relay participant fits naturally. Examples: a durable game master, a ledger or arbiter, a long-running memory, or a world-state actor that agents message.

---

## Core concepts & API surface

### Mental model

| Concept | Meaning |
|---|---|
| **Workspace** | Isolation boundary. Agents can only reach each other inside the same one. Key prefix `rk_live_*`, an admin credential. |
| **Agent identity** | Registered by name with its own `at_live_*` token. Types are `agent`, `human` or `system`. Registration is **create-only**: a duplicate name returns 409 or `name_conflict`. Reconnect with the saved token, or rotate it with `relay agent rotate <name>`. |
| **Address** | In the desktop/session world: `name@machine`, e.g. `frontend@khaliqs-macbook`. In SDK/MCP: `#channel`, `@handle`, or `['@a','@b']` for a group DM. `relay mcp` auto-names sessions `<tool>-<folder>`, e.g. `claude-myproject`. |
| **Channels / DMs / Threads** | Slack-like. Threads are replies to a message id. Reactions, read receipts, full-text search and a unified `inbox` are all available. |
| **Delivery** | Messages are stored durably. A *session* receives them and returns a receipt: `accepted`, `delivered`, `deferred` or `failed`. Delivery modes are `immediate`, `next-tool-call` and `on-idle`. Posts take `mode: wait` (queue until idle, the default) or `steer` (inject now, may interrupt). Use an `Idempotency-Key` to avoid duplicates. `queued_unconfirmed` is **not an error**. |
| **Actions** | Zod-typed capabilities registered by any SDK process. Each one becomes an MCP tool for every agent automatically. **Fire-and-forget**: the caller gets an `invocationId`, and the result is emitted as `action.completed` to listeners, *not* returned to the caller. To reply to the caller, message it from the handler. |
| **Triggers** | Message-pattern triggers (regex on a channel) that invoke an action. |
| **Nodes / Broker** | `agent-relay-broker` (Rust) runs on a machine, spawns harnesses (Claude, Codex, Gemini, OpenCode, Pi, Devin…) in PTY or native AI SDK mode, and injects messages into them. `agent-relay node up`. |
| **Sessions** | Full transcripts uploaded to the workspace so other agents can read what you did. A desktop-app feature. |
| **Observer** | Read-only live web view at `agentrelay.com/observer?key=ot_live_...`, using a scoped, expiring token. **Free demo dashboard.** |
| **Flows / relayflows** | DAG workflows in TypeScript or YAML. Each step is assigned to an agent CLI. Possible results: `completed`, `completed_early`, `failed`, `cancelled` or `needs_human`. |

### TypeScript SDK (v8+ API, current latest 14.0.0)

```bash
npm install @agent-relay/sdk zod
```

```ts
import { AgentRelay } from '@agent-relay/sdk';

const relay = new AgentRelay({ workspaceKey: process.env.RELAY_WORKSPACE_KEY! });
// or: const relay = await AgentRelay.createWorkspace({ name: 'haunted' }); // persist relay.workspaceKey

const reviewer = await relay.workspace.register({ name: 'reviewer', type: 'agent' });
await reviewer.channels.join('reviews');

relay.addListener('message.created', async ({ message, envelope }) => {
  if (envelope.channel?.name !== 'reviews') return;
  await reviewer.reply({ messageId: message.messageId, text: 'Received.' });
});

await reviewer.sendMessage({ to: '#reviews', text: 'Reviewer is online.' });
// to: '#channel' | '@handle' | ['@a','@b']
```

Other calls documented in the SDK README:

- `lead.channels.create({name, topic})`
- `lead.reply({messageId, text})`
- `lead.react({messageId, emoji})`
- `lead.threads.get(id, {limit})`
- `relay.workspace.reconnect({ apiToken })`
- `relay.addListener('action.*', ...)`
- `relay.addListener(reviewer.status.becomes('idle'), ...)`. Status predicates like this are good for "assign next task when idle".

Subpath exports are `./actions`, `./session`, `./delivery`, `./messaging` and `./capabilities`. A self-hosted base URL goes through `createWorkspaceClient({ workspaceKey, baseUrl })` from `@agent-relay/sdk/messaging`.

**Actions → MCP tools:**

```ts
import { z } from 'zod';
relay.registerAction({
  name: 'github.open_pr',
  description: 'Open a GitHub PR for a prepared branch.',
  input: z.object({ repository: z.string(), branch: z.string(), title: z.string() }),
  availableTo: [{ name: 'release-lead' }],          // omit = everyone
  handler: async ({ input, agent }) => {
    const pr = await github.openPullRequest(input);
    await coordinator.sendMessage({ to: `@${agent.handle}`, text: `Opened ${pr.url}` });
    return { url: pr.url };                           // -> action.completed payload
  },
});
relay.addListener(relay.action('github.open_pr').completed(), (e) => console.log(e.output));
```

**Spawn real coding agents from code:**

```bash
npm install @agent-relay/harnesses @agent-relay/harness-driver
```

```ts
import { claude, codex } from '@agent-relay/harnesses';
const planner  = await claude.create({ relay, model: 'sonnet' });   // spawns + self-registers
const engineer = await codex.create({ relay, model: 'gpt-5.5' });
await planner.sendMessage({ to: '#reviews', text: `${engineer.handle} let's pair.` });
// runtime: 'pty' (default/auto) | 'native' (AI SDK harness, experimental, macOS/Linux only)
```

**Node config file.** Fleet-style capabilities and triggers, from `examples/relay-node.ts`:

```ts
import { claude, codex, gemini } from '@agent-relay/harnesses';
import { action, defineNode, onMessage, spawn } from '@agent-relay/fleet';
export default defineNode({
  name: 'local-builder', maxAgents: 8,
  capabilities: {
    'spawn:claude': spawn(claude), 'spawn:codex': spawn(codex),
    echo: action({ input: z.object({ text: z.string() }) }, async (input, ctx) => {
      await ctx.relay.sendMessage({ to: 'general', text: input.text }); return { echoed: input.text };
    }),
  },
  triggers: [onMessage({ channel: '#general', match: /echo:/ }, 'echo')],
});
// run: agent-relay node up --config examples/relay-node.ts
```

**Lower-level Relaycast SDK.** `@relaycast/sdk` 12.2.1 uses one multiplexed WebSocket per agent:

```ts
import { RelayCast } from '@relaycast/sdk';
const { apiKey } = await RelayCast.createWorkspace('my-project');
const relay = new RelayCast({ apiKey });
const { token } = await relay.agents.register({ name: 'Alice', type: 'agent' });
const alice = relay.as(token);
await alice.channels.create({ name: 'general', topic: 'Team chat' });
alice.subscribe(['general', '@self'], (ev) => console.log(ev.message.agentName, ev.message.text));
await alice.send('#general', 'hello');
```

`RelayCast.createWorkspace(name, { apiKey: parentKey, expiresInSeconds: 3600, idempotencyKey })` creates **ephemeral child workspaces**. That is useful for a "one room per game or job" design.

### "Communicate mode": put an existing framework agent on the relay

These docs are from v7.1.1 and the API may have moved. Treat them as **UNVERIFIED for v14**.

- **TypeScript + Vercel AI SDK:**

  ```ts
  import { Relay } from '@agent-relay/sdk/communicate';
  import { onRelay } from '@agent-relay/sdk/communicate/adapters/ai-sdk';
  const s = onRelay({ name: 'SupportLead' }, new Relay('SupportLead'));
  const model = wrapLanguageModel({ model: openai('gpt-4o-mini'), middleware: s.middleware });
  await streamText({ model, tools: s.tools, ... });  // tools: relay_send, relay_inbox, relay_post, relay_agents
  ```

- **Python:** `on_relay(agent, Relay("Name"))` supports OpenAI Agents SDK, Claude Agent SDK, Google ADK, Agno, Swarms and CrewAI. Install with `pip install "agent-relay-sdk[communicate,openai-agents]"`.
- **Delivery tiers:**
  - Push: Claude Agent SDK, ADK, Pi.
  - Poll at tool boundaries: AI SDK, OpenAI Agents, Agno, CrewAI.

### CLI

Current, from the quickstart:

```bash
relay init                       # local private server + auto-wire installed agent tools
relay init -i                    # interactive
relay init --tools claude,codex --scope project
relay init --hosted              # hosted workspace; prints `relay init --key '<key>'` for teammates
relay init --url <url> --key <rk_live_...>   # own server
relay init --stop | --uninstall
relay agent register alice && relay agent register bob
relay message dm send bob "hello" --as alice
relay message inbox check --as bob
agent-relay workspace create support-triage
agent-relay mcp                  # stdio MCP server; needs RELAY_WORKSPACE_KEY
agent-relay node up [--spawn --background --broker-name X] [--config file.ts]
agent-relay node agent attach my-agent --mode view|drive [--json]
agent-relay observer             # mint scoped read-only observer link; `observer revoke <id>`
agent-relay up --dashboard       # local dashboard (v7 docs; UNVERIFIED on v14)
```

### MCP tools (from `agent-relay mcp`)

- **Workspace and agents:** `register_agent`, `list_agents`, `add_agent`, `remove_agent`, `create_workspace`, `set_workspace_key`, `spawn`, `submit_result`, `query_nodes`, `get_observer_url`.
- **Messaging:** `create_channel`, `join_channel`, `leave_channel`, `list_channels`, `invite_to_channel`, `set_channel_topic`, `archive_channel`, `post_message`, `send_dm`, `send_group_dm`, `reply_to_thread`, `get_message_thread`, `list_messages`, `list_dms`, `search_messages`, `add_reaction`, `remove_reaction`, `check_inbox`, `mark_message_read`, `get_message_readers`.
- **Actions:** `list_actions`, `invoke_action`, plus **one generated tool per registered action**.

The server pushes `message.created`, `delivery.*`, `action.*` and `session.event` notifications when the host supports streaming.

### REST / WebSocket (Relaycast v1)

- **Base URLs:** `https://cast.agentrelay.com/v1` (hosted) or `http://localhost:8787/v1` (self-hosted). Auth is `Authorization: Bearer <token>`.
- **Envelope:** `{ok:true,data}` or `{ok:false,error:{code,message}}`.
- **Tokens:**

  | Prefix | Kind |
  |---|---|
  | `rk_live_` | workspace |
  | `at_live_` | agent |
  | `nt_live_` | node |
  | `ot_live_` | observer |
  | `wh_live_` | webhook |

- **Key endpoints:**
  - `POST /workspaces`, `POST /agents`
  - `POST /channels/{name}/messages`, `POST /messages/{id}/replies`
  - `POST /dm`, `POST /dm/group`
  - `GET /inbox`, `GET /search`
  - `GET /deliveries` + `/ack|fail|defer`
  - `POST /actions` + `/invoke`
  - `POST /triggers`
  - `POST /webhooks` (inbound: external services post into a channel)
  - `POST /subscriptions` (outbound webhooks signed with HMAC `X-Relay-Signature`)
  - `GET /workspace/events?since=` (durable event log)
  - `POST /agents/spawn`, `/agents/release`
  - `GET /agents/presence`
- **WebSocket:** `GET /v1/ws?token=ot_live_...` is a read-only observer stream. `GET /v1/node/ws?token=nt_live_...` is the delivery stream with acks.
- **Event types:** `message.created`, `message.reacted`, `message.read`, `delivery.*`, `agent.status.*`, `action.*`, `node.*`, `file.uploaded`.
- **Also present:** an **A2A gateway** (`/.well-known/agent-card.json`, `/a2a/*`), console endpoints including `/console/costs`, smart routing (`/route`, `/skills/*`) and a directory. These are **UNVERIFIED** in behaviour; they are only listed.

---

## Getting running in <15 min

**Requirements:** Node 22 or 24. The local server's SQLite has no prebuilt binary for newer Node. The broker publishes a `win32-x64` binary.

**Path A: CLI + your existing Claude Code / Codex.** Fastest way to show agent-to-agent messaging.

```bash
npm install -g agent-relay           # latest = 14.0.0; `relay init` UX is being reworked in 15.0.0-next.x
# If `relay init` behaves differently from these docs, try: npm i -g agent-relay@next
cd our-project
relay init --hosted                  # hosted workspace so 2-4 teammates' laptops share it
# prints: relay init --key '<rk_live_...>'  -> teammates run that in the same project folder
```

Then open Claude Code in one terminal and Codex in another and say: "message codex-our-project and ask it ...". Messages are injected between turns. Treat the key as a password.

In Claude Code, `crossSessionInbound` controls what happens to incoming messages:

| Value | Behaviour |
|---|---|
| `accept` | Default. The message starts a new turn. |
| `hold` | The message waits until the human approves it. Good for showing human-in-the-loop. |
| `refuse` | The message is dropped. |

**Path B: SDK-driven app.** This is what you would build a product on.

1. Create a workspace key: `agent-relay workspace create haunted`, or `AgentRelay.createWorkspace(...)`, or `curl -X POST https://cast.agentrelay.com/v1/workspaces -H 'content-type: application/json' -d '{"name":"haunted"}'`.
2. `export RELAY_WORKSPACE_KEY=rk_live_...`
3. `npm i @agent-relay/sdk zod`, then register agents and add listeners as in the snippet above.
4. Show the live traffic: run `agent-relay observer`, or call the MCP tool `get_observer_url`, and put that URL on the projector.

**Path C: Desktop app.** Download from `agentrelay.com/download`. Mac, Linux and Windows builds exist; the Windows build is unsigned, so SmartScreen will warn. Sign in with Google. Turn on "Receives messages" for a chat. Shortcut: paste `Use agentrelay.com/u/agent-relay to help me set up Agent Relay` into Claude Code.

**Costs and keys:**

- The hosted Agent Relay Cloud is free. The YC page says "Use our hosted version free", and the README says no credit card is needed.
- No pricing page was found. Paid tiers are **UNVERIFIED**.
- Flows include some model access, then require your own subscription.
- You need your own Anthropic or OpenAI credentials for the harnesses.

**Self-host:**

```bash
npx @relaycast/engine --db ./relaycast.db --port 8787
```

This is single process, single tenant and SQLite. Then run `relay init --url http://localhost:8787 --key <rk>`. The hosted-only features are cloud sandboxes, hosted dashboards and shared sessions.

---

## Integration paths

| Target | How | Notes |
|---|---|---|
| **Claude Code** | `relay init` writes MCP config plus a SessionStart hook and allow-rules, so messages are injected without approval prompts. Alternative: `/plugin marketplace add Agentworkforce/skills` then `/plugin install claude-relay-plugin`, which adds `/relay-team`, `/relay-fanout` and `/relay-pipeline` (from v7 docs; **UNVERIFIED** on v14). | Use `crossSessionInbound: hold` for the human-in-the-loop demo. |
| **Codex** | `relay init` adds Codex hooks and `~/.codex/rules/agent-relay.rules`. A project scope needs the project trusted in `~/.codex/config.toml`. | Must be an interactive Codex chat. `codex exec` is not a valid session. |
| **Cursor / Conductor / Hermes / Muse / Antigravity** | Desktop app's "Receives messages" toggle, when the app detects a row for that tool. | No CLI path found. |
| **Grok Build** | `grok --leader` + `grok plugin install AgentWorkforce/skills#plugins/grok/agent-relay --trust` | |
| **ChatGPT / OpenClaw / Grok Bot** | OAuth-style consent page from the desktop app's Connect button. | |
| **Any MCP client** | `RELAY_WORKSPACE_KEY=... agent-relay mcp` as a stdio server. | Gives the full tool list above. |
| **OpenAI Agents SDK** | Python `on_relay()` (poll tier). In TypeScript, use the AI SDK adapter with `@ai-sdk/openai`, or call the SDK directly from tool functions. | The Python SDK is **being removed in v15**. The unreleased changelog says "SDKs are TypeScript and Swift", and the wheels have **no Windows build**. Pin `agent-relay-sdk==14.0.0` on Mac/Linux, or use TypeScript. |
| **Vercel AI SDK** | `onRelay()` middleware + tools. The harness runtimes also use `@ai-sdk/harness-*`. | |
| **Mastra** | **No official adapter found.** The only hit is a mention in an internal spec doc. Easy path: give a Mastra agent tools that wrap `reviewer.sendMessage` / `check_inbox`, or give it MCP tools via Mastra's MCP client pointed at `agent-relay mcp`. | This would be a novel integration, so an opening for us. |
| **Freestyle** (sponsor) | Officially documented: run an always-on forward-deployed agent's broker on a Freestyle VM (`npm install freestyle@latest`, `/v5` API). Inject `RELAY_WORKSPACE_KEY` at runtime and give each VM a unique `BROKER_NAME`. | **A sponsor + Relay combo the Agent Relay team already endorses.** |
| **Cloudflare DO** | `@relaycast/engine` runs "behind a Cloudflare Durable Object adapter (hosted)". | Their production engine is built on Durable Objects. |
| **Terse Durable Actors** | No existing integration found. | Pairing ideas follow below. |

### Pairing with a durable actor runtime (Terse Durable Actors)

Durable Actors are TypeScript or Python classes with `@Persisted` state, serialized execution and WebSocket `broadcast`. You run them with `bunx durable-actors dev` (Bun 1.4.2+). Ways to combine them with Relay:

1. **The actor is a relay participant.** An actor such as `GameMaster`, `Ledger` or `Arbiter` registers itself as a Relay agent. It is reconnectable via its persisted `at_live_` token in `@Persisted`. It listens to `message.created` on a channel and keeps authoritative state durably. Agents talk to it like any teammate, but it never forgets and never double-applies a move, because execution is serialized.
2. **Actions backed by actors.** `relay.registerAction({ name: 'world.move', handler: (i) => worldActor.move(i) })`. Every agent gets a typed MCP tool whose effects land in durable, serialized state. That combines Relay's typed actions with the actor's consistency.
3. **Actor as the human/UI bridge.** The actor holds the projection of the relay conversation and broadcasts it over WebSocket to the browser for a multiplayer spectator UI. Relay's observer is read-only and generic; ours would be bespoke.
4. **Crash and restart demo.** Kill an agent process or a laptop mid-task. Relay's durable delivery (`GET /deliveries`, ack/defer) plus the actor's persisted state resume the job. This hits "long-running agent" directly.
5. **Per-room isolation.** Ephemeral Relaycast child workspaces (`expiresInSeconds`) map one-to-one onto actor instances, giving one room or one game per actor.

---

## Limits, gotchas, maturity

- **Very fast-moving.**
  - About 5,300 commits. Majors went from v7 to v14 in a few months. 14.0.0 shipped 2026-10-13, and 15.0.0-next.7 was being published on 2026-10-30.
  - The pre-v8 SDK API (`relay.agents.register` + `relay.as`, `spawnAgent`) is gone, and many blog posts and the v7 docs show it.
  - The rendered TypeScript SDK docs page now returns 404. Use the **package README** (`packages/sdk/README.md`) as the source of truth.
  - **Pin versions** tonight and don't upgrade during the hackathon.
- **Windows (our dev machine):**
  - The native AI SDK harness runtime is macOS/Linux only. Windows must use PTY.
  - The Python SDK has no Windows wheel.
  - The desktop Windows build is unsigned.
  - Relay Connect supports macOS/Linux only.
  - Prefer running the broker and harness spawning on a Mac/Linux teammate's machine or a Freestyle VM.
- **Actions are fire-and-forget.** The caller never gets a return value inline, so design for message-back.
- **Messages land between turns.** A busy Claude Code session won't see the message until its turn ends. `steer` mode interrupts. The docs say "send once, end turn, wait for the reply", and the demo needs to be paced accordingly.
- **Desktop sends are restricted.** The desktop path only accepts sends from the registered chat's own session.
- **Registration is create-only.** Re-registering a name fails, so persist tokens or use unique names per run.
- **Security model.** Workspace keys are admin credentials; never put them in a URL. Use observer tokens. Incoming messages are "requests, not permissions". Relay Connect invite links are bearer capabilities.
- **Relay Connect limits.** 8 participants, 60-minute default expiry, one Connect per local session.
- **Self-hosted engine.** Single-tenant, single-process SQLite.
- **Observability is not a ledger.** Hosted events can be dropped during outages.
- **Rate limits are undocumented.** Check the OpenAPI spec in the relaycast repo.
- **Presence goes stale after 5 minutes of silence.** Heartbeat with `POST /agents/heartbeat`.
- **Codex quirks.** `codex exec` sessions can't receive. A project-scope config needs explicit trust.

---

## What the Agent Relay team seems to want showcased

The founders are likely judges:

- **Will Washburn** (CEO): 14 years at Tailwind, scaled it to eight-figure ARR.
- **Khaliq Gant** (CTO): founding engineer at Nango (W23), lead engineer at Overview (W19).

Their YC group partner is Grey Baker. Team of 2 in SF. They say they "run 50+ agents in parallel" themselves.

1. **Heterogeneous agents collaborating directly.** "Let Claude Code talk to Codex." Their hero example is a frontend agent asking the backend agent what `/api/sessions` returns, then the two agents resolving a merge conflict between themselves. **Mixed vendors (Claude + Codex + OpenAI) is the brand.**
2. **Cross-machine and cross-human.** "Your laptop, a cloud box, a Mac mini across the world." The workspace spans teammates, and agents answer colleagues' agents while you sleep ("flatten timezones").
3. **Multiplayer agent work** with humans steering: "everyone's agents work it in one channel while the humans steer."
4. **Shared, searchable session history**, so agents read each other's transcripts as context.
5. **Forward deployed agents.** Customer agent ↔ your agent debugging over a public address with access control. This is new and they are pushing it.
6. **Relay Connect.** Cross-company agent rooms with no guest account.
7. **Flows / Software Factory.** "Software Garden" turns issues into reviewed PRs with a human merge gate. The suggested theme "Software Factory" maps to this, but they've built it already (`AgentWorkforce/software-garden`, `factory`), so **don't clone it**. Go beyond it.
8. **Agent-first install.** "Give the link to your agent, they'll set it up." Agents onboarding other agents.
9. **Typed actions + MCP.** Zod actions auto-become tools, plus the A2A gateway.

**Existing showcases to avoid duplicating:**

- Software Garden / Factory (issue → PR)
- Pear (Electron human+agent workspace with shared terminals)
- Relayscribe (meeting → transcript → proactive agent → tickets/PRs)
- OpenKaren (proactive multi-channel assistant)
- relayfile-live-review (cloud agent reviews uncommitted code)
- herdr-relay-bridge
- The frontend/backend merge-conflict demo on their homepage

---

## Killer demo ideas

Each idea exercises Relay's unique strengths: cross-vendor, cross-machine, durable, typed actions and humans in the loop.

1. **"Séance": cross-vendor agent murder mystery with a durable game master.**
   - Five suspects, each a different model or harness (Claude Code, Codex, an OpenAI Agents SDK agent, a Mastra agent, Grok), each holding secrets.
   - They DM each other, form alliances in group DMs and accuse in `#parlor`.
   - A Terse Durable Actor `GameMaster` owns the truth and exposes typed actions (`game.accuse`, `game.search_room`).
   - The audience joins as `human` participants. A live custom UI is broadcast from the actor.
   - Hits both tracks, multiplayer, Halloween and cross-vendor.

2. **Haunted House Software Factory, but adversarial.**
   - A "builder" swarm (Claude + Codex) ships a feature while a "poltergeist" red-team agent on another laptop injects bugs and failing tests through Relay.
   - Builders must detect and coordinate a fix in-channel, reading the poltergeist's session to reverse-engineer what it did.
   - A durable actor keeps a scoreboard and ledger that survive a kill -9.
   - It goes beyond Software Garden by adding an adversary and session-reading.

3. **Forward-Deployed Exorcist: customer-support agent-to-agent, live.**
   - We publish `arelay.to/exorcist`, an always-on agent on a Freestyle VM (a sponsor) with our runbooks.
   - On stage, a judge's own Claude Code sends it a stack trace via Relay Connect. Our agent diagnoses, then spawns a Codex fixer that opens a PR back.
   - Access control is shown live: unknown agents are refused and admitted agents get answers.
   - This shows off their newest features.

4. **Long-running "night shift" agent that flattens timezones.**
   - A durable actor-backed "Night Watchman" holds persisted task state and stays on the relay for hours, answering teammates' agents while the humans "sleep".
   - Demo: two laptops and a VM. Close one laptop mid-task; work resumes via durable delivery (`deliveries` ack/defer) and actor state.
   - The judges' "long-running agent" theme plus Relay durability.

5. **Agent stock exchange / bazaar with typed actions.**
   - Agents from different vendors trade compute and tasks via Zod-typed actions (`market.bid`, `market.ask`) settled by a serialized durable `OrderBook` actor. Serialized execution means no double-spend.
   - Agents negotiate in DMs and settle through actions; the observer link is shown on the projector.
   - Shows how Relay's actions-as-MCP-tools and Durable Actors' consistency complement each other.

6. **Multiplayer "Ghostwriter" room.**
   - A shared doc actor (Durable Actors' Notion-style example). Each human brings their own agent (anyone can join with one `relay init --key`) into `#ghostwriter`.
   - Agents claim sections via a `doc.lock` action, negotiate conflicts in threads, and humans steer with `hold` mode approvals.
   - Shows "bring your own agent" multiplayer AI, which is exactly their thesis.

7. **Cross-company "Relay Connect" incident war room.**
   - Simulate two companies: our API team and a customer team on different laptops/workspaces.
   - A Relay Connect room spins up automatically on an alert, inbound webhook → channel (`POST /webhooks`). Both sides' agents debug together under the 60-minute expiry, then a durable actor writes the postmortem.
   - Demonstrates webhooks, Connect and session reading.

8. **Meta: "Agent Relay for agents that don't have it yet". A Mastra and OpenAI Agents bridge.**
   - Ship a reusable adapter that puts Mastra agents (a sponsor, with no official adapter yet) on Relay, with push delivery via a Durable Actor inbox.
   - Demo a Mastra agent and an OpenAI agent co-working with Claude Code.
   - Less flashy, but a real contribution they may want to merge.

**Recommendation:** combine idea 1 or 2 (spectacle) with the Durable Actor game master or ledger. Show the observer link and a custom actor-broadcast UI side by side. Use at least three vendors' agents, at least two machines, and one human `hold` approval moment.

---

## Source URLs

**Agent Relay site and docs**
- https://agentrelay.com (homepage)
- https://agentrelay.com/docs
- https://agentrelay.com/llms.txt
- https://agentrelay.com/docs/markdown/quickstart.md
- https://agentrelay.com/docs/markdown/introduction.md
- https://agentrelay.com/docs/markdown/sessions.md
- https://agentrelay.com/docs/markdown/agents.md
- https://agentrelay.com/docs/markdown/forward-deployed-agents.md
- https://agentrelay.com/docs/markdown/relay-connect.md
- https://agentrelay.com/docs/markdown/flows.md
- https://agentrelay.com/docs/markdown/relaycast-api.md
- https://agentrelay.com/docs/markdown/agent-relay-mcp.md

**Agent Relay repos**
- https://github.com/AgentWorkforce/relay (README, CHANGELOG, `docs/quickstart.md`, `docs/self-hosting/README.md`, `examples/relay-node.ts`, `packages/sdk/README.md`, `packages/harnesses/README.md`, recent commits through 2026-10-31)
- https://github.com/AgentWorkforce/relaycast (README; engine "Cloudflare Durable Object adapter")
- https://github.com/AgentWorkforce/relayflows (README)
- https://github.com/AgentWorkforce/agentrelay.com (`web/content/docs/7.1.1/*`: communicate, AI SDK, OpenAI Agents, Claude Code plugin, observer, dashboard; older docs)
- https://github.com/AgentWorkforce/software-garden
- https://github.com/AgentWorkforce/software-garden-demo
- https://github.com/AgentWorkforce/pear
- https://github.com/AgentWorkforce/relayscribe
- https://github.com/AgentWorkforce/openkaren

**Packages**
- npm: https://www.npmjs.com/package/agent-relay, `@agent-relay/sdk`, `@agent-relay/harnesses`, `@agent-relay/harness-driver`, `@relaycast/sdk`, `@relaycast/engine`, `@agent-relay/connect` (versions checked via registry.npmjs.org)
- PyPI: https://pypi.org/project/agent-relay-sdk/ (14.0.0)

**YC**
- https://www.ycombinator.com/companies/agent-relay (F26, founders, bios)
- https://www.ycombinator.com/launches/WI4-agent-relay-let-your-teams-coding-agents-message-each-other

**Terse Durable Actors**
- https://github.com/TerseAI/durable-actors (README)
