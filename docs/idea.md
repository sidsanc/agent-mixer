# Siddhant's idea: agents network at events for you

> **Status (2026-10-31):** this is the idea the team is building. The source of truth is now `docs/brief.md` (Julius's brief plus review decisions): one event, QR sign-up with name, role and goal, parallel demo-speed conversations, humans choose Connect/Pass, a meeting card with Meet now, and planted partners for every role. Where this file disagrees with the brief, the brief wins. Earlier refinements from Siddhant's call (some now superseded):
> - It's a **platform of events** like Partiful/Luma, not one event with rooms. Each "room" is its own event.
> - **Sign-up via QR**, like creating a Partiful/Luma account, with an agent name ("Shimo" for Siddhant, his "mirror").
> - **Cartoon party view:** agents walk over to each other, and hovering an agent shows basic info ("He is an investor").
> - **10–12 preset demo profiles** (most in the main event); ideally every user sets up their own agent.
> - Contacts exchanged by mutual consent are **saved for follow-up later**. "Go meet now" applies only when both are at the same place.
> - The agent **self-improves** with more conversations (future scope).

## Team setup (how we'll build it)
- **Machines:** two Macs. Julius's Mac is set up with `./setup/mac.sh --role product`; Siddhant's (his sister's) with `./setup/mac.sh --role engineer`. The Windows PC isn't used.
- **Repo:** everything lives in the `agent-mixer` GitHub repo: setup scripts, Claude config, subagents, docs. Clone it and run one command; see `README.md`.
- **Claude on both Macs:** the same project `CLAUDE.md`, gstack, design skills (impeccable, taste-skill, Emil Kowalski's skills), the frontend-design plugin, and 7 subagents:
  - Product (Julius): `product-designer`, `seed-profile-writer`, `pitch-writer`
  - Engineering (Siddhant): `actor-engineer`, `relay-engineer`, `frontend-builder`, `demo-qa`
- **Sync between the two Claudes:** Linear is the shared board (Linear MCP in `.mcp.json`; rules in `.claude/skills/linear-sync/`). GitHub carries files. Optionally, both Claudes also join one Agent Relay workspace on the day, so we can say we built it with two Claudes talking over Relay.
- **Rule:** no app code before Oct 31, 11:00. Setup, docs, designs and content are fine.

Sources: whiteboard photo, two voice notes (Hindi/English, transcribed with Whisper large-v3), and the written description.

## The idea as described
- **Join:** you scan a QR code and an agent spins up on your behalf (whiteboard example: agent "Shimo" representing Siddhant). It's loaded with your name, skills (AI, ML, backend, frontend…), background, resume, interests and an agenda ("I'm X, I want to meet Y": founder→investor, investor→founder, engineer→founder for a job).
- **Rooms:** the event has preset breakout rooms such as Frontend, Sales, Founders, Marketing/GTM, AI, Infra, VC/Investors and Family Offices. Each room has a preset capacity of 10 or 20. You pick a room, or your agent picks based on your agenda.
- **Speed-networking:** inside a room, agents pair up (10 agents = 5 pairs), talk for about 1 minute, then rotate randomly to a new partner. A "change room" option moves an agent to another room.
- **Live view:** the phone app shows your agent moving around the room, with lights showing who is talking to whom (green/yellow). You can read the conversations live. Interrupting or steering your agent is future scope.
- **Note-taker:** when the rounds finish, your agent returns a full note: "I met A, B and C. Go meet this person." When two agents match, both owners get the other's details.
- **Demo seeding:** preset about 10 profiles per room (about 20 for two rooms), plus real people scanning in live. There's an admin panel for the event creator.
- **Vision:** "Partiful/Luma for agents." Your agent can attend many meetups at once, follow up, and report back the connections worth your time.

## Fit with the event (my assessment)
| Criterion | Score | Notes |
|---|---|---|
| Innovation | 4 | Agent matchmaking exists (e.g. Boardy), but an agent mixer running live at the event you're standing in is fresh |
| Feasibility in 5 hrs | 4 | Fewer moving parts than Poltergeist. Mainly needs prompts good enough that conversations look smart, not noisy |
| Impact / fundability | 4 | Clear buyer: event organizers (Luma/Partiful hosts, conferences, YC-style mixers) paying per attendee for pre-matched intros |
| Demo-ability | 5 | The judges are the users. Its own audience demos it |
| Track coverage | 5 | Durable Actors, Agent Relay, Supabase scale story and OpenAI all fit naturally (below) |
| Differentiation | 3 | "AI networking/dating agents" is a common hackathon idea. The refinements below are what lift it |
| **Total** | **25/30** | In range with Parley (29) and Poltergeist (25), and the strongest audience moment of all |

## Why actors and Relay are essential, not bolted on
| Piece | Primitive | Why |
|---|---|---|
| `Attendee` actor (one per person/QR) | One instance per ID, `@Persisted` profile, notes and matches, `@Emittable` to the phone | Your agent's memory survives you closing the app; the phone reconnects to the same agent |
| `Room` actor (one per room) | Serial single-writer roster, **alarm drives the 60-second rotation**, broadcast of pairings | Pairing must be race-free (nobody in two pairs). The clock keeps ticking with every phone closed |
| `Intro` / match actor (one per pair) | Notary pattern borrowed from Parley: double opt-in, exactly-once | Contact details are released only when **both** agents accept; one-sided or duplicate intros are rejected |
| `Event` actor | Admin: rooms, capacities, start/stop | One source of truth for the organizer panel |
| Agent conversations | **Agent Relay**: each room is a channel, each pair talks in a DM/thread, typed actions `propose_intro` / `accept_intro` | Agents talk directly to each other, the core Relay pitch |
| Bring your own agent | Relay public agent addresses | Someone points their own Claude Code/Codex agent at the event and it networks alongside ours (mixed vendors, the Relay founders' favorite story) |

LLM calls stay out of `Room` and `Intro` (non-interleaved). Agent turns run in `@Interleave` attendee actors or in the Node Relay bridge, and persist once per turn.

## Refinements I recommend
1. **Make the output real-time and physical.** Don't just send end-of-night notes. Push "Go meet Priya now, she's by the stage; opener: she's hiring infra engineers and you built X at AWS." That fits the "Real-Time AI" theme.
2. **Double opt-in intros as the hero mechanic.** This is the Durable Actors showcase (exactly-once, race-free) and the privacy answer judges will ask about.
3. **Judges are the demo.** Put a QR on the demo screen. Judges scan, give a 20-second profile (paste a LinkedIn URL, or speak it via OpenAI Realtime as a stretch goal) and drop into a room with 20 seeded agents. By the end of the 2-minute demo, two real judges get pinged to meet each other.
4. **Persistence beat as a surprise, not the premise.** A judge closes their phone mid-round and reopens it: their agent kept networking and the notes are there. We redeploy mid-demo and the room clock never stops.
5. **Show the agent conversations live** on the big screen, with a room map and pair lines from the whiteboard sketch, so it doesn't look like a black box.
6. **Wedge for the YC pitch:** sell to event organizers first. They have the attendees and the pain ("people leave without meeting the right 3 people"), and it expands to agents attending events you can't.

## Siddhant's clarifications (confirmed understanding, added detail)
- **Positioning:** "Moltbook is social media for agents; this is events and meetups for agents."
- **Rooms are events:** like browsing a Partiful/Luma list, you pick events by their description. People of the same or different backgrounds attend.
- **Approval:** event creators approve or reject agents joining. Bypassed for the hackathon; later step.
- **Memory and follow-up are the core problem:** after real events you collect LinkedIns and forget names and conversations. Your agent keeps track of whom it met and what was said, and shares that in a post-meetup summary.
- **The agent learns you:** you talk to your agent on your phone. The more you tell it, the better it represents you, so it improves over time.
- **Conversation openers:** the agent's notes give you an opener for the in-person meeting.
- **Future scope:**
  - Your agent attends many events at once.
  - At a real in-person event, you start the agent on your phone and connect with other people's agents via NFC tap.
  - Event-creator approval flow.

### What this changes
- **The pitch becomes "never lose an event connection again."** The problem is follow-up and memory, not just matching. That's sharper than "AI networking", and it's the clearest difference from matchmaking products like Boardy.
- **Per-attendee actor memory becomes the star feature:** the full history of whom the agent met and what was said, kept forever. It's a natural Durable Actors showcase (one actor per person, its own SQLite).
- **Wording:** say "represents you", not "impersonates you". Agents should disclose that they're agents, and contact details are shared only with both sides' consent.

## Open questions
- Team size tomorrow, and who owns frontend vs agents vs actors?
- Laptop: Agent Relay harnesses are limited on Windows. Is a Mac or Linux box available, or should agents run in Freestyle?
- Profile intake: form, LinkedIn paste, resume upload, or voice?
- Name (working: "Mixer", "Séance Mixer", "Shimo")?
