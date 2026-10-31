# Agent World Core Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the mobile design prototype into a coherent Agent World demo that flows from autonomous agent activity to a mutual match, human handoff, Meet now, and actionable recap.

**Architecture:** Keep the existing single-file static prototype and its embedded Agent World reference. Represent product behavior with a small client-side prototype state object so every screen renders from the same agent, presence, match, chat, and meeting state. The work remains a design reference in `docs/design/`, not production app code.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, mobile browser preview.

**Spec:** `docs/design/agent-world-flow-spec.md`

## Global Constraints

- `docs/brief.md` remains the source of truth.
- Modify only files under `docs/design/`.
- Do not edit `apps/` or `packages/`.
- Do not commit, push, or update Linear during this design round.
- The hackathon core uses Meet now; Google Calendar is shown only as later-product behavior.
- The only live conversation control is End conversation.
- Private knowledge cannot be quoted, summarized, paraphrased, implied, or transmitted.

## Review Focus

- A one-sided Connect must remain Waiting and must not reveal Human Chat.
- Agent-only presence must never show venue-meeting language.
- New Match feedback must not move the camera or interrupt the foreground conversation.
- Re-entering the prototype must preserve the currently demonstrated state within the browser session.
- Reduced-motion mode must retain understandable conversation and match feedback without walking animation.

---

### Task 1: Shared prototype state and navigation

**Files:**
- Modify: `docs/design/mobile-flow-wireframe.html`

**Interfaces:**
- Produces: one prototype state object for agent identity, live conversations, match state, presence, chat state, meeting state, and recap actions.

- [ ] Add explicit screen-level back actions so task flows do not depend on the hamburger menu.
- [ ] Make every navigation control render the destination from shared prototype state.
- [ ] Add browser-session persistence and a Reset demo action for repeatable review.
- [ ] Verify Home → Event → Agent World → Matches → Home manually at 390px width.

### Task 2: Home entry and Agent World

**Files:**
- Modify: `docs/design/mobile-flow-wireframe.html`
- Modify: `docs/design/vice-agent-world.html`

**Interfaces:**
- Consumes: shared agent identity and live-conversation state from Task 1.
- Produces: `Enter Agent World`, live activity summary, focused avatar conversation, background conversation cards, and New Match event.

- [ ] Replace the active-event CTA with `Enter Agent World` and dynamic agent activity copy.
- [ ] Add a single followed avatar, recenter control, and user-controlled viewport movement.
- [ ] Make the avatar prioritize and walk toward the newest high-score match candidate.
- [ ] Show one foreground overhead exchange and compact states for other concurrent conversations.
- [ ] Add switchable Chat Logs with exactly one live action: End conversation.
- [ ] Add a non-blocking New Match toast and badge update without camera navigation.
- [ ] Verify normal motion and reduced-motion behavior in the mobile preview.

### Task 3: Matches and double opt-in

**Files:**
- Modify: `docs/design/mobile-flow-wireframe.html`

**Interfaces:**
- Consumes: match event from Task 2.
- Produces: New, Waiting, Connected, and Passed match states used by Chats.

- [ ] Make New / Connected / Passed tabs display separate lists, counts, and empty states.
- [ ] Make every match card open its detail view with presence, wants, offers, evidence, and suggested opener.
- [ ] Implement Connect → Waiting for them → Both connected; reveal Human Chat only in the final state.
- [ ] Implement Pass with confirmation feedback and temporary Undo.
- [ ] Verify one-sided Connect cannot open Human Chat and mutual Connect can.

### Task 4: Human Chat handoff

**Files:**
- Modify: `docs/design/mobile-flow-wireframe.html`

**Interfaces:**
- Consumes: Connected match and suggested opener from Task 3.
- Produces: message state and Meet now / Schedule entry points for Task 5.

- [ ] Add Back to Chats and a system message explaining that both people connected.
- [ ] Carry the suggested opener into an optional first-message prompt.
- [ ] Implement send, pending, delivered/read, failure, and retry prototype states.
- [ ] Add independent presence/last-active information for the other person.
- [ ] Add a secondary safety menu for Block, Report, and Unmatch.
- [ ] Make the meeting CTA state-aware: Meet now, Pick a time, or View meeting.
- [ ] Verify keyboard-sized layout, sticky composer, long messages, and empty conversation state.

### Task 5: Separate Meet now from Schedule

**Files:**
- Modify: `docs/design/mobile-flow-wireframe.html`

**Interfaces:**
- Consumes: both users' presence and Human Chat state from Task 4.
- Produces: venue meeting or later Calendar preview state for Recap.

- [ ] For two venue-present users, design request → accepted → meeting card → on my way → arrived / can't find them / back to chat.
- [ ] Reveal meeting point and identification details only after acceptance.
- [ ] For later meetings, design time/timezone/duration review followed by a Google Calendar handoff preview.
- [ ] Display exactly one Calendar lifecycle state at a time and label the integration as later-product scope.
- [ ] Remove venue language from every Agent-only state.
- [ ] Verify both presence branches independently from Event Setup.

### Task 6: Actionable recap

**Files:**
- Modify: `docs/design/mobile-flow-wireframe.html`

**Interfaces:**
- Consumes: conversation, match, chat, and meeting outcomes from Tasks 2–5.
- Produces: follow-up actions and proposed memory decisions.

- [ ] Make each priority contact expose a state-specific primary action and View conversation.
- [ ] Label recommendations as Agent inference and expose supporting evidence.
- [ ] Add proposed memory items with Save / Don't save decisions and explicit private defaults.
- [ ] Add generated time, processing/partial-failure states, and useful zero-result state.
- [ ] Make See all and Share explicit, functional prototype controls that exclude private data.
- [ ] Verify meeting, message, source-conversation, and memory-review routes.

### Task 7: Mobile visual QA and closure pass

**Files:**
- Modify: `docs/design/mobile-flow-wireframe.html`
- Modify: `docs/design/vice-agent-world.html`
- Update: `docs/design/mobile-flow-framework.md`

**Interfaces:**
- Consumes: completed flow from Tasks 1–6.
- Produces: reviewed static design reference and updated flow documentation.

- [ ] Check every interactive-looking control has an action or is visually presented as status only.
- [ ] Check 44px touch targets, safe areas, readable type, contrast, long copy, and narrow-screen wrapping.
- [ ] Check loading, empty, offline, failure, retry, and completed states across the core flow.
- [ ] Walk the complete demo twice: venue Meet now and Agent-only later scheduling.
- [ ] Confirm there are no edits outside `docs/design/` and no commit or push was performed.
