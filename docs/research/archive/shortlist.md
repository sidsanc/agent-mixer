# Shortlist (after research + two ideation passes)

Sources: `ideas-product.md` (fundable-startup lens), `ideas-creative.md` (room-wow lens).

| Idea | Lens | Score | Why it could win | Main risk |
|---|---|---|---|---|
| **Parley**: buyer and seller agents negotiate a B2B deal, with a deal actor as neutral notary | Product | 29/30 | Clear buyer. Actors are essential (one deal instance, stale-offer rejection, timers while offline). Relay is essential (cross-company room). | Less theatrical; needs an audience hook |
| **Poltergeist**: judges attack live shards from their phones while mixed-vendor agents run incident response | Creative | 25/30 | Biggest room moment (judge gets "banished"). Uses every primitive. | Incident rooms already appear on Relay's own idea list; many moving parts |
| **Ferry**: provider and payer agents work a prior-auth case | Product | 26/30 | Sharp "why now" (CMS mandate); deadline alarm fires with every tab closed | Healthcare framing is harder to make fun on stage |
| **Séance at Durable Manor**: murder mystery where the murder is a real `kill -9` | Creative | 24/30 | Turns resumability into the plot twist | Toy; weak company story |
| **The Coven**: rival models debate while judges whisper to one | Creative | 24/30 | Most reliable live | Least differentiated |

## Shared architecture (true of every top idea)
- **Notary actor:** an authoritative state actor with no LLM calls (non-interleaved), so writes stay serial and transactional.
- **Agent actors:** separate `@Interleave` actors that call LLMs; they persist once per turn, never per token.
- **Relay bridge:** a small Node 22 process holds the Relay connection and typed actions and calls actors through the generated Terse client.
- **Per-viewer actors:** one actor per phone/viewer, kept live with `@Emittable`.
- **Pinned versions:** terse 0.14.9, agent-relay 14.0.0. Run Relay harness pieces on Mac/Linux or in Freestyle, not Windows.

## Current recommendation
**Parley + Poltergeist's audience mechanic.** Judges scan a QR code and each joins as a competing buyer or as the human approver. That gives the fundable story plus a room moment. Ferry is the pivot: about 70% of the plumbing is shared.

Pending: compare against Siddhant's own idea.
