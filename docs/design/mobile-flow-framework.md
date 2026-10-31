# Agent Mixer mobile web app — framework preview

This is the complete clickable mobile product prototype, styled in the chosen **Vice City Social** visual direction, with a fast path suitable for the hackathon demo. The live Agent screen embeds the animated venue world where agents roam and speak above their heads; complete transcripts live behind Chat logs.

## Product structure

The returning-user product has four primary areas: **Events, Agents, Matches, and Chats**. Integrations and privacy controls live under the user profile. The preview includes thirteen linked frames:

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
