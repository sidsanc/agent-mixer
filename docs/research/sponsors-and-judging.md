# Sponsors, Judging & Winning Patterns — Haunted Hacks: Real-Time AI Edition

Researched 2026-10-30. Terse (Durable Actors) and Agent Relay are covered in separate docs.
Convention: **VERIFIED** = read on the vendor's own docs page today; **UNVERIFIED** = third-party source, prior knowledge, or inference. Docs were read through a summarizing fetch tool, so re-check exact API signatures in the docs at build time.

---

## TL;DR

- **Freestyle** and **Superserve** both sell *Firecracker-style microVM sandboxes for agents* (fast boot, pause/resume, snapshot/fork). Freestyle's demo superpower: **public HTTPS URL for a dev server inside a VM** (`*.style.dev`). Superserve's: **snapshot + fork sandboxes to try N approaches in parallel**, plus a hosted MCP server.
- **Mastra** = TypeScript agent framework (agents, tools, workflows, memory, MCP client/server, Studio). Freestyle has an official "Give your Mastra agent a sandbox" guide.
- **Supabase**: use **Broadcast + Presence** for the live multiplayer UI; Postgres Changes stops scaling around ~3k subscribers on one change stream (their docs say so). That is the "scale to millions" talking point.
- **OpenAI**: current flagship is the **GPT-6 family** (`gpt-6-astra`, `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-luna`). Voice: `gpt-realtime-2.1` (used in the Realtime quickstart) via WebRTC + ephemeral secrets, `RealtimeAgent` in `@openai/agents/realtime`.
- **The event page, judges and rubric could not be found** online (not on Tech Week, Luma search, or general search). Assume the generic Builderbase rubric: Innovation / Technical execution / Impact / Presentation.
- **Recommendation:** a voice-driven, multiplayer "haunted software factory". Durable Actor per room/project, Agent Relay between specialist agents, Freestyle VM building and serving the app live on a public URL, Supabase Broadcast/Presence for the spectator UI, OpenAI Realtime voice as the "summoning" interface. Mastra is optional glue.

---

## 1. Freestyle (YC F24) — $100 credits/person; $10k Freestyle for overall winner

### What it is (VERIFIED)
"Infrastructure for running code you didn't write." The product centers on **Freestyle VMs**: persistent Linux VMs that "start in milliseconds and run for weeks."
- Provisioning p99 < 400 ms. VMs can **hibernate with exact memory state** and resume weeks later.
- **Snapshots** are cheap with minimal interruption. New VMs can be created from a snapshot (clone/branch).
- Up to 64 GB RAM on public tiers. Full Linux: nested virt, FUSE, eBPF, Docker.
- **Networking:** VPCs, firewall rules (required on create), inbound/outbound TLS, WireGuard.
- **Domains:** free `*.style.dev` subdomains or your own domain, routed to a VM port.
- **Multi-tenancy:** slug system keyed by user, plus an identity system for access control.
- **Credential injection at the edge:** OpenAI/Anthropic/OpenRouter keys, git creds, etc. never enter the VM.
- Older materials also mention Git hosting and serverless deployments/runs (old `freestyle-sandboxes` npm package, now **deprecated**). Current docs lead with VMs. **UNVERIFIED** whether git hosting and deploy APIs still exist in the new `freestyle` SDK.

### Why it matters for us
- Overall winner gets **$10k Freestyle credits**, so the sponsor will likely look for Freestyle usage.
- Natural fit for "Software Factory": agents write code into a VM, run `npm run dev`, and the app goes live on a public URL that judges can open on their phones.
- Snapshot/fork lets you branch an agent's workspace (e.g. "3 ghost agents try 3 designs in parallel").

### Quickstart (VERIFIED from /docs/quickstart and /docs/vms/domains)
```bash
npm install freestyle@latest
npx freestyle@latest login            # if needed
npx freestyle@latest tokens create "quickstart"
export FREESTYLE_API_KEY="..."
```
```ts
import { Freestyle } from "freestyle";
const freestyle = new Freestyle();
const { vm } = await freestyle.vms.create({
  firewall: { rules: [{ action: "allow", source: {}, destination: { public: true } }] },
});
await vm.exec("echo 'hello from freestyle'");

// expose port 3000 publicly
await freestyle.tls.rules.create({
  action: "allow",
  domain: "my-app.style.dev",
  source: { public: true },
  destination: { vmId: vm.id /* field name UNVERIFIED */, port: 3000 },
});
```
Relevant guides: "Run a Vite Dev Server in a Sandbox", "Run a Next.js Dev Server in a Sandbox", "Give Your Mastra Agent a Sandbox", "Give Your OpenAI Agent a Sandbox", "Run Claude Code in a Sandbox", "Run Chromium in a Sandbox", "Run Supabase in a Sandbox", "Stream Audio Alongside noVNC".
Docs MCP: `https://docs.freestyle.sh/api/mcp/mcp` (from search result, UNVERIFIED). Index: https://www.freestyle.sh/docs/llms.txt

### Demo-worthy features
1. **Live URL reveal**: the agent builds an app and a QR code to `xyz.style.dev` appears on screen.
2. **Fork-the-universe**: snapshot a VM mid-build and fork 3 variants.
3. **Hibernate/resume**: "this agent's VM has been asleep since this morning; resume it with memory intact." A strong long-running-agent story that also pairs with Durable Actors.
4. Chromium/noVNC in a VM so the audience can *watch* the agent's browser.

Sources: https://www.freestyle.sh/docs · https://www.freestyle.sh/docs/quickstart · https://www.freestyle.sh/docs/vms/domains · https://www.freestyle.sh/docs/guides.md · https://cdn.jsdelivr.net/npm/freestyle-sandboxes@0.1.46/README.md

---

## 2. Superserve (YC F26) — $100 credits/person; $1k for overall winner

### What it is (VERIFIED from superserve.ai, today)
**Cloud sandboxes for AI agents**: Firecracker microVMs that start in milliseconds, **pause with memory and disk intact**, and resume later. Open source and self-hostable (github.com/superserve-ai/superserve).
- Run code, shells, or full coding agents (Claude Code, Codex) in an isolated VM.
- **Snapshot and fork** sandboxes to try several approaches in parallel.
- Network **egress rules**. API calls with **credentials kept outside the sandbox**.
- Interfaces: CLI `superserve` (`--json`), TS SDK `@superserve/sdk`, Python `superserve`, REST `https://api.superserve.ai` (header `X-API-Key`), **MCP server** at `https://mcp.superserve.ai` or `npx -y @superserve/mcp` (uses `SUPERSERVE_API_KEY`).
- History (UNVERIFIED, legacy site): it started as "your agent, deployed", a hosting platform for Claude Agent SDK agents built on Ray. It has since pivoted to sandboxes. The YC F26 batch comes from the event brief and isn't confirmed on their site.

### Why it matters
- Heavy overlap with Freestyle. **Using both is plausible but should be differentiated.** Example: Freestyle serves the *product* (public dev server URL), and Superserve runs the *agents* (e.g., a Codex/Claude Code worker per task, forked per attempt). Or plug Superserve's MCP server directly into an agent as a tool.
- Overall-winner prize includes $1k Superserve. Low cost to integrate via MCP.

### Quickstart (VERIFIED)
```bash
curl -fsSL https://superserve.ai/install | SUPERSERVE_NO_LOGIN=1 sh
~/.superserve/bin/superserve --help
npm install @superserve/sdk      # or: pip install superserve
```
Setup guide for agents: https://superserve.ai/SKILL.md · Docs index: https://docs.superserve.ai/llms.txt · CLI: https://docs.superserve.ai/cli.md
SDK method names: **UNVERIFIED** (check docs.superserve.ai at build time).

### Demo-worthy features
- **Parallel forks**: "summon 3 ghosts". Fork a sandbox 3 times, each agent tries a fix, keep the winner. Very visual on a grid UI.
- Pause/resume as the "long-running agent" story.
- MCP server lets any MCP-capable agent (Mastra, OpenAI Agents SDK) get sandboxes with zero glue code.

Sources: https://superserve.ai · https://www.mintlify.com/superserve-ai/superserve · https://superserve-legacy.vercel.app/blog/introducing-superserve/ · https://pypi.org/project/superserve/0.1.3/

---

## 3. Mastra (YC W25) — 3 months Mastra for top 3

### What it is
A TypeScript framework for agents and AI apps. 1.0 shipped Jan 2026 (UNVERIFIED date; third-party).
- **Agents** (instructions + model + tools via `createTool()`), registered on a central `Mastra` instance. **VERIFIED**
- **Memory**, **Workspace** (local shell tools, task tracking, web access), **recurring schedules**, **Studio** (local interactive UI for testing agents/workflows). **VERIFIED** (docs home)
- **Workflows**: graph-based with `.then()`, `.branch()`, `.parallel()`, suspend/resume for human-in-the-loop. **UNVERIFIED** (third-party; not on the docs home page)
- **MCP**: `@mastra/mcp` provides `MCPClient` (consume external MCP servers, OAuth, tool approval) and `MCPServer` (expose Mastra agents/tools/workflows as MCP at `/api/mcp/:serverId/mcp`). Supports MCP rev 2026-07-28. **VERIFIED**
- Evals/scorers, tracing, RAG, model routing across 40+ providers. **UNVERIFIED** (third-party)
- Integrations: Next.js, Vite, Astro, Express, SvelteKit, Hono. **VERIFIED**
- A2A protocol / agent networks: **not confirmed** in the pages read.
- Freestyle publishes "Give Your Mastra Agent a Sandbox", which implements Mastra's **Workspace sandbox interface** on a Freestyle VM. **VERIFIED** (guide title/summary)

### Quickstart (VERIFIED)
```bash
npm create mastra@latest     # pnpm create mastra@latest | bunx create-mastra
npm run dev                  # opens Mastra Studio (UNVERIFIED port, historically localhost:4111)
```

### How it pairs with Durable Actors / Agent Relay
- **Durable Actor = the agent's home and state** (one actor per agent or per room: identity, mailbox, persistent memory, alarms). **Mastra = the brain inside**: the actor's handler calls `agent.generate()`/`stream()`.
- **Agent Relay = the wire between Mastra agents.** Wrap "send message to agent X" as a Mastra `createTool()` that publishes through Agent Relay, so agents decide on their own when to talk to each other.
- Mastra Workspace on a Freestyle VM gives each agent a real computer.
- Risk: Mastra memory/storage overlaps with Durable Actor state. Pick one source of truth (the actor) to avoid a 5-hour integration fight.

Sources: https://mastra.ai/docs · https://mastra.ai/docs/mcp/overview · https://dev.to/jangwook_kim_e31e7291ad98/mastra-ai-10-the-typescript-agent-framework-developers-are-actually-shipping-2lan · https://www.freestyle.sh/docs/guides.md

---

## 4. Supabase (YC S20) — $25 credits; $1k "most likely to scale to millions"

### Realtime (VERIFIED)
- **Broadcast**: low-latency client↔client messages (chat, cursors, game events).
- **Presence**: synced per-user state (who's online, what they're doing).
- **Postgres Changes**: stream DB changes to clients. **Doesn't scale well**: "authorizes every event against each subscriber", processes changes on a single thread, and bigger compute doesn't help much. The docs say that above ~3,000 concurrent subscribers on the same changes you should **use Broadcast to stream DB changes instead**, since it "sends each change once and fans it out."
- Broadcast-from-database helpers `realtime.broadcast_changes()` / `realtime.send()` (trigger-based). **UNVERIFIED in today's read** (prior knowledge; the docs link "Broadcast to stream database changes" exists).
- Plan limits (VERIFIED):

| | Free | Pro | Pro no cap / Team |
|---|---|---|---|
| Concurrent connections | 200 | 500 | 10,000 |
| Messages/sec | 100 | 500 | 2,500 |
| Channel joins/sec | 100 | 500 | 2,500 |
| Broadcast payload | 256 KB | 3 MB | 3 MB |

  Note: the Free tier caps at 200 connections and 100 msg/s. A demo with a room full of judges' phones plus token-streaming agents could hit 100 msg/s. **Batch/throttle agent token streams** (e.g. flush every 100–200 ms) or put the $25 toward Pro.

### Other pieces
- **Edge Functions** (Deno) for webhooks / ephemeral OpenAI Realtime secrets. **pgvector** for agent memory/RAG. **Auth** with anonymous sign-in for instant audience join. (Prior knowledge; UNVERIFIED today.)
- Supabase MCP server is available in this dev environment, so we can create tables and deploy edge functions from Claude Code.

### What credibly shows "scale to millions"
1. **Architecture slide/diagram**: hot state lives in Durable Actors (sharded per room, horizontally scalable). Supabase Postgres is the durable system of record. Fan-out goes through **Broadcast, not Postgres Changes**, and you cite the docs' reasoning.
2. **Live load test**: a script spawning 1–5k simulated Presence/Broadcast clients (within plan limits) with a live counter. Even 500 "ghost" spectators on screen reads as scale.
3. **Partitioned channels** (`room:{id}`), RLS on `realtime.messages` for private channels, indexed RLS policies, append-only event log table.
4. Mention **read replicas / Supavisor pooling** (UNVERIFIED specifics) and that per-room actors keep Postgres writes batched.

Sources: https://supabase.com/docs/guides/realtime · https://supabase.com/docs/guides/realtime/limits · https://supabase.com/docs/guides/realtime/postgres-changes

---

## 5. OpenAI — $100 credits/person; $5k for overall winner

### Current models (VERIFIED from developers.openai.com/api/docs/models today. Surprising enough to re-check on the day.)
- Text flagships: **`gpt-6-astra`** (most capable), **`gpt-6.1-sol`** (near-Astra, cheaper), **`gpt-6.1-terra`** (fast; visual reasoning, computer use), **`gpt-6-luna`** (most efficient, high volume). No "nano" listed.
- Image: `gpt-image-2.5-sunburst` (best), `gpt-image-2.5-flare` (fast).
- Realtime/voice: **`gpt-realtime-2.1`** (reasoning + tool use; used in the Realtime quickstart), `gpt-realtime-2.1-mini`, `gpt-realtime-2`, `gpt-live-1` ("premier" natural voice conversations, smooth interruption handling), `gpt-realtime-translate` (speech-to-speech translation), `gpt-realtime-1.5`. `gpt-realtime-mini` is deprecated.
- Transcription: `gpt-transcribe`, `gpt-live-transcribe`, `gpt-realtime-whisper`. `gpt-4o-*-transcribe` and `gpt-4o-mini-tts` are deprecated.
- gpt-realtime-2 (May 2026): 128K context, adjustable reasoning effort, parallel tool calls, audible "preambles". Pricing ~$32/1M audio-in, $64/1M audio-out. **UNVERIFIED** (third-party).

### Realtime API (VERIFIED)
- Browser: server mints an ephemeral secret via **`POST /v1/realtime/client_secrets`**, then the browser connects over **WebRTC** to **`/v1/realtime/calls`**.
- Server-side WebSocket option exists. SIP not covered on the page read (UNVERIFIED).
- **Agents SDK (JS):** `import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime"`. Tools, handoffs and guardrails attach just like text agents. Keep transport in the session and logic in the agent.
- Responses API remains the core text/tool endpoint (prior knowledge; UNVERIFIED today). The text Agents SDK is `@openai/agents` (JS) / `openai-agents` (Python).

### Demo-worthy
- **Voice-in, agents-act**: speak a request, then watch multiple agents spin up and work. Live voice is one of the most reliable "wow" levers.
- `gpt-realtime-translate` for a multilingual multiplayer twist. `gpt-image-2.5-flare` for spooky generated assets in real time.
- Cost tip: use `gpt-6-luna`/`gpt-6.1-terra` for worker agents and `gpt-6.1-sol` for the planner. With $100 x team size, avoid `astra` in loops.

Sources: https://developers.openai.com/api/docs/models · https://developers.openai.com/api/docs/guides/realtime · https://rits.shanghai.nyu.edu/ai/openai-launches-gpt-realtime-2-with-gpt-5-class-voice-reasoning/ · https://mer.vin/2026/07/gpt-realtime-2-1-api-reasoning-voice-agents-and-mini-pricing/

---

## 6. Judges & Criteria

### Event page / judges: NOT FOUND
- Searched the Tech Week calendar MCP ("Haunted Hacks": no results), Luma via web search, and general web search for the event name, Terse "Durable Actors", and AgentRelay YC. **Nothing indexed.** Judges are **unknown**. Terse/AgentRelay founder names were not found (the other research agents may have them).
- Reasonable assumption (UNVERIFIED): judges include the host founders (Terse, AgentRelay), sponsor reps (OpenAI, Supabase, Mastra, Freestyle, Superserve) and possibly a YC partner, given the guaranteed YC interview. **Action item:** check the Luma/Partiful invite or Discord on the morning of the event for the judge list and rubric. Talk to sponsor booths early: sponsor-prize judges usually decide in person.

### Builderbase judging (VERIFIED from Builderbase help center)
- Judges log into a **judging portal** and see assigned submissions (description, demo video, links). They score against a rubric, and the platform auto-ranks.
- Sample rubric (they recommend 4–6 criteria, 1–5 each):
  1. **Innovation & creativity**: novel approach.
  2. **Technical execution**: does the prototype work, code quality, completeness.
  3. **Impact & viability**: real-world relevance, further potential.
  4. **Presentation**: story clarity, demo, Q&A.
- In async review, teams submit a **2–5 min demo video**, and judges are told to watch the full video before scoring.
- **Implications:** (a) the Builderbase submission (description, repo link, **backup demo video**) matters even with live demos. Write the description so it lands with a judge who skims it. (b) Name each sponsor tool and *where* it's used in the description, since sponsor-prize judges will search for it. (c) Record the backup video around 3:30pm.

Sources: https://intercom.help/builderbase/en/articles/14831464-hackathon-playbook-ch-15-judging-rubrics · https://intercom.help/builderbase/en/articles/14831460-hackathon-playbook-ch-08-setting-up-builderbase · https://builderbase.pages.dev/

---

## 7. Winning Patterns (5-hour, live-demo, sponsor-heavy SF hackathons)

Evidence is mostly heuristic. Few recent SF agent-hackathon winner write-ups have detail.
- **Recent comparable winners:** YC x Medplum Agentic Healthcare Hackathon (Aug 2026). 1st "Lamina", a LinkedIn-style network for healthcare AI agents (an *agent-to-agent network*, i.e. the same thesis as Agent Relay). 2nd "CareLoop", a pre-visit **voice** agent. Agent networks and voice both placed. https://www.medplum.com/blog/yc-medplum-hackathon-2026-recap
- YC-hosted "Call My Agent" (May 2026) and a voice-agents hackathon also offered a guaranteed YC interview, which shows voice and agents are YC's favored categories (winners not published; UNVERIFIED).

**Patterns that win (synthesized from judge/organizer guides):**
1. **Demo over slides.** The best demo beats the best code. A simpler project judges *understand* beats a strong confusing one (JetBrains judge interviews, 2026).
2. **Wow within 30 seconds; full arc in about 2 minutes.** Problem in one line, live demo for most of the time, one architecture slide, sponsor callouts.
3. **Make the AI physical/visible.** Agents shown as avatars/cards that light up when they talk to each other, live message lines between them, VMs booting, a URL going live. Invisible backend magic doesn't score.
4. **Audience participation** = real-time multiplayer proof. Judges scan a QR code, join the room on their phones, and their presence or input changes what the agents do. That proves "multiplayer" and "scale" at once.
5. **Live voice** is a reliable wow when it works. Have a typed fallback.
6. **Hardcode the happy path.** Judges penalize a demo that never reaches its punchline, not cached calls. Pre-warm VMs, pre-snapshot dependencies (`npm install` done), keep a recorded backup.
7. **Sponsor depth over breadth for side prizes.** One *meaningful* use of Durable Actors and Agent Relay (iPhone + Mac Mini + "bonus if both") beats shallow use of 7 tools. Sponsor tools still count for the overall prize if they're load-bearing.
8. **Durability demo:** kill a process or refresh the page mid-run and show the agents continue and state survives. That's the Durable Actors money shot.

Sources: https://blogs.reskilll.com/hackathon-demo-presentation-tips-pitch-3-minutes-win-2026/ · https://www.hackerearth.com/blog/10-tips-win-hackathon · https://blog.jetbrains.com/ai/2026/06/how-to-win-a-hackathon-notes-from-the-judging-table/ (403 on fetch; summary from search snippet) · https://dev.to/jsb-securedme/what-ai-hackathon-winners-actually-have-in-common-1kla

---

## 8. Halloween Angle

- The hackathon is *named* Haunted Hacks on Oct 31, so a light theme costs nothing and makes the demo memorable among ~N similar agent demos. It also gives a free narrative vocabulary that maps onto the tech:
  - **Durable Actors = ghosts**: they "haunt" a room forever, survive restarts ("you can't kill what's already dead"), wake on alarms.
  - **Agent Relay = séance / spirit board**: agents whispering to each other, visualized as a Ouija-style message board.
  - **Freestyle/Superserve VMs = haunted houses** the ghosts possess. Hibernate = "sleeping in the crypt", fork = "splitting souls".
  - Voice (OpenAI Realtime) = "summoning" with a spooky voice persona.
- Keep the theme **cosmetic** (copy, colors, avatars, voice persona). The product pitch must still be a real, YC-interview-worthy use case (e.g., "multiplayer software factory"), since the overall prize carries a YC interview and judges will weigh viability. Themed rubric credit is UNVERIFIED. No evidence found that theming is scored.

---

## 9. Stack Recommendation

### Concept: "Séance", a voice-summoned, multiplayer haunted software factory
A room (shareable URL/QR) where people speak or type an app idea. A crew of ghost agents (Planner, Builder, Critic/Tester) **talk to each other over Agent Relay**, live as **Durable Actors**, write and run code in a **Freestyle VM**, and the app goes live on a public `*.style.dev` URL. Everyone in the room watches in real time, and their votes/requests steer the agents.

### Component map (load-bearing first)
| Layer | Tool | Prize hook | Must/Nice |
|---|---|---|---|
| Agent state, room state, long-running loop, alarms, survives restarts | **Terse Durable Actors** | iPhone + bonus | MUST |
| Agent↔agent messaging (Planner→Builder→Critic), visualized | **Agent Relay** | Mac Mini + bonus | MUST |
| Brains (planner/worker), voice summoning | **OpenAI** `gpt-6.1-sol` planner, `gpt-6-luna`/`terra` workers, `gpt-realtime-2.1` via `RealtimeAgent` | Overall ($5k) | MUST (text); voice = SHOULD |
| Code execution + live app URL | **Freestyle** VM + `tls.rules` → `*.style.dev` | Overall ($10k) | MUST (the "wow") |
| Spectator fan-out, presence, event log, auth | **Supabase** Broadcast + Presence, Postgres event log, anonymous auth | $1k scale prize | SHOULD |
| Agent definitions/tools | **Mastra** agents with a `sendRelay` tool | Top-3 Mastra | NICE (skip if Terse/Relay SDKs already give an agent loop) |
| Parallel forked attempts | **Superserve** fork x3 (or its MCP as a Critic tool) | Overall ($1k) | NICE, stretch only |

### Data flow (one paragraph)
Browser joins room → Supabase Presence (who's here) and the room's Durable Actor (authoritative state). User speaks → OpenAI Realtime (WebRTC, ephemeral secret minted by the actor/edge fn) → transcribed intent → Planner actor. Planner sends tasks over **Agent Relay** to Builder and Critic actors. Builder runs `vm.exec()` on a pre-warmed Freestyle VM (snapshot with deps installed) and exposes port 3000. Every agent step is mirrored to a Supabase **Broadcast** channel `room:{id}` (throttled) and appended to an events table. Spectator UI renders the agent graph, message bubbles, terminal stream and final URL/QR.

### 5-hour scoping (11:00–16:00)
- **11:00–11:30**: accounts/keys for all sponsors, pre-warm a Freestyle VM snapshot with a Vite template plus `node_modules`. Confirm the judge list and rubric.
- **11:30–13:30**: core loop. Actor per agent, Relay messages, Builder edits files in VM and serves the URL. Text input only.
- **13:30–14:30**: spectator UI over Supabase Broadcast/Presence (agent cards, live message lines, QR join).
- **14:30–15:15**: voice summoning via `RealtimeAgent`. The durability trick: kill/refresh, agents keep going.
- **15:15–15:45**: Halloween skin, rehearse 2-minute script, **record backup video**, fill in the Builderbase submission (name each sponsor + where used).
- **15:45–16:00**: buffer. Cut list in priority order if late: Superserve → Mastra → voice → Supabase load test.

### Demo script skeleton (2 min)
1. (0:00) "Software is built by teams; agents should be too, live, with you in the room." Judges scan QR and appear as ghosts (Presence).
2. (0:15) Speak: "Build me a Halloween costume voting app." Planner ghost replies by voice.
3. (0:30) Agent graph lights up: Relay messages fly Planner→Builder→Critic. Freestyle VM terminal streams.
4. (1:10) Kill the Builder process / refresh. It resumes from its Durable Actor state.
5. (1:30) App goes live at `*.style.dev`, judges vote on their phones, votes flow back through Broadcast.
6. (1:45) One slide: architecture plus a "scale to millions" line (actors sharded per room, Broadcast fan-out, not Postgres Changes) plus the sponsor logos and where each is used.

### Key risks
- Freestyle and Superserve overlap. Don't force both unless Superserve's fork has a clear role.
- Supabase Free tier at 100 msg/s: throttle.
- Realtime voice in a noisy demo room: push-to-talk plus typed fallback.
- Model IDs (GPT-6 family) were verified only via a summarizing fetch of the docs. Confirm in the dashboard before hardcoding.
