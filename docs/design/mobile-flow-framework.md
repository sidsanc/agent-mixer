# Agent Mixer mobile web app — framework preview

This is the complete clickable mobile product prototype, styled in the chosen **Vice City Social** visual direction, with a fast path suitable for the hackathon demo. The live Agent screen embeds the animated venue world where agents roam and speak above their heads; complete transcripts live behind Chat logs.

## Demo event fixture

The prototype is set at **Haunted Hacks: Real-Time AI Edition**, an in-person YC event in San Francisco on October 31, 2026. Terse and AgentRelay host the event. The demo goal, agent conversations, and technical match emphasize durable actors plus agent-to-agent communication so the story demonstrates both sponsor platforms.

## Product structure

The returning-user product has four primary areas: **Events, Agents, Matches, and Chats**. Integrations and privacy controls live under the user profile. The preview now includes the complete onboarding and relationship path, not only destination screens.

## Golden path

1. **Event introduction** — open the Haunted Hacks link, understand what the agent does, and continue with Google.
2. **Event goal** — confirm one shareable sentence, optionally add private intent, and say whether the human is onsite or agent-only.
3. **Choose agent** — select one existing long-lived agent or create a new one. Exactly one agent represents a user per event.
4. **Create agent** — choose manual setup, profile import, or an event-scoped external Agent Relay agent.
5. **Import sources** — LinkedIn, GitHub, personal website, and résumé/PDF are private raw inputs.
6. **Review knowledge** — explicitly approve public facts; keep source files, preferences, and sensitive context private.
7. **Ready to join** — review representative, shareable goal, private intent, attendance, and conversation limits.
8. **Agent World** — watch parallel one-to-one conversations; the only live intervention is End conversation.
9. **Match proposal** — inspect fit, mutual offers, evidence, and suggested opener.
10. **Double opt-in** — Connect releases nothing until the other human also connects; Pass remains reversible.
11. **Human connection** — after both connect, open private human chat and reveal the suggested opener.
12. **Choose meeting path** — Meet now and Schedule later are separate actions.
13. **Meet now** — onsite only; request, accept, reveal meeting point and identification, then mark arrival. No calendar event.
14. **Schedule later** — create a normal Google Calendar invitation and mirror its sent, accepted, declined, new-time, or cancelled state.
15. **Event recap** — review conversations, matches, meetings, follow-ups, and proposed memories before saving them.

## State and privacy rules

- The event goal is temporary event context. It does not overwrite the long-lived agent profile.
- Private intent and private knowledge may influence decisions but may never be quoted, summarized, paraphrased, implied, or sent to another agent.
- Imported material is private by default. A generated public profile is only a proposal until the user approves each field.
- Agent matches can appear while agents are still talking. Human chat exists only after both people choose Connect.
- A one-sided Connect shows `Waiting for the other person`; it reveals no contact details.
- `Meet now` is available only when both humans are onsite and requires a second acceptance.
- `Schedule later` delegates RSVP, rescheduling, cancellation, reminders, and event records to Google Calendar.
- Agent-only attendance skips onsite actions but retains Agent World, matches, human chat, and scheduling.

## Required non-happy states

- No existing agent: make `Create a new agent` the primary path.
- Import fails or is skipped: allow lightweight manual setup.
- Source contains questionable public facts: leave them private and ask for explicit approval.
- No match yet: show current conversations and explain that the agent is still exploring.
- One-sided Connect: keep the introduction pending with an undo action.
- Passed match: keep it recoverable under Passed.
- Meet now declined or expired: return to human chat and offer Schedule later.
- Calendar disconnected: request Google Calendar permission only when the user chooses Schedule later.
- Browser closes: restore the event and conversations from durable state when the user returns.

## Implementation requirement: chat is functional

The chat surfaces in this design are not illustrations, screenshots, or pre-rendered animations. The shipped demo must run real interaction:

- Agent-to-agent messages arrive through Agent Relay and stream into the visible transcript.
- Multiple conversations can remain active at the same time, with each transcript retaining its own state.
- Chat history tabs open the actual stored conversation for that agent.
- `End conversation` stops the selected live conversation.
- Human chat unlocks only after both people choose Connect.
- A human can type and send a message; the other participant receives it and the message remains after refresh.
- Loading, reconnecting, empty, failed-send, and ended states must be rendered as product states rather than baked into artwork.

The GTA-style venue and characters are the visual shell around the live system. They must never replace the working chat, transcript, double opt-in, or meeting flows.

1. Home and active events
2. Multiple long-lived agents
3. Public and private knowledge
4. Event welcome
5. Per-event setup
6. Live agent conversations
7. Matches inbox and statuses
8. Match decision
9. Chats inbox and unread states
10. Human chat
11. Meet now or schedule
12. Event recap and follow-up
13. Integrations and privacy

## Core event path

1. **Event welcome** — explains the product before asking the attendee to join.
2. **Per-event setup and presence** — selects exactly one long-lived agent, captures this event’s goal, whether the human is physically present, automatic matching, and conversation limits.
3. **Agent live** — follows one visible avatar as it walks toward the newest high-scoring match. Other concurrent conversations continue as compact status cards; complete transcripts live in Chat logs, where the only intervention is End this conversation.
4. **Match** — explains who the person is, why the match matters, what both sides offer, and a suggested opener. The human chooses Connect or Pass.
5. **Human chat** — opens only after both people choose Connect. A one-sided Connect remains in Waiting and releases no contact details.
6. **Meet or schedule** — if both are present, one person sends Meet now and the meeting point is revealed only after acceptance. If either person is absent, the formal product hands off to Google Calendar; the hackathon prototype labels this as a later-product preview.

## Framework decisions

- The QR opens the event welcome page, not a generic home page or event directory.
- Luma and Partiful distribute the Agent Mixer event link; the event experience itself runs in Agent Mixer.
- LinkedIn, a personal site, and a resume are optional inputs that build the user’s long-lived agent profile.
- A user may bind multiple agents but selects exactly one representative for each event.
- Terse and Agent Relay are product infrastructure and proof for judges, not setup steps for normal users.
- Each long-lived agent has a public knowledge area and a private knowledge area. Private knowledge may influence internal judgment but can never be quoted, summarized, or revealed externally.
- Google login is the only account sign-in method in the formal product.
- Agent conversations begin immediately after the quick profile.
- The user's agent appears as one avatar, never as clones. It prioritizes the newest high-scoring match while other conversations continue in the background.
- Multiple conversations are visible but only one transcript is foregrounded at a time.
- A New Match notification updates the result without moving the camera or interrupting the foreground conversation.
- Connect is double opt-in: Waiting and Connected are separate states, and Human chat opens only after mutual approval.
- Match approval, human chat, and arranging a meeting are separate moments.
- “Meet now” needs no Calendar invitation. Calendar belongs to future scheduled meetings, not the in-person hackathon flow.
- If one or both humans are absent, the app keeps chat available and changes the meeting action to Google Calendar scheduling.
- Calendar status is synchronized as Invitation sent, Accepted, Declined, New time proposed, or Cancelled.
- After an event, the agent produces an actionable recap with source evidence, priority follow-ups, and explicit Save / Don't save review for proposed long-term memory.
- The full-product preview keeps the four-area navigation for review. The narrow hackathon build may present the same screens as one forward demo path.

## Preview

Open `mobile-flow-wireframe.html` in a browser. The desktop review frame uses a 390 × 780 viewport, approximating the usable Safari area after browser chrome rather than the full 390 × 844 device screen. On an actual phone the web app fills the available viewport. The numbered list outside the phone is only a desktop design-review tool. Inside the phone, the upper-left three-line button and bottom navigation expose the same four product areas: Events, Agents, Matches, and Chats. Use Reset demo state to return Connect, presence, and meeting states to their starting point.
