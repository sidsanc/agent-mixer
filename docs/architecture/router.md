# Conversation Router

## Decision

The Router optimizes for the **fastest high-quality match**, not equal exposure across the event.

It uses:

> bilateral scoring + greedy allocation + three-slot leases + dynamic refill

Stable matching is deliberately deferred. It optimizes long-term allocation stability, while the live event needs a good result quickly as people join, leave, and finish conversations continuously.

## End-to-end flow

1. The `Event` actor filters the event roster to eligible candidates: online or available, not already paired, not previously exhausted, and with a free conversation slot.
2. Each personal agent independently scores the shortlist. Public profile, approved event goal, role, skills, industry, needs, and offers may inform the score. Private knowledge may affect the owner's score but never leaves that agent.
3. The Router combines both directional scores:

   ```text
   mutualScore = sqrt(scoreAtoB * scoreBtoA)
   ```

   The geometric mean penalizes one-sided interest.
4. Candidate pairs are sorted by `mutualScore`. The Router greedily reserves one slot on both attendees, highest score first.
5. Each attendee has at most three active conversations. A reservation is an expiring lease so a crashed or silent conversation cannot hold a slot forever.
6. Once both leases are secured, the bridge opens a real Agent Relay conversation between the two independent relay identities.
7. When a conversation finishes, both agents evaluate the actual fit. A promising result invokes the typed Relay action `propose_match`; a weak result releases both slots without creating an introduction.
8. Released slots are refilled immediately from the current ranked queue. The queue is recalculated as availability and results change.
9. `propose_match` creates or updates an `Intro` actor. Humans alone choose Connect or Pass. Contact and meeting details are released exactly once, only after both choose Connect.

## Scoring

The first implementation may use a transparent heuristic before adding embeddings or an LLM ranker:

```text
directionalScore =
  0.40 * goalComplementarity +
  0.25 * needOfferFit +
  0.20 * roleIndustryRelevance +
  0.15 * personalAgentPreference
```

All components are normalized to `0..100`. The weights are defaults, not user-visible promises. Demo seeds may receive an explicit compatibility boost so every role reaches its planted partner within the target time.

## Terse responsibilities

Terse is the authoritative state and coordination layer.

### `Event` actor

- owns event membership, candidate discovery, scores safe to share, waiting pairs, active leases, and lifecycle;
- serializes slot reservation and release so nobody exceeds three conversations and no pair is opened twice;
- keeps LLM calls and Relay network calls out of the actor;
- uses an alarm to expire leases and trigger refill while browsers are closed; and
- exposes safe aggregate state to the projector view.

### `Attendee` actor

- owns the attendee profile, approved event goal, active conversations, transcripts, recommendations, and match history;
- keeps private intent separate from anything sent to the `Event` actor or Agent Relay;
- persists completed turns and conversation results once per turn, not once per streamed token; and
- uses `@Emittable` state to update the phone UI over WebSocket.

### `Intro` actor

- owns the race-free Connect/Pass state for one proposed match;
- releases contact, meeting point, and opener only after both humans Connect; and
- makes retries and double taps idempotent so the meeting card is emitted exactly once.

The visible Terse proof is: conversations and matches remain consistent across both phones, and closing then reopening a participant view restores the same state while the agent continued networking.

## Agent Relay responsibilities

Agent Relay is the communication layer between independently running agents.

- Every attendee agent has its own Relay identity/address.
- Each allocated pair uses a direct conversation or thread, rather than one backend function simulating both speakers.
- Relay messages contain only public profile fields, the approved shareable goal, and the current conversation.
- Conversations use short turns: roughly four messages and 20 seconds in demo mode; approximately three minutes in the real product.
- The bridge registers a typed action:

  ```text
  propose_match({
    counterpartId,
    fitScore,
    reason,
    theyOffer,
    youOffer,
    opener,
    conversationId
  })
  ```

- The action handler validates the conversation and sends the structured result to the correct `Intro` and `Attendee` actors. It uses an idempotency key because Relay delivery and external calls are not one transaction.
- A live transcript or Relay observer view makes the independent communication visible during the demo.

An external Claude or Codex agent joining through its own Relay address remains stretch scope. Typed actions and distinct Relay identities are part of the core integration.

## Failure handling

- Lease expires: release both slots and refill.
- Relay conversation fails: record the failure, release both slots, and retry a different candidate.
- Duplicate completion or `propose_match`: deduplicate by conversation ID.
- One side disconnects: Terse retains state; the conversation may continue until its lease expires.
- No strong candidates: lower the exploration threshold gradually, but never bypass the human Connect decision.

## Demo acceptance criteria

- A new attendee starts two or three real Relay conversations automatically.
- No attendee exceeds three active conversations and no pair is duplicated.
- A planted high-fit candidate is included in the first allocation batch.
- At least one match card appears within 30–40 seconds.
- Relay identities, live turns, and the structured `propose_match` action are observable.
- Refreshing or reopening restores the transcript and match state from Terse.
- One-sided Connect reveals nothing; mutual Connect releases the same meeting card to both phones exactly once.
