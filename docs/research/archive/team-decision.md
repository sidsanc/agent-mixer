# Team decision: Routiq Site Swarm vs Agent Mixer

Inputs:
- Julius's plan (`2026-10-31-haunted-hacks-routiq-site-swarm-development-plan.md`)
- Siddhant's idea (`idea-siddhant.md`)
- Research files in this folder

## The two ideas in one line each
- **Routiq Site Swarm (Julius):** a tenant reports a leak by phone. A persistent Site Agent pulls up the building's history, a Resolver agent dispatches the fix, and an independent Quality agent refuses to close the incident until a technician's photo proves the work was done.
- **Agent Mixer (Siddhant):** scan a QR code at an event and your agent networks for you in breakout rooms. It remembers everyone it met and tells you who to meet in person.

## Scores (same rubric as the earlier shortlist)
| Criterion | Routiq as written | Routiq + upgrades below | Agent Mixer |
|---|---|---|---|
| Innovation | 3 | 4 | 4 |
| Feasibility in 5 hrs | 5 | 4 | 4 |
| Impact / fundability | 5 | 5 | 3 |
| Demo-ability (room reaction) | 3 | 4 | 5 |
| Track coverage (Terse / Relay / others) | 3 | 5 | 5 |
| Differentiation from other teams | 4 | 4 | 3 |
| **Total** | **23** | **26** | **24** |

I lowered the Mixer's fundability from 4 to 3 after reflection. Neither of us is in the events business, and Boardy, Moltbook-style products and Luma all sit nearby.

## Routiq: what's strong
1. **Founder-market fit.** Julius runs RoutiqAI. A guaranteed YC interview is worth most to a team with a real company, and judges can tell a real founder from a hackathon idea.
2. **The plan is very disciplined.** One scenario, a locked contract by 11:20, clear ownership, fallbacks for every dependency, a feature freeze at 3:15 and a backup recording. That's how hackathons are won on execution.
3. **The core rule maps to how actors work.** "The model may explain, but code controls every status transition" is exactly the pattern the Terse research recommends: keep LLM calls out of the actor that owns the state.
4. **The climax is distinctive.** "AI refuses to close the ticket without proof" is memorable, and most teams will build agents that do things, not agents that check things.

## Routiq: where it falls short of the judging criteria
1. **Terse is used like a database.** "State survives a page refresh" is true of Postgres too. The Terse judges want to see what only actors do: one instance per ID, serial writes, alarms and live sync.
2. **Agent Relay is used for one message.** A single Resolver → Quality handoff is thin for a Mac-mini track whose pitch is agents collaborating directly. The Relay founders' newest features (typed actions, cross-company rooms) aren't used.
3. **No audience participation.** Judges watch a phone call. Fine for "well-executed product", weaker for "incredibly creative".
4. **Windows.** Agent Relay's harness pieces are limited on Windows. Who has a Mac?

## Recommended upgrades (small, ranked by value per minute)
1. **SLA alarm on `IncidentActor` (about 20 min).** When the technician claims completion, set an actor alarm, e.g. 60 seconds of demo time. If the photo hasn't arrived, the alarm fires and escalates on its own, even with every browser tab closed. This is the single best Terse showcase and costs one method.
2. **Live sync with `@Emittable` instead of polling (about 20 min).** The Incident Room updates instantly through Terse's built-in sync. Keep polling as the fallback, as the plan already says.
3. **Make the technician an agent from another company (about 40 min).** The contractor's agent joins a temporary Relay room for this incident and claims completion through a typed action (`claim_complete`). Quality then rejects it. One handoff becomes a three-party, cross-company collaboration, which is the Relay founders' favorite story ("don't be a meat proxy").
4. **Show a rejected transition on screen (about 10 min).** When the Resolver tries to mark the incident RESOLVED, the actor refuses: "Resolver cannot verify its own work." The rule is already in the plan; just make it visible. It proves serial, rule-checked writes.
5. **Optional audience beat (only if ahead at 2:45):** a QR code lets a judge play the technician and upload the photo from their own phone, which triggers RESOLVED live in Q&A.

Upgrades 1–4 add about 1.5 hours. The plan's slack is roughly the 2:45–3:15 repair window, so if upgrades go in, cut something else: use the simulated call as primary and treat the live Retell call as a bonus.

## Things to confirm on the day
- **Rules:** using an existing Retell account/agent and Routiq's fixtures is likely fine (not code), but ask an organizer. New repo only.
- **Gotchas:** pin terse 0.14.9 and agent-relay 14.0.0. `.push()` on a persisted array doesn't save, so reassign the field. LLM-calling actors need `@Interleave`. Actors go dormant after 10 seconds idle. Writes take about 85ms.
- **Agent sessions:** the plan's Relay acceptance rule (two real sessions, a matching correlation ID) is good. Keep it.

## What happens to the Mixer idea
It stays a good idea with a better audience moment. It can be a follow-up project, or a second Routiq-style "persistent agent" story later. Trying to merge the two into one demo would blur both pitches.

## Re-check with the real team (added later)
Julius is a founder but not a developer, so Siddhant is the only engineer. Julius can own the pitch, demo, story, fixtures and no-code tools (Retell), and can AI-generate a simple frontend against mock JSON. Re-scored for "one engineer plus one non-technical founder":

| | Parley + Poltergeist | Agent Mixer | Routiq as written | Routiq + cheap upgrades |
|---|---|---|---|---|
| Engineering load on Siddhant | Very high | High | Medium | Medium-high |
| What Julius can own | Pitch only (not her domain) | Seed profiles, room copy, pitch | Retell, fixtures, UI copy, pitch, demo, Q&A | Same |
| Feasibility, 1 engineer | 2 | 3 | 4 | 4 |
| Founder credibility in pitch | Low | Low | High | High |
| Room reaction | 4 | 5 | 3 | 4 |
| Terse / Relay showcase | Strong / medium | Strong / strong | Weak / weak | Strong / medium |
| Overall chance at grand prize | Low | Medium | Medium | **Highest** |

**Upgrade trim for a solo engineer:** keep #1 (alarm), #2 (live sync, with polling fallback) and #4 (visible refusal), about 50 minutes. Move #3 (cross-company technician agent) to stretch only.

**Risk:** Siddhant is a single point of failure. Julius must never edit backend code. The frontend talks only to the shared `incident-types.ts` contract, and integration happens at the plan's fixed checkpoints.

## Recommendation
**Build Routiq Site Swarm with upgrades 1–4.** It has the best chance at the grand prize (a real company plus disciplined execution), and the upgrades bring it into contention for both the Terse and Agent Relay track prizes.
