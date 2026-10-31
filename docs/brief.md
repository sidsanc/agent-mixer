# Agent Mixer

> **Source of truth** for product decisions. Written by Julius. Siddhant's review was folded in on Oct 31; see "Five-Hour Hackathon Build" and "Decisions from review". Where other docs disagree, this file wins.

## Your agent works the room, so you only have the conversations worth having.

Agent Mixer is an open event network where personal AI agents meet, talk, and discover valuable connections on behalf of their users.

Every user can maintain multiple long-lived agents for different contexts, such as fundraising, hiring, technical collaboration, or personal networking. For each event, the user chooses one agent to represent them and gives it a goal. The agent then meets other agents, holds several conversations in parallel, and recommends the people who are genuinely worth meeting.

When both people approve a match, Agent Mixer immediately opens a private human-to-human chat. If they are at the same venue, either person can send a **Meet now** request. If they want to meet later, either person can send a standard Google Calendar invitation.

Agent Mixer does not deliver another directory of profiles. It delivers a prepared human introduction with context, mutual intent, and a clear next step.

## The Problem

People attend events to meet the right collaborators, customers, investors, hires, or friends. In practice, they usually:

- meet whoever happens to stand nearby;
- spend too much time repeating the same introduction;
- miss people whose needs are not obvious from their public profiles;
- collect contacts without remembering the context; and
- fail to follow up after the event.

Existing event directories and recommendation lists still leave the work to the attendee. Agent Mixer delegates the exploration while keeping every meaningful relationship decision under human control.

## How It Works

### 1. Enter an event

The organizer creates an Agent Mixer event and receives a shareable link and QR code. The link can be placed in Luma, Partiful, an invitation email, a website, or signage at the venue.

Anyone with the Agent Mixer event link can join. No organizer approval is required for the initial product. Users sign in with Google.

### 2. Choose a representative

One user account can connect multiple long-lived agents, including:

- Agent Mixer-managed agents;
- specialized agents for fundraising, hiring, or technical collaboration; and
- external agents connected through Agent Relay, including agents running in tools such as Claude or Codex.

A user selects one agent to represent them at each event. Only one agent per user may participate in the same event.

### 3. Set the event goal

The user describes what they want from the event. Agent Mixer separates the response into:

- a short, shareable event goal that the agent may communicate; and
- private intent that may guide internal decisions but can never be disclosed.

The user confirms the shareable sentence before networking begins.

### 4. Let the agent explore

The agent holds multiple independent conversations in parallel:

- three active conversations by default;
- up to five when the system determines that quality can be maintained;
- approximately three minutes per conversation; and
- up to six minutes for a high-potential conversation.

The user can watch the full conversations in real time. The interface intentionally avoids constant steering and micromanagement. The only live control is **End conversation**, which acts as an emergency stop.

### 5. Confirm the match

When two agents find a promising connection, each user receives a match card containing:

- who the other person is;
- why the connection may be valuable;
- what each side can offer;
- a short summary of the agent conversation; and
- a suggested opening topic.

Each user independently chooses **Connect** or **Pass**. A private human chat opens only after both users choose Connect.

### 6. Meet in person or schedule later

The private chat provides two distinct actions:

#### Meet now

For people at the same venue, one person sends an immediate meeting request. The specific meeting point and identification details are revealed only after the other person accepts. No calendar event is created.

#### Schedule a meeting

For a later conversation, either person creates a normal Google Calendar invitation. Google Calendar handles Yes, No, Maybe, rescheduling, cancellation, reminders, and the final event record. Agent Mixer displays the event card inside the chat but does not recreate calendar scheduling logic.

### 7. Preserve the relationship context

After the event, the user receives a summary of:

- conversations held by the agent;
- proposed and confirmed matches;
- active human chats;
- meeting invitations and their status; and
- suggested follow-up actions.

The user's agent retains relationship context and feedback for future events.

## Long-Lived Agent Knowledge

Each agent has two persistent knowledge bases.

### Public knowledge base

The public knowledge base may be queried and quoted by other agents. It can include:

- name, role, and company;
- public biography and professional experience;
- skills, interests, projects, and public work;
- what the user can offer other people;
- long-term public goals; and
- approved public links.

### Private knowledge base

The private knowledge base is available only to the user's own agent. It may influence whom the agent contacts, what it prioritizes, and whether it recommends a match, but it can never be quoted, summarized, paraphrased, implied, or transmitted to another agent.

Private knowledge may include:

- personal preferences and constraints;
- private goals and plans;
- relationship history and private notes;
- imported documents and communications;
- previous acceptance or rejection reasons; and
- sensitive business or personal context.

The governing principle is:

> An agent may use private information to decide, but never as permission to disclose.

## Creating an Agent

Users can create a managed agent by importing existing information, including:

- a LinkedIn profile or exported profile PDF;
- a personal website;
- a resume;
- a GitHub profile; or
- other public material.

Imported source material is private by default. Agent Mixer generates a proposed public profile, and the user must approve it before any information becomes public.

For fast event onboarding, users may skip imports and create a lightweight agent, then enrich its knowledge later. A lightweight agent needs:

- **name**;
- **role**, picked from chips: Founder, Investor, Engineer, Designer, GTM/Sales, Other;
- **goal**, one sentence (for example, "I want to meet seed investors in AI infra"); and
- **bio**, one optional line.

Advanced users can connect an external agent through Agent Relay. Agent Mixer verifies control of the relay address and grants an event-scoped capability rather than unrestricted account access.

## Product Surfaces

### Participant experience

The first version is a mobile-first web application. A QR code should open the product immediately without requiring an App Store installation.

The primary participant navigation is:

1. **Agent** — live status and active agent conversations;
2. **Matches** — pending and confirmed introductions;
3. **Chats** — human conversations after mutual approval; and
4. **Memory** — past events, contacts, relationship context, and follow-ups.

### Organizer experience

The organizer uses a desktop web dashboard to:

- create an event;
- generate its link and QR code;
- configure capacity and basic event information;
- pause new joins;
- remove abusive users or agents;
- end the event; and
- review aggregate outcomes.

Organizers cannot read private knowledge or private agent conversations by default.

## Why Terse

Terse Durable Actors provide the persistent, real-time state layer for Agent Mixer.

The initial architecture uses:

- an **Attendee Actor** for each user's agent, profile, event state, conversations, and matches; and
- an **Event Actor** for membership, availability, candidate discovery, and event lifecycle; and
- an **Intro Actor** for each proposed match. It records each person's Connect or Pass. The meeting card and contact details are released only when both choose Connect, and exactly once. A one-sided Connect releases nothing, and a double tap is safe.

The conversation Router uses bilateral scoring, greedy allocation, three-slot leases, and dynamic refill. It optimizes for the fastest high-quality match. Each personal agent scores candidates independently; the Router combines both directions with a geometric mean so one-sided interest is penalized. Full details live in `docs/architecture/router.md`.

The Intro Actor is the clearest Terse showcase: a race-free, exactly-once double opt-in.

The web application connects to the user's Attendee Actor over WebSocket for live updates. Conversations and matches survive browser closure, server restarts, and reconnection.

The user-facing proof is simple: close the application, return later, and the agent has continued networking with its memory intact.

## Why Agent Relay

Agent Relay is the communication layer between independently running agents.

Each agent communicates through a relay identity or address. Conversation turns pass through Agent Relay rather than being simulated as two prompts inside one backend function. This also enables Agent Mixer to support external agents instead of forcing every user onto a single proprietary agent runtime.

Core conversations end with a Relay typed action, `propose_match`, carrying the structured fit, reason, mutual offers and suggested opener into the Terse-backed introduction flow. Distinct Relay identities, real direct conversations and this typed action are core; an externally owned Claude or Codex agent remains stretch scope.

Only public knowledge, the approved shareable event goal, and the current conversation may enter a Relay message or session. Private knowledge remains inside the user's own agent boundary.

### Why agents need to talk, instead of matching profiles

A judge may ask: "Why not just match profiles with embeddings?"

- The shareable event goal is never shown in a directory. It is said only inside a 1:1 agent conversation.
- Agents ask each other follow-up questions ("Are you hiring now or next year?") that no profile answers.
- Each agent uses its private knowledge to decide whether to recommend the match, without revealing it.

A profile match finds people who look similar. A conversation finds out whether the timing and needs actually fit.

Together:

> Terse preserves who an agent is and what it remembers. Agent Relay lets independent agents communicate.

## Five-Hour Hackathon Build

The hackathon version is a narrow, working vertical slice rather than the complete platform.

### Core demo flow

1. A judge scans the event QR code.
2. The judge types a name, taps a role, and writes a one-sentence goal. No password, under 30 seconds.
3. The agent joins the one Haunted Hacks event.
4. It holds two or three real conversations in parallel through Agent Relay.
5. The judge watches the transcripts stream live from a Terse actor.
6. A match card appears on both phones: who, why, what each side offers, and an opener.
7. Both people choose **Connect**. The Intro Actor releases the meeting card exactly once.
8. One person taps **Meet now**.
9. Both phones show the same meeting point and opener.

### Demo speed

The real product uses about three minutes per conversation. The demo can't. In demo mode:

- each conversation is about four messages, about 20 seconds;
- a judge's first match should appear within 30–40 seconds of signing up; and
- the setting is one switch, so the pitch can say "three minutes in the real product".

### Planted partners

Judges are strangers, so two judges matching each other is luck. They might all be investors, or their goals might not fit. To make sure every judge gets a match, the seed profiles plant a strong partner for every role:

| Judge picks | Seeded agent waiting for them |
|---|---|
| Investor | A founder raising a seed round |
| Founder | An investor in their space, and an engineer open to a startup job |
| Engineer | A founder hiring a first engineer |
| Designer | A founder who needs a first designer |
| GTM/Sales | A founder who needs a first sales hire |
| Other | A friendly generalist founder |

Siddhant and Julius also sign in live with goals planted to match each other, as a guaranteed backup. A judge-to-judge match is a bonus if it happens.

### Included

- one live event;
- QR sign-up with name, role, goal and an optional bio line;
- four to six active seeded agents, with planted partners for every role;
- additional static party characters if needed for visual density;
- two or three concurrent agent conversations;
- demo-speed conversations;
- real Agent Relay transport;
- Terse persistence and WebSocket updates (Attendee, Event and Intro actors);
- live transcript viewing;
- match card with Connect and Pass;
- the meeting card after mutual Connect, with **Meet now**;
- basic human chat after mutual Connect (the Intro Actor holds the messages; Julius is sharing the product details and design); and
- a simple projector-friendly party view.

### Stretch (only if the core demo works end to end by 2:00)

- one external Claude or Codex agent pre-connected through Agent Relay, proving that the network supports independently owned agents; and
- the persistence beat: close the app, reopen it, and the agent kept networking.

### Deferred

- Google sign-in (the pitch says "next");
- LinkedIn and resume parsing;
- full public/private knowledge management;
- a general-purpose bring-your-own-agent setup UI;
- multiple event discovery;
- a full organizer dashboard;
- Google Calendar API integration;
- NFC;
- payments;
- automated follow-up emails;
- indoor positioning; and
- long-term self-improvement controls.

### Decisions from review (Oct 31)

| Topic | Decision | Why |
|---|---|---|
| Sign-in | QR plus name, role and goal. Google sign-in deferred. | OAuth setup and venue wifi can break; typing a password on stage is slow. |
| Conversation length | Demo speed, about 20 seconds each. | Three-minute conversations don't fit a two-minute demo. |
| Who matches | Planted partner for every role; judge-to-judge is a bonus. | We can't plant a fit between two strangers. |
| Human chat | **Core (changed Oct 31, afternoon).** Siddhant and Julius decided to keep it. Julius is sharing the product details and design. | Earlier it was stretch to save about an hour. The private chat after mutual Connect is part of the product story, so we keep it. |
| Intro Actor | Kept. | Exactly-once double opt-in is the best Terse showcase. |
| External agent | Stretch. | Only if Relay works by 2:00. |

## Demo Moment

The product succeeds when the audience sees a digital interaction become a real human connection:

> A judge scans the QR code and says, "I'm an investor looking for AI infra founders." Within a minute, their agent has spoken through Agent Relay with a founder's agent and found a fit. Both choose Connect, and both phones show the same card: "Meet at the coffee table now. Opener: ask about the real-time voice pipeline."

If two judges' agents match each other, that's the bonus moment.

The agents are not the destination. The human conversation is.

## One-Line Pitch

**Your agent works the room, so you only have the conversations worth having.**

