# Agent World Core Flow Design

## Intent

Make the memorable product moment the sight of a personal agent autonomously working an event: moving through a lively venue, speaking with other agents, and surfacing a valuable match without requiring constant user control.

## Approved experience

- Home keeps a clear `Enter Agent World` button during an active event.
- The status below it names the user's agent and summarizes live activity, for example `Shimo is talking to 3 agents · 1 new match`.
- Agent names are generated automatically and can be changed later in My Agents. Product copy must not hard-code `Shimo` as the universal name.
- Agent World defaults to a camera following the user's single avatar. The user may look around and recenter on their agent.
- The avatar never splits into clones. It walks toward the person with the newest high match score.
- Several conversations may continue concurrently, but only one is spatially foregrounded. Other conversations appear as compact background status cards.
- Nearby characters show only the latest one or two lines overhead. Full conversations live in Chat Logs.
- The only live intervention is `End conversation`.
- A strong result produces a non-blocking `New Match` notification and updates the match count without forcing the camera away.

## Result flow

`Agent World → New Match → Match Detail → Connect → Waiting for them → Both connected → Human Chat → Meet now / Schedule → Event Recap`

### Mutual connection

- Connect is double opt-in.
- One-sided Connect releases no private human chat or meeting details.
- Pass remains recoverable from the Passed list and briefly offers Undo.

### Human handoff

- Human Chat opens only after both people Connect.
- The chat inherits a suggested opener and provides a clear back path to Chats.
- A person can report, block, or unmatch from a secondary safety menu.

### Meeting

- If both people are at the venue, `Meet now` creates an in-product request and meeting card. It does not create a calendar event.
- If the meeting is for later, `Schedule` hands off to a standard Google Calendar invitation.
- The hackathon demo prioritizes Meet now. Calendar scheduling remains a clearly labelled later-product preview, consistent with `docs/brief.md`.

### Recap

- Recap is an action surface, not only a report.
- Each priority contact has a next action and a route back to the source conversation.
- Match explanations are labelled as agent inference and link to evidence.
- Any proposed long-term memory requires explicit Save / Don't save review; private knowledge remains private.

## Visual and interaction principles

- Preserve the Vice City-inspired palette and playful social energy without copying GTA branding, characters, weapons, or criminal imagery.
- Keep game-world spectacle concentrated in Agent World. Results screens prioritize clarity and trust.
- Never move the camera or navigate away when a new match appears.
- Use at least 44px touch targets, readable mobile text, reduced-motion support, and explicit loading, empty, offline, and failure states.

## Scope for this design revision

Revise the static design references in `docs/design/` only. Do not edit application code, commit, push, or update Linear.
