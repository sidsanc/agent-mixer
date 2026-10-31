# Product Ideas: "The startup YC would fund"

Lens: a credible company wedge (real buyer, real pain, still matters in a year) where durable actors and agent-to-agent messaging are **load-bearing**, and the idea demos crisply in 2 minutes. Written 2026-10-30, the night before Haunted Hacks. This doc contains no code. Every gotcha cited here comes from `terse-durable-actors.md`, `agent-relay.md` and `sponsors-and-judging.md`.

## The thesis behind the list

Most teams will build one company's agents talking to each other: a software factory, a coding crew, a research swarm. In that setup Relay is a chat bus and the actor is a database, and judges have seen it already (Agent Relay ships Software Garden itself).

The ideas below use a sharper pattern that YC partners and both host teams should care about: **two or more organizations' agents transact over Relay, and a durable actor acts as the neutral, single-writer "notary" for the shared business object (a deal, a case, an incident).**

- **Why actors are essential:** the shared object needs exactly one authoritative instance per ID. It needs serialized writes, so two agents can't both accept, both roll back, or both pay. It needs durable state that survives either party's agent crashing, and timers (alarms) that fire while every party is offline. That is the Durable Objects guarantee, word for word.
- **Why Relay is essential:** the parties are separate companies with separate agents (often from different vendors). They need addresses, a temporary shared room (ephemeral child workspaces, Relay Connect), typed actions, durable delivery and human approval gates. Email and webhooks can't do this, and one company's internal bus is the wrong trust boundary.
- **Why now:** both sides of most B2B workflows got agents in 2026, but those agents have no shared, trusted place to meet. Agent Relay launched public agent addresses and cross-company rooms this quarter.

---

## 1. Ten candidate ideas

**1. Parley: B2B deal rooms where buyer and seller agents negotiate and close.**
- **Buyer and pain:** SaaS renewals and B2B quotes take weeks of email ping-pong between a procurement manager and an AE, both of whom now have agents. Buyers are procurement teams (the Vendr/Zip market) and sales teams (deal desk).
- **Why actors:** one `Deal` actor per deal is the neutral notary. It keeps versioned offers, enforces optimistic concurrency so nobody can accept a stale offer, records approvals, and uses an expiry alarm.
- **Why Relay:** an ephemeral cross-company room per deal, typed `deal.propose` / `deal.accept` actions, and each side's agent on its own channel with its private policy.
- **Wow moment:** both agents accept *different* versions in the same instant. The notary accepts one and rejects the other as "stale v4", live. Then the CFO approves the discount from a phone.

**2. Bridgecall: cross-company incident war rooms ("is it us or the vendor?").**
- **Buyer and pain:** SRE and platform teams lose the first hour of every vendor-caused outage to support tickets. API vendors would pay to deflect those tickets.
- **Why actors:** one `Incident` actor per incident owns the timeline, the hypotheses, a mitigation lease (only one agent may execute a failover) and status-page cadence alarms.
- **Why Relay:** an alert webhook opens a temporary room. Our on-call agent and the vendor's forward-deployed support agent debug together with typed actions.
- **Wow moment:** the vendor agent spots the root cause in its own logs. Two agents race to fail over and the lease grants only one. The status page keeps updating after the laptop lid closes.

**3. Ferry: payer-provider prior authorization, agent to agent.**
- **Buyer and pain:** prior auth delays care for days and costs clinics staff hours per request. Payers face federal API and decision-time mandates (CMS-0057-F, Prior Auth API due Jan 2027; **verify** the exact dates before pitching).
- **Why actors:** one `PACase` actor per request is a regulated state machine. It has a multi-deadline alarm queue (72h expedited / 7-day standard clocks) and an append-only audit log.
- **Why Relay:** the provider's agent and the payer's agent are different organizations. They exchange `pa.submit`, `pa.request_info` and `pa.decide` actions, and a denial routes to a human clinician on a `hold`-style gate.
- **Wow moment:** the payer agent says "missing 6 weeks of PT evidence". The provider agent finds the PT notes in the chart and resubmits, and the case is approved in 40 seconds instead of 2 weeks.

**4. Familiar: a long-lived agent per customer account with a single voice.**
- **Buyer and pain:** CS and RevOps leaders. Support, billing, success and sales agents each email the same customer on the same day.
- **Why actors:** one `Account` actor per customer lives for years. It has signal alarms, a memory of the relationship and a serialized "contact budget" so only one outbound message goes out per window.
- **Why Relay:** the specialist agents coordinate in an account channel, and the account actor is a participant that arbitrates.
- **Wow moment:** three agents try to email a churning customer at once. The actor merges them into one message, and you see the two that got suppressed.

**5. Dockside: freight exception handling across shipper, carrier and broker.**
- **Buyer and pain:** freight brokers on thin margins. One late truck triggers dozens of calls about appointments, detention and re-tendering.
- **Why actors:** one `Shipment` actor per load holds the appointment windows (alarms), detention clock, rate confirmations and a serialized dock-slot ledger.
- **Why Relay:** three companies' agents renegotiate in a temporary room, using typed `slot.reserve` and `rate.amend` actions.
- **Wow moment:** a GPS feed says the truck will be 3h late. In 20 seconds three agents rebook the dock, agree detention terms and notify the driver.

**6. Closeout: month-end intercompany reconciliation.**
- **Buyer and pain:** controllers at multi-entity companies, where intercompany mismatches stall the close for days.
- **Why actors:** one actor per entity ledger (strict serialization and transactions) plus a `Close` actor holding the checklist and deadline alarms.
- **Why Relay:** subsidiary A's agent and subsidiary B's agent negotiate elimination entries, and the controller approves.
- **Wow moment:** a $12,400 mismatch between the two subsidiaries is found, explained and booked with matched entries on both ledgers.

**7. Vouch: security questionnaires answered agent to agent.**
- **Buyer and pain:** GRC teams on both sides. Every enterprise deal stalls on a 300-question vendor security review.
- **Why actors:** one `Review` actor per buyer-vendor pair keeps an evidence ledger, answer provenance, an NDA gate and expiry alarms for evidence.
- **Why Relay:** the vendor publishes a forward-deployed trust agent at a public address, and the buyer's agent interrogates it with access control.
- **Wow moment:** a judge's own Claude Code asks our public trust agent questions. Unknown agents are refused, and after an NDA action is signed the evidence unlocks.

**8. Subro: insurer-to-insurer subrogation settlement.**
- **Buyer and pain:** P&C carriers, where inter-carrier recovery after an auto claim takes months through arbitration forums.
- **Why actors:** one `Claim` actor per inter-carrier claim holds the liability-split negotiation, an evidence ledger and statute-of-limitations alarms.
- **Why Relay:** two carriers' agents negotiate fault percentages, escalating to human adjusters.
- **Wow moment:** a 70/30 liability split is negotiated from a police report and photos, with both carriers' ledgers matching.

**9. Gavel: live reverse auctions where supplier agents bid on RFQs.**
- **Buyer and pain:** manufacturing and indirect procurement. RFQs take weeks and suppliers' quotes are stale by the time they arrive.
- **Why actors:** one `Auction` actor is the auctioneer. It serializes bids, enforces bid increments and anti-sniping extension, and closes the auction with an alarm.
- **Why Relay:** N supplier agents (from different vendors) receive the RFQ and bid with a typed `auction.bid` action, and humans can jump in.
- **Wow moment:** judges' phones join as human suppliers against agent suppliers, and the leaderboard updates in real time. The anti-sniping alarm extends the close on stage.

**10. Notary: the neutral settlement layer for agent-to-agent commerce (horizontal).**
- **Buyer and pain:** any platform whose users' agents transact, such as marketplaces and agent frameworks. No neutral "escrow plus contract state" exists between agents.
- **Why actors:** generic per-transaction notary actors with versioned terms, signatures, escrow state and timeouts.
- **Why Relay:** it is distributed as Relay typed actions, so any agent on any vendor gets `notary.*` tools via MCP.
- **Wow moment:** two arbitrary agents (Claude Code and Codex) close a toy trade using auto-generated MCP tools, with no integration code.

---

## 2. Scoring

1–5 each. "Feasibility" means solo-ish in 5 hours given the gotchas: actors can't hold sockets past 10s of idle, `@Interleave` kills transactions, Relay harnesses and Connect are limited on Windows, and both SDKs churn between versions. "Track coverage" counts Terse, Relay, Supabase, OpenAI, Freestyle and Mastra hooks that are *load-bearing*.

| # | Idea | Innovation | Feasibility (5h) | Impact / fundability | Demo-ability | Track coverage | Differentiation | **Total /30** |
|---|---|---|---|---|---|---|---|---|
| 1 | **Parley** (B2B deal rooms) | 5 | 4 | 5 | 5 | 5 | 5 | **29** |
| 3 | **Ferry** (prior auth) | 4 | 4 | 5 | 4 | 4 | 5 | **26** |
| 2 | **Bridgecall** (cross-co incident) | 4 | 4 | 5 | 5 | 5 | 3 | **26** |
| 9 | Gavel (live reverse auction) | 4 | 4 | 3 | 5 | 5 | 4 | 25 |
| 5 | Dockside (freight exceptions) | 4 | 3 | 4 | 4 | 4 | 5 | 24 |
| 10 | Notary (horizontal layer) | 5 | 3 | 4 | 3 | 5 | 4 | 24 |
| 4 | Familiar (per-customer agent) | 3 | 4 | 4 | 3 | 4 | 4 | 22 |
| 7 | Vouch (security questionnaires) | 3 | 4 | 4 | 3 | 4 | 4 | 22 |
| 8 | Subro (insurer subrogation) | 4 | 3 | 4 | 3 | 3 | 5 | 22 |
| 6 | Closeout (intercompany close) | 3 | 3 | 4 | 2 | 3 | 4 | 19 |

Notes on the scores:
- **Bridgecall** has the same total as Ferry but lower differentiation. A "cross-company incident war room" is already on Agent Relay's own idea list, and incident.io/Rootly ship AI SRE. It ranks in the top 3 because the judges are infra founders who feel this pain personally.
- **Gavel** is the most multiplayer and Supabase-friendly, but its fundability is weaker (reverse auctions are an old category). Its "judges bid from phones" mechanic can be grafted onto Parley as a multi-seller mode if time allows.
- **Notary** is the end-state of Parley, not a demo. Use it as the "where this goes" line in Parley's pitch.

**Top 3: Parley, Ferry, Bridgecall.** All three share about 70% of their architecture (a notary actor, interleaved agent actors, a Relay bridge, a per-case ephemeral workspace). Picking any one of them de-risks a late pivot to another.

---

## 3. Deep dives

### Shared architecture decisions (apply to all three)

1. **Split consistency from intelligence.** `@Interleave` on any method disables `db.transaction` and rollback for the whole class.
   - The **notary actor** (Deal / PACase / Incident) is non-interleaved: no LLM calls, no awaits on external I/O, transactions allowed.
   - The **agent actors** (Negotiator / ProviderAgent / Responder) are `@Interleave` and make the LLM calls.
2. **A Relay bridge process, not Relay sockets inside actors.** Actors go dormant after 10s idle, and actor-to-actor calls on hosted Terse are UNVERIFIED. One small Node 22 process (the "bridge") handles all of it:
   - holds the Relay SDK connection and `addListener('message.created')`;
   - registers typed actions with `relay.registerAction`, whose handlers call the notary through the generated Terse client;
   - forwards inbound messages to the correct agent actor's RPC, which wakes it;
   - lets agent actors post back to Relay via REST from their interleaved methods (or by returning text the bridge posts).

   Fallback if the bridge is flaky: Relay outbound webhooks (`POST /subscriptions`, HMAC-signed) to a tiny HTTP handler that calls the actors.
3. **One ephemeral Relay child workspace per case.** Use `RelayCast.createWorkspace(name, { apiKey: parent, expiresInSeconds: 3600 })`. This maps one-to-one onto the notary actor ID and is our Windows-safe stand-in for Relay Connect, which is macOS/Linux only. Agent names are made unique per case (`acme-<dealId>`) because registration is create-only. Tokens are stored in `@Persisted` fields on the agent actors.
4. **Persistence budget.** A durable write costs about 85 ms at p95.
   - Persist once per *turn* (offer, decision, timeline entry), never per token.
   - Stream LLM text to the UI through `broadcast()` (in memory) and persist the final text once.
   - Reassign arrays (`this.x = [...this.x, y]`); never use `.push()`.
5. **UI sync for free.** The notary's key fields are `@Emittable`. The browser gets a WebSocket grant from our backend (`prepareWebsocket`), and `state` / `state_update` messages drive the main panel. The Relay **observer link** (`ot_live_`) goes on the second screen as proof of real agent traffic.
6. **Pin versions.** Pin `terse-cli`/`terse-sdk` 0.14.9, `agent-relay` 14.0.0 and `@agent-relay/sdk` 14.x. Never use `15.0.0-next`. Run Node 22 for Relay and Bun ≥ 1.4.2 for Terse. If the `terse` CLI misbehaves on native Windows, use WSL2 (install tooling tonight; writing code before the event is not allowed).
7. **Model choice.** Use `gpt-6.1-sol` for the negotiation and decision agents and `gpt-6-luna` for summaries and checkers. Structured JSON outputs only. Confirm the model IDs in the dashboard at 11:00.

---

### Deep dive #1: Parley (B2B deal rooms for agents)

#### Architecture

**Terse actors**

| Actor (ID) | Mode | State it owns | Methods / hooks |
|---|---|---|---|
| `Deal` (`deal-<id>`) | **Non-interleaved** (the notary) | `@Persisted @Emittable` fields: `status` (open, countered, pending_approval, agreed, expired), `currentVersion`, `currentTerms` (seats, price/seat, term, payment terms, SLA credits), `parties`, `agreedHash`. SQLite `offers` table: version, party, base_version, terms JSON, rationale, hash, ts (append-only). `approvals` table: version, approver, ts. `idempotency` table. Relay workspace metadata. | `propose(party, baseVersion, terms, idemKey)` rejects if `baseVersion !== currentVersion` (optimistic concurrency) and writes inside `db.transaction`. `accept(party, version)` agrees only when both parties have accepted the *same current* version. `requestApproval(party, version, reason)`, `approve(humanId, version)`. `onAlarm()` expires a stale offer and nudges both sides; it is idempotent. |
| `Negotiator` (`acme-<dealId>`, `globex-<dealId>`) | **`@Interleave`** | `@Persisted` fields: private policy (target, walk-away, max discount, approval threshold, priorities), rolling memory summary, Relay `at_live_` token, `turnCount`, `lastSeenVersion`. | `onRelayMessage(msg)` runs the LLM with the policy and current terms and returns a structured decision (counter / accept / request approval / walk away). The bridge then invokes the matching `deal.*` action. `resume()` re-reads Deal state after a crash. |

**Agent Relay** (one ephemeral child workspace per deal)
- **Channels:**
  - `#table` is the shared negotiation channel. Both negotiators post offers and rationale here, and both humans can read it.
  - `#acme-internal` and `#globex-internal` are each side's private back-room: its negotiator, a finance-checker agent (luna) and the side's human approver (`type: human`).
- **Typed actions** (Zod, auto-exposed as MCP tools), registered by the bridge and backed by the Deal actor: `deal.propose`, `deal.accept`, `deal.request_approval`, `deal.get_terms`. Actions are fire-and-forget, so each handler messages the calling agent back ("v5 recorded" or "rejected: stale base v4, current is v5").
- **Observer link** on the projector.
- **Cross-vendor stretch:** Globex's negotiator is a **Claude Code session** on a teammate's Mac, or a harness on a **Freestyle VM**, joined with `relay init --key`. It uses the same `deal.*` MCP tools, which proves that "any vendor's agent can transact here". Freestyle VMs are Linux, which also sidesteps Windows harness limits.

**Sponsor tools**

| Sponsor | Role |
|---|---|
| **OpenAI** | Negotiator brains (`gpt-6.1-sol`, structured outputs) and finance-checker (`gpt-6-luna`). |
| **Supabase** | Postgres is the system of record for *closed* deals (`deals`, `offers_archive`), written once on `agreed`. **Broadcast** fans out spectator events on channel `deal:{id}`. "Scale to millions" story: hot state in sharded per-deal actors, cold state in Postgres, fan-out via Broadcast rather than Postgres Changes, per the Supabase docs' ~3k-subscriber guidance. |
| **Freestyle** (stretch) | Hosts the counterparty's agent "in another company's cloud". |
| **Mastra** | Skip. |

**UI.** One page in three columns:
- Acme's private view on the left, showing its policy and back-room messages.
- The live term sheet in the center, from Deal `@Emittable` state, with per-version diff highlighting and a version timeline.
- Globex's private view on the right.

There is also a phone page reached by QR code with an "Approve 22% discount?" button. The skin is light Halloween: "a parley between two pirate ships", with ghostly versions fading out when they go stale.

#### 2-minute demo script

| Time | Beat |
|---|---|
| 0:00 | **Hook (spoken):** "Every SaaS renewal is six weeks of email between two people who both have AI agents now. Parley is where those agents close the deal, with a neutral, durable notary so nobody gets burned." |
| 0:12 | Click **Open deal: Acme renews 200 seats of Globex**. The Deal actor is born, a Relay room spins up and the observer link goes live on screen 2. Each side's private policy shows in its pane (the other side can't see it). |
| 0:25 | **Live negotiation.** Offers stream into `#table`, and the center term sheet ticks v1 → v2 → v3 → v4 with diffs (price/seat, term length, payment net-30 → net-45). In the back-rooms you can see Acme's finance-checker say "within budget". |
| 0:50 | **The race.** Press "Haunt: simultaneous accept". Both negotiators fire `deal.accept` on different versions in the same instant. The notary serializes them: "Acme accepted v5 ✓ · Globex accept of v4 rejected: stale." Line: "One instance per deal, one write at a time. No double-closes, ever." |
| 1:05 | **The kill.** Hard-kill the bridge process (or redeploy the actor) mid-turn. The UI socket stays up because the gateway holds it while the actor is dormant. Restart, and the Globex negotiator resumes with "Last offer was $41.20/seat on v5, countering." Nothing is lost. |
| 1:20 | **Human gate.** Globex's agent wants a 22% discount, over its 18% policy, so it posts `deal.request_approval` to `#globex-internal`. A judge scans the QR code and taps **Approve**, and the approval lands in the notary's ledger with a timestamp. |
| 1:35 | **Close.** Both agents accept v7. The status flips to **AGREED**, both panes show the identical agreed hash, the deal is archived to Supabase and a one-page order-form summary is generated. |
| 1:45 | **Architecture slide (10s).** Per-deal Terse actor = notary · Relay room + typed actions = the wire · OpenAI = negotiators · Supabase = record and fan-out. "Next: the clearing layer for agent-to-agent commerce." |

Pre-seed the deal and policies so the negotiation converges in 6–8 turns. Keep a "scripted mode" toggle that replays cached LLM decisions in case the venue Wi-Fi or the API fails.

#### 5-hour build schedule (11:00–16:00)

| Time | Work | Done when |
|---|---|---|
| 11:00–11:30 | Pinned installs. `terse init` from the counter template and deploy a hello actor. Create the Relay workspace and get the bridge to send one message. Confirm OpenAI model IDs and add the secret with `terse secrets add OPENAI_API_KEY`. Create the Supabase project. Read the judge list. | A hosted actor responds, and a message shows up in the observer link. |
| 11:30–12:30 | **Deal actor:** offers table, `propose` / `accept` with version checks, approvals, expiry alarm, `@Emittable` fields. Test with a script using the generated client, including the concurrent-accept race. | The race test rejects the stale accept. |
| 12:30–13:45 | **Negotiator actor** (`@Interleave`, policy, structured output, turn cap 10) plus the **bridge** (listener, `deal.*` actions, message-back, routing to actors). Eat lunch at the keyboard. | Two agents negotiate to AGREED end to end in the terminal. |
| 13:45–14:45 | **UI:** term sheet with diffs over the actor WebSocket, the two side panes fed from Relay messages, phone approval page. | The full happy path runs in the browser. |
| 14:45–15:15 | Demo levers: race button, kill/resume (verify `resume()`), approval gate, Supabase archive plus Broadcast. Scripted-mode fallback. | All three wow beats work 3 times in a row. |
| 15:15–15:35 | Halloween skin, architecture slide, **record the backup video**. | The video is saved. |
| 15:35–16:00 | Builderbase submission (name each sponsor and where it is used), rehearse twice, buffer. | Submitted by 15:55. |

**Cut list** (cut in this order if behind):
1. Cross-vendor Claude Code / Freestyle counterparty.
2. Supabase Broadcast spectators (keep only the archive insert).
3. Finance-checker agents in the back-rooms.
4. Phone QR approval (use an on-screen button instead).
5. Expiry alarm.

**Never cut:** the race, the kill/resume and the agreed hash.

#### Top risks and mitigations

| Risk (from research) | Mitigation |
|---|---|
| `@Interleave` disables `db.transaction` for the whole class | The Deal notary never awaits external I/O and makes no LLM calls. All LLM work happens in Negotiator. |
| Dormant after 10s idle, `@Ephemeral` state lost | Nothing important is ephemeral: memory, policy and token are `@Persisted`. Relay sockets live in the bridge, not the actor. Optionally use `@Compute({ idleTimeoutMs: 120000 })` on Negotiator for smoother demo latency (but custom compute boots slower, so test it). |
| ~85 ms durable writes, ~334 ms warm-up | One persisted write per turn. Broadcast streamed rationale in memory. Pre-warm actors by calling `get_terms` at 0:00. |
| Actions are fire-and-forget | The handler messages the caller with the result. The negotiation protocol is turn-based anyway, so this fits naturally. |
| Messages arrive between turns (Claude Code / harness sessions) | Applies only to the cross-vendor stretch. Pace the Claude Code side with "send once, end turn". SDK listeners in the bridge receive immediately. |
| Windows: no native harness runtime, Relay Connect is mac/Linux-only, no Python wheels | Use the TypeScript SDK only on Windows. Ephemeral child workspaces replace Connect. Any harness runs on a teammate's Mac or a Freestyle VM. |
| Registration is create-only (409) | Per-deal unique names. Persist `at_live_` tokens in the actor. Reconnect with `workspace.reconnect`. |
| Version churn (Terse ships several releases a day, Relay is on 15-next) | Pin everything at 11:00 and follow the files the `terse init` template generates, not the README (`terse-sdk/actor` vs `durable-actors`). |
| LLM negotiations don't converge or ramble | Policies with overlapping zones of agreement, turn cap, structured outputs, a temperature-low "concede step" rule, scripted fallback. |
| Hosted actor-to-actor calls UNVERIFIED | All cross-actor calls go through the bridge using the generated client. |

#### YC pitch (3 sentences)
Parley is the deal room where companies' AI agents negotiate and close B2B contracts with each other, starting with SaaS renewals. Today a renewal is weeks of email between a procurement manager and an AE who both have agents but no shared, trusted place for those agents to transact. Every deal is a durable, neutral notary that both sides' agents write to, so offers are versioned, approvals are enforced and nobody can accept a stale offer. That makes Parley the natural clearing layer for agent-to-agent commerce.

---

### Deep dive #2: Ferry (prior authorization, agent to agent)

#### Architecture

**Terse actors**

| Actor (ID) | Mode | State | Methods / hooks |
|---|---|---|---|
| `PACase` (`pa-<id>`) | **Non-interleaved** (notary + regulatory clock) | `@Persisted @Emittable` fields: `status` (draft, submitted, pended_info, info_provided, approved, denied, escalated), `urgency` (expedited/standard), `dueAt`, `decision`, `missingItems`. SQLite tables: `audit` (append-only, hashed: actor, action, payload, ts), `documents` (references to synthetic FHIR resources), `deadlines` (a queue: payer_decision_due, provider_response_due, status_update_due). | `submit(packet)`, `requestInfo(items)`, `provideInfo(docs)`, `decide(outcome, rationale, reviewer)`. Denials require a human `reviewer` or the call is rejected. `onAlarm()` pops the earliest deadline and escalates or notifies, then re-arms the alarm for the next deadline (one alarm per actor, so the queue lives in a table). |
| `ProviderAgent` (`clinic-<case>`) | `@Interleave` | `@Persisted` fields: Relay token, case memory. Reads a **synthetic** patient chart (a fixture FHIR bundle; no PHI). | Assembles the packet, answers info requests by searching the chart (LLM plus simple retrieval). |
| `PayerAgent` (`payer-<case>`) | `@Interleave` | `@Persisted` fields: medical policy text (e.g., lumbar MRI criteria: ≥6 weeks of conservative therapy, red-flag exceptions), token. | Reviews against the policy and either approves, requests info or recommends denial. A denial goes to the human clinician. |

**Agent Relay:**
- One ephemeral child workspace per case. Channel `#case-<id>`.
- Typed actions `pa.submit`, `pa.request_info`, `pa.provide_info`, `pa.decide`, `pa.status`, all backed by `PACase`.
- The payer's medical director is a `type: human` participant, and denial recommendations wait for that human (mirrors the `crossSessionInbound: hold` idea).
- An observer link for the "regulator's view".

**Sponsors:**
- **OpenAI:** `gpt-6.1-sol` for payer review, `gpt-6-luna` for chart retrieval and summaries.
- **Supabase:** Postgres holds case archives and turnaround-time metrics. Broadcast carries the operations dashboard. The scale story is "every PA in the US is ~one actor-day; actors shard per case, Postgres holds analytics".
- **Freestyle** (stretch): the payer's agent runs in a separate VM to show the organizational boundary.

#### 2-minute demo script

| Time | Beat |
|---|---|
| 0:00 | "Your doctor ordered an MRI. Your insurer will take a week to say yes. Both sides already have AI. Ferry lets them talk directly, with a durable case file that both sides and a regulator can trust." |
| 0:12 | The clinic clicks **Request auth: lumbar MRI**. The PACase actor is born with a 72h expedited clock shown as a countdown, and the observer link goes live. |
| 0:25 | The provider agent assembles the packet from the synthetic chart and calls `pa.submit`. The payer agent reviews it against the policy shown on screen. |
| 0:40 | The payer agent sends `pa.request_info`: "No evidence of 6 weeks of conservative therapy." The status flips to PENDED and the provider-response deadline is armed. |
| 0:55 | The provider agent finds the PT notes from August and September and sends `pa.provide_info`. The payer agent sends `pa.decide: APPROVED`. Elapsed time: about 40 seconds. Every step appears in the hashed audit log. |
| 1:10 | **Clock beat.** Open case #2 and close every browser tab. Press "time-warp" (set the deadline 20s out). The alarm fires while nobody is connected: the payer missed its deadline, so the case auto-escalates. Reopen the tab and the escalation is already in the history. |
| 1:30 | **Denial gate.** On case #3 the payer agent recommends denial. It cannot finalize: `decide` rejects it without a human reviewer. A judge, acting as medical director, taps Deny or Approve on their phone. |
| 1:45 | Slide: case actor = regulated state machine and clock · Relay = the cross-organization wire · CMS mandate as "why now". |

#### 5-hour build schedule
| Time | Work |
|---|---|
| 11:00–11:30 | Same setup as Parley, plus writing the synthetic FHIR fixture and the policy text (do this by hand; no code beforehand). |
| 11:30–12:30 | PACase actor: state machine, audit table, deadline queue plus alarm re-arm, human-reviewer guard. |
| 12:30–13:45 | ProviderAgent and PayerAgent plus the bridge and `pa.*` actions. Happy path end to end. |
| 13:45–14:45 | UI: case timeline, countdown, two org panes, phone reviewer page. |
| 14:45–15:15 | Time-warp alarm beat, kill/resume check, Supabase archive. |
| 15:15–16:00 | Skin, backup video, submission, rehearsal. |

**Cut list:** Freestyle → Supabase dashboard → case #3 denial gate (fold it into case #1) → time-warp. **Never cut:** the request-info round trip and the audit log.

#### Top risks
| Risk | Mitigation |
|---|---|
| One alarm per actor; retry semantics UNVERIFIED | Deadline queue table, always re-arm to the earliest deadline, idempotent `onAlarm` (check status before acting). |
| `@Interleave` vs transactions | PACase never calls the LLM. |
| Dormancy and the "nobody connected" beat | This is a feature: the alarm is stored outside the actor and fires while it is dormant. Rehearse it twice. |
| Judges aren't healthcare people | Open with the patient story (an MRI delay), not CMS rule numbers. Keep the rule as one line on the slide. Use synthetic data only and say so. |
| Regulatory claims | Mark the CMS dates as "per CMS-0057-F" and verify them at 11:00. Don't claim HIPAA compliance. |
| Windows / Relay / version churn | Same as Parley. |

#### YC pitch
Ferry lets providers' and payers' AI agents resolve prior authorizations directly, turning a multi-day fax-and-portal process into a minute-long, fully audited exchange. Federal rules now force payers to expose prior-auth APIs and meet hard decision deadlines, but nobody owns the shared, regulated case file that both sides' agents act on. Ferry is that case file: a durable per-case state machine with legally timed clocks and human-in-the-loop denials, sold per transaction to payers and provider groups.

---

### Deep dive #3: Bridgecall (cross-company incident war rooms)

#### Architecture

**Terse actors**

| Actor (ID) | Mode | State | Methods / hooks |
|---|---|---|---|
| `Incident` (`inc-<id>`) | **Non-interleaved** | `@Persisted @Emittable` fields: `severity`, `status` (detected, investigating, mitigating, monitoring, resolved), `commander`, `mitigationLease` (holder, action, expiresAt), `statusPageText`. SQLite tables: `timeline` (append-only), `hypotheses` (id, author, text, status, evidence), `actions` (idempotency key, executor, result), `cadence` (deadline queue). | `addTimeline`, `proposeHypothesis`, `voteHypothesis`. `claimMitigation(agent, action, idemKey)` grants the lease to exactly one agent and rejects the rest. `completeMitigation`, `postStatus`. `onAlarm()`: if the status page is stale, call the scribe; if no ack, escalate severity. |
| `Responder` (`ours-<inc>`) | `@Interleave` | Token, memory. Fixture logs and metrics for "our" checkout service. | Investigates, proposes hypotheses, claims mitigations. |
| `VendorAgent` (`payco-<inc>`) | `@Interleave` | Token. Fixture vendor-side logs for our account plus the vendor changelog (e.g., an 11:42 regional rollout). | Correlates the customer's errors with vendor-side events, confirms or denies the hypothesis. |
| `Scribe` (`scribe-<inc>`) | `@Interleave` | Token. | Writes status-page updates on cadence and the joint postmortem. |

**Agent Relay:**
- An inbound **webhook** (`POST /webhooks`) from a fake alert posts into `#inc-<id>` and opens the room.
- The ephemeral child workspace is the cross-company room. On a Mac, use real **Relay Connect** as the stretch.
- The vendor agent is pitched as **forward-deployed** at a public `arelay.to/<handle>` address (stretch). The Freestyle-VM broker for always-on forward-deployed agents is officially documented, so the vendor agent can live on **Freestyle**.
- Typed actions: `incident.add_hypothesis`, `incident.claim_mitigation`, `incident.post_status`, `incident.resolve`.
- Observer link.

**Sponsors:**
- **OpenAI:** agents.
- **Freestyle:** the vendor agent's always-on home (a sponsor plus Relay combo that the Relay team endorses).
- **Supabase:** status-page subscribers via Broadcast (the "millions of end users watching a status page" angle) plus a Postgres postmortem archive.

#### 2-minute demo script
| Time | Beat |
|---|---|
| 0:00 | "When Stripe or Twilio breaks, your on-call spends the first hour proving it's not you. Bridgecall puts your agent and your vendor's agent in the same room in seconds." |
| 0:10 | Fire the alert (checkout 5xx at 14%). The webhook triggers the room, the Incident actor is born and the observer link goes live. |
| 0:25 | Our responder posts "errors are all `payco` 503s from us-west" and invites PayCo's agent. The vendor agent joins from "another company" (a Freestyle VM or a second laptop). |
| 0:45 | The vendor agent replies "Correlates with our 11:42 us-west rollout; your account is pinned to us-west." The hypothesis is confirmed by both sides in the actor's table. |
| 1:00 | **Race.** Both our agent and the scribe try to claim "fail over to backup PSP". The lease is granted to one and the other is rejected: "lease held by ours-inc-7". Only one failover executes, and the error graph drops. |
| 1:15 | **Lid close.** Close every tab. The status-page cadence alarm fires on schedule and posts an update that judges' phones receive via Supabase Broadcast. |
| 1:30 | Resolve. The joint postmortem, with both companies' timelines merged from the actor, appears in 5 seconds. |
| 1:45 | Slide plus pitch. |

#### 5-hour build schedule
| Time | Work |
|---|---|
| 11:00–11:30 | Setup. Write the fixture logs, metrics and vendor changelog by hand. |
| 11:30–12:30 | Incident actor: timeline, hypotheses, mitigation lease, cadence alarm queue. |
| 12:30–13:45 | Three agent actors, the bridge, actions, webhook-to-room. |
| 13:45–14:45 | UI: timeline, hypothesis board, lease indicator, fake error graph, phone status page. |
| 14:45–15:15 | Freestyle-hosted vendor agent (stretch), Supabase Broadcast status page. |
| 15:15–16:00 | Skin, video, submission, rehearsal. |

**Cut list:** Relay Connect / forward-deployed address → Freestyle → Supabase phone status page (show it on screen instead) → Scribe (template the postmortem). **Never cut:** the vendor-side root cause and the lease race.

#### Top risks
| Risk | Mitigation |
|---|---|
| Differentiation: incident war rooms are on Relay's own idea list, and AI-SRE tools exist | Hammer the **cross-company** angle and the mitigation lease. Never pitch it as "an AI SRE". |
| Relay Connect and forward-deployed addresses are mac/Linux-oriented and new | Ephemeral child workspace by default. Connect only from a teammate's Mac. |
| Webhook inbound shape UNVERIFIED | Fallback: the bridge posts the alert message itself. |
| Lease expiry timing vs 85 ms writes and alarms | Use a lease TTL of about 20s. Check expiry lazily on each `claimMitigation` call rather than relying on the alarm. |
| `@Interleave`, dormancy, churn, Windows | Same mitigations as Parley. |

#### YC pitch
Bridgecall is the incident bridge between companies: when a vendor's outage hits you, your on-call agent and the vendor's support agent investigate together in a shared, durable war room within seconds. Today the first hour of every third-party incident is wasted on tickets and status-page refreshing, and every company now depends on dozens of APIs. Vendors pay us to deflect support load and customers pay to cut MTTR, and every resolved incident leaves a joint postmortem that neither side could write alone.

---

## Recommendation

**Build Parley.**
- It has the cleanest "why actors" story: optimistic-concurrency accept, a neutral notary and a durable expiry. That is exactly the multi-agent coordination without data races the Terse founders pitch.
- It has the cleanest "why Relay" story: two companies, a temporary room, typed actions and human gates. That is Relay's cross-company thesis, and it is not one of their existing showcases.
- Its buyer is obvious to a YC partner in one sentence, and the three wow beats (race, kill/resume, phone approval) each take under 15 seconds.
- Keep Ferry as the pivot if the judge list skews healthcare or YC-partner-heavy. Its architecture is about 70% shared.
