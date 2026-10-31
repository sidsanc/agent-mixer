# Critical review: Routiq Site Swarm vs Agent Mixer

## Is "highest chance" really true?
It's a judgment, not data. It rests on three assumptions:
1. **The grand prize rewards a credible company.** The winner gets a YC interview.
2. **One engineer can only finish a small, tight scope.**
3. **Julius pitching her own company beats a pitch for an idea neither of you works in.**

If the judges are mostly the Terse and Agent Relay founders scoring how essential their tech is, assumption 1 weakens and the Mixer gains. We don't know the judges yet.

## The most important factor
**A live 2-minute demo that works, where Terse and Agent Relay are obviously essential.**
- **Demo works:** this is binary. A broken live demo scores near zero regardless of idea quality.
- **Tech is essential:** the hosts are Terse and Agent Relay. If a judge can say "this is just Postgres plus a function call", you lose both track prizes and probably the grand prize.
- Story clarity and fundability matter next, but only after those two.

## Routiq: what could go wrong
| # | Weakness | How a judge exposes it | Severity | Fix |
|---|---|---|---|---|
| 1 | **The "AI inspector" is an if-statement.** Quality rejects because `after_photo` is missing, which is a null check. | "So the Quality Agent checks whether a field is empty?" | **Critical** | Quality actually looks at the photo with OpenAI vision. Technician submits a photo, the AI sees the floor is still wet or it's the wrong pipe, and rejects. Use fixed photo fixtures so it's repeatable. |
| 2 | **Actors aren't needed as written.** One site, one incident, no concurrency, so "survives refresh" works with any database. | "Why actors instead of Postgres?" | **Critical** | Two tenants report the same leak at the same moment (fire two simulated calls together). `SiteActor` merges them into one incident, never two. Add the SLA alarm that escalates with every screen closed. |
| 3 | **Relay isn't needed as written.** Resolver and Quality belong to the same company and exchange one message. | "Why not a function call?" | **High** | Run Quality on a different vendor's model (e.g. Claude) from Resolver (OpenAI): "the inspector can't share the fixer's blind spots." Stretch goal: the technician is another company's agent. |
| 4 | **Live phone call in a loud hall.** Judges can't hear speakerphone; venue wifi; Retell needs a public URL to reach your server. | The call fails or nobody hears it. | High | Make the simulated call the primary path on stage. The live call is a bonus or Q&A item. Deploy early, or tunnel, so Retell can reach you. |
| 5 | **Facilities is an unglamorous domain** for SF infra judges. | Polite nods, low "wow". | Medium | Lead with the accountability insight ("AI that refuses false completion"), not with property management. |
| 6 | **Is RoutiqAI already in YC?** If so, the "guaranteed YC interview" prize may be irrelevant or awkward. | — | Unknown | Ask Julius tonight. |
| 7 | **One engineer.** Terse releases daily and Relay has Windows gaps. | Stuck for an hour, so nothing ships. | High | Pin versions; follow the plan's 5/10-minute blocker rule; get a Mac or Linux box for the Relay agents. |
| 8 | **The demo ends unresolved** (`AWAITING_EVIDENCE`). Some judges prefer a satisfying ending. | Slightly flat finish. | Low | Keep it as planned. With fix #1, the rejection is a smart AI decision, which is satisfying in itself. |

## Agent Mixer: what could go wrong
| # | Weakness | How a judge exposes it | Severity |
|---|---|---|---|
| 1 | **The agent conversations may be theater.** One LLM call that compares all profiles could produce the same matches. If the chat doesn't add information, Relay isn't really needed. | "Why do agents need to talk? Just match profiles." | **Critical** |
| 2 | **Fake agents look like a simulation.** 20 synthetic profiles chatting reads as "LLMs talking to LLMs". | "Is anyone real in this room?" | High |
| 3 | **The timing doesn't fit a 2-minute demo.** 1-minute rounds mean only 1–2 visible rounds. Shrinking to 10-second rounds makes conversations shallow. | The demo feels slow or empty. | High |
| 4 | **Live judge onboarding.** QR code, typing a profile on a phone, venue wifi. One glitch among four judges breaks the "judges are the users" moment. | Awkward silence on stage. | High |
| 5 | **Heaviest build for one engineer:** many agents, rooms, timers, an animated map, phone UI. Julius can't help with code. | Half-finished UI at 4pm. | High |
| 6 | **Weak business story.** It needs many users to be useful, the buyer (event organizers) isn't validated, neither of you works in events, and Boardy, Luma and Moltbook-style products are nearby. | "Who pays, and why you?" | Medium–high |
| 7 | **Trust.** "Your agent represents you" invites questions about misrepresentation and what personal data gets shared. | "What if my agent says something wrong?" | Medium |

**Where the Mixer is genuinely stronger:** Relay is central (many agents talking), actors map naturally (one per person and per room, timer-driven rotation), the audience participates, and it fits this very event. It's the better bet for the Agent Relay Mac mini, and worse for the grand prize.

## Bottom line
- **As written, neither idea wins.** Routiq has hollow AI and hollow tech usage; the Mixer has theatrical conversations and the heaviest build.
- **Routiq's flaws are cheaper to fix.** Fixes 1–3 above total about 1.5 hours and turn Routiq's weakest points into its strongest beats. The Mixer's critical flaw is the premise itself.
- **Recommended Routiq demo order:**
  1. Two tenants report at once; one incident is created (actor).
  2. The building's history appears (memory).
  3. Resolver acts and hands off over Relay to a different-vendor inspector.
  4. The technician submits a photo; the inspector's vision rejects it.
  5. The SLA timer escalates on its own.
