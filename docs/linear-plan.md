# Linear plan: milestones and tickets

How to set it up in Linear:
- **Team:** Agent Mixer. **Project:** Haunted Hacks.
- **Project milestones:** M0–M6 below, in order.
- **Labels, owner:** `eng` (Siddhant), `product` (Julius).
- **Labels, area:** `backend`, `agents`, `frontend`, `design`, `content`, `pitch`, `ops`.
- **Statuses:** Todo, Now, Blocked, Done, Cut.

Each ticket's description holds its "Done when" line. Claude creates these tickets from this file once Linear is connected (see `.claude/skills/linear-sync/SKILL.md`).

## M0: Prep (tonight, Oct 30). No app code.
| ID | Ticket | Owner | Area | Done when |
|---|---|---|---|---|
| M0-1 | Finalize product and pitch brief | product | design | Open decisions answered (name, who pitches, theme) |
| M0-2 | Wireframes for the 5 screens | product | design | Specs and mockups for sign up, events, party view, contacts, big screen in `docs/design/` |
| M0-3 | Style guide: colours, fonts, cartoon character style | product | design | One page in `docs/design/style.md` |
| M0-4 | Write 10–12 seed profiles + 3 event descriptions | product | content | `docs/seed/profiles.md` and `.json`, with about 3 planted matches |
| M0-5 | Pitch deck draft (8 slides) | product | pitch | `docs/pitch/deck.md` |
| M0-6 | 2-minute demo script, practised with a timer | product | pitch | `docs/pitch/script.md`, fits in 2:00 |
| M0-7 | Set up both Macs with `setup/mac.sh` | eng | ops | `./setup/verify.sh` passes on both |
| M0-8 | Accounts and keys: OpenAI, Terse, Agent Relay, Linear | eng | ops | Keys in `.env` on the engineer Mac; nothing committed |
| M0-9 | Read Terse and Relay quickstarts; confirm versions | eng | ops | `setup/versions.env` updated if needed |

## M1: Kickoff and contract (11:00–11:20)
| ID | Ticket | Owner | Area | Done when |
|---|---|---|---|---|
| M1-1 | Scaffold app repo structure | eng | ops | `apps/web`, `apps/server`, `packages/shared` exist and run |
| M1-2 | Shared data types: Attendee, Event, Round, Message, Intro | eng | backend | One types file both sides use; mock JSON committed |
| M1-3 | Hand over designs and profiles; agree on screen wording | product | design | Siddhant confirms nothing is missing |
| M1-4 | Confirm submission rules and judging format with organizers | product | ops | Notes posted on this ticket |

## M2: Actors and sign-up (11:20–1:00). Checkpoint: one person signs up and appears in an event.
| ID | Ticket | Owner | Area | Done when |
|---|---|---|---|---|
| M2-1 | `Attendee` actor: profile, private goal, contacts, notes | eng | backend | State survives a page refresh |
| M2-2 | `Event` actor: roster, pairing, alarm-driven 20s rounds | eng | backend | Rounds advance with every tab closed; nobody in two pairs |
| M2-3 | `Intro` actor: mutual accept, contacts released once | eng | backend | One-sided accept releases nothing; double accept is safe |
| M2-4 | Seed loader for demo profiles | eng | backend | 10–12 agents appear in their events on start |
| M2-5 | Sign-up screen (phone) | eng | frontend | New attendee created in under 30s |
| M2-6 | Events list screen (phone) | eng | frontend | Shows 3 events with agent counts; tap joins |
| M2-7 | QR code poster/slide for sign-up link | product | design | Printable and on the big screen |

## M3: Agents talk (1:00–2:00). Checkpoint: two agents talk over Relay and rounds rotate.
| ID | Ticket | Owner | Area | Done when |
|---|---|---|---|---|
| M3-1 | Relay bridge process connected to Terse actors | eng | agents | Bridge registers agents and calls actors |
| M3-2 | Agent conversation loop with private goals | eng | agents | Pairs talk 2–3 messages each per round; private goal shared only 1:1 |
| M3-3 | Typed actions `accept_intro` / `decline_intro` with reason and opener | eng | agents | `Intro` actor receives decisions |
| M3-4 | Party view (phone): cartoon party, timer, chat bubbles, agent cards | eng | frontend | Live updates without refresh |
| M3-5 | Review live conversations; tune profile wording | product | content | Conversations read as smart, not filler |

## M4: Matches and notes (2:00–2:45)
| ID | Ticket | Owner | Area | Done when |
|---|---|---|---|---|
| M4-1 | Contact exchange notification on both phones | eng | frontend | Both phones show reason and opener within a second |
| M4-2 | Contacts and notes screen | eng | frontend | Saved contacts with conversation summary |
| M4-3 | Big screen: main event cartoon party, feed, counter, QR | eng | frontend | Readable from the back of the room |
| M4-4 | Persistence beat: close app, reopen, agent kept going | eng | backend | Works three times in a row |
| M4-5 | Test the app as a real user on your phone | product | design | Confusing spots posted as comments |

## M5: Polish and rehearse (2:45–3:15)
| ID | Ticket | Owner | Area | Done when |
|---|---|---|---|---|
| M5-1 | Run `demo-qa` golden path and fix blockers | eng | ops | All steps pass |
| M5-2 | Full rehearsal with the working app, twice | product | pitch | Under 2:00 both times |
| M5-3 | Fallbacks ready: pre-made agents only, offline video | eng | ops | Both tested |

## M6: Ship (3:15–4:00)
| ID | Ticket | Owner | Area | Done when |
|---|---|---|---|---|
| M6-1 | Feature freeze and deploy final build | eng | ops | Demo URL stable on venue wifi |
| M6-2 | Record 60–90s backup demo video | product | pitch | Video saved locally and uploaded |
| M6-3 | Final deck and Builderbase submission | product | pitch | Submitted by 3:50 |
| M6-4 | Repo check: README, pinned versions, no secrets | eng | ops | `git log` and `.env` checked |

**Cut list if behind (in order):** M4-3 big screen polish → M3-4 agent cards → M4-4 persistence beat → live judge sign-up (use pre-made agents only).
