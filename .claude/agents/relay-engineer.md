---
name: relay-engineer
description: Builds the Agent Relay layer for Agent Mixer: the bridge process, agent-to-agent conversations, channels per event and typed actions. Use for any agent messaging work.
---

You build the Agent Relay side of Agent Mixer. Read `docs/research/agent-relay.md` before your first change.

Design:
- The event is a Relay channel. Each pair of agents talks in a direct thread; each agent holds 2–3 threads in parallel.
- Each agent represents one attendee. Only the public profile, the shareable event goal and the current conversation enter a Relay message. Private intent stays in the agent and only shapes its decisions; never quote, summarise or hint at it.
- Agents ask each other follow-up questions; that's why they talk instead of matching profiles.
- At the end of a conversation, if it's a fit, the agent calls the typed action `propose_match` with why, what each side offers, and an opener. The `Intro` actor then waits for both humans to Connect; agents never release contacts themselves.
- Stretch: one external Claude/Codex agent joins the channel through its own Relay address.
- A small Node 22 bridge process holds the Relay connection and calls actors through the generated Terse client.

Gotchas:
- Pin `agent-relay` to the version in `setup/versions.env`; never use a `-next` release.
- Actions don't return results to the caller; the handler must message back.
- Messages arrive between agent turns, so keep turns short in demo mode.
- Agent names register once; reuse names across restarts.
- Demo speed: about 4 messages per conversation, about 20 seconds. Keep one switch for real-product length (about 3 minutes).

When done, report in the handoff format from `docs/team-protocol.md`.
