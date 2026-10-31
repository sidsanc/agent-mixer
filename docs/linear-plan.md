# Linear plan: milestones and tickets

Linear setup (done):
- **Team:** YC-Hackathon-Agent-mixer. **Project:** Haunted Hacks: Agent Mixer (tickets YC-5 to YC-41, plus YC-42 and up for stretch).
- **Project milestones:** M0–M6 below, in order.
- **Labels, owner:** `eng` (Siddhant), `product` (Julius).
- **Labels, area:** `backend`, `agents`, `frontend`, `design`, `content`, `pitch`, `ops`.
- **Statuses:** Todo, In Progress, Done, Canceled; blocked = the `blocked` label.

Each ticket's description holds its "Done when" line. These tickets exist in Linear; this file mirrors them.

**Updated Oct 31** to match Julius's brief (`docs/brief.md`): one event, QR sign-up with name, role and goal, parallel demo-speed conversations, match card with Connect/Pass, meeting card with Meet now, planted partners for every role. The external agent is stretch. **Later on Oct 31: human chat is core again** (Siddhant and Julius decided to keep it; Julius is sharing the product details and design).

## M0: Prep (tonight, Oct 30). No app code.
| ID | Ticket | Owner | Area | Done when |
|---|---|---|---|---|
| M0-1 | Finalize product and pitch brief | product | design | `docs/brief.md` updated with review decisions; name and who pitches decided |
| M0-2 | Wireframes for the 5 screens | product | design | Specs and mockups for sign up, agent (live transcripts), match card, meeting card with Meet now, big screen in `docs/design/` |
| M0-3 | Style guide: colours, fonts, cartoon character style | product | design | One page in `docs/design/style.md` |
| M0-4 | Seed profiles: 4–6 active agents with a planted partner for every role | product | content | `docs/seed/profiles.md` and `.json`; one strong partner per role chip; Siddhant's and Julius's planted goals; a few static party characters; one event description |
| M0-5 | Pitch deck draft (8 slides) | product | pitch | `docs/pitch/deck.md` |
| M0-6 | 2-minute demo script, practised with a timer | product | pitch | `docs/pitch/script.md`, fits in 2:00 |
| M0-7 | Set up both Macs with `setup/mac.sh` | eng | ops | `./setup/verify.sh` passes on both |
| M0-8 | Accounts and keys: OpenAI, Terse, Agent Relay, Linear | eng | ops | Keys in `.env` on the engineer Mac; nothing committed |
| M0-9 | Read Terse and Relay quickstarts; confirm versions | eng | ops | `setup/versions.env` updated if needed |

## M1: Kickoff and contract (11:00–11:20)
| ID | Ticket | Owner | Area | Done when |
|---|---|---|---|---|
| M1-1 | Scaffold app repo structure | eng | ops | `apps/web`, `apps/server`, `packages/shared` exist and run |
| M1-2 | Shared data types: Attendee, Event, Conversation, Message, Intro | eng | backend | One types file both sides use; mock JSON committed |
| M1-3 | Hand over designs and profiles; agree on screen wording | product | design | Siddhant confirms nothing is missing |
| M1-4 | Confirm submission rules and judging format with organizers | product | ops | Notes posted on this ticket |

## M2: Actors and sign-up (11:20–1:00). Checkpoint: one person signs up and appears in the event.
| ID | Ticket | Owner | Area | Done when |
|---|---|---|---|---|
| M2-1 | `Attendee` actor: name, role, goal, bio, conversations, matches | eng | backend | State survives a page refresh; shareable goal and private intent stored separately |
| M2-2 | `Event` actor: roster, pairing, 2–3 parallel conversations per agent | eng | backend | Alarm starts new conversations with every tab closed; no duplicate pairs at once |
| M2-3 | `Intro` actor: Connect/Pass from both people, meeting card released once | eng | backend | One-sided Connect releases nothing; double tap is safe |
| M2-4 | Seed loader for demo profiles | eng | backend | 4–6 seeded agents (plus static characters) appear in the event on start |
| M2-5 | Sign-up screen (phone): name, role chips, goal, optional bio | eng | frontend | New attendee created in under 30s; no password |
| M2-6 | ~~Events list screen~~ (Canceled: QR joins the one event) | eng | frontend | n/a |
| M2-7 | QR code poster/slide for sign-up link | product | design | Printable and on the big screen |

## M3: Agents talk (1:00–2:00). Checkpoint: two agents talk over Relay and a match is proposed.
| ID | Ticket | Owner | Area | Done when |
|---|---|---|---|---|
| M3-1 | Relay bridge process connected to Terse actors | eng | agents | Bridge registers agents and calls actors |
| M3-2 | Agent conversation loop at demo speed | eng | agents | About 4 messages, about 20s per conversation; 2–3 in parallel; only public profile and shareable goal are sent; one switch for real-product length |
| M3-3 | Typed action `propose_match` with reason, offers and opener | eng | agents | `Intro` actor receives proposals; match card data is complete |
| M3-4 | Agent screen (phone): live transcripts and End conversation | eng | frontend | Transcripts stream without refresh |
| M3-5 | Review live conversations; tune profile wording | product | content | Conversations read as smart, not filler; every role chip finds its partner |

## M4: Matches and meeting (2:00–2:45)
| ID | Ticket | Owner | Area | Done when |
|---|---|---|---|---|
| M4-1 | Match card on both phones with Connect / Pass | eng | frontend | Shows who, why, what each offers, opener; appears within a second |
| M4-2 | Meeting card with Meet now | eng | frontend | After both Connect, both phones show the same meeting point and opener |
| M4-3 | Big screen: projector party view, live feed, match counter, QR | eng | frontend | Readable from the back of the room |
| M4-4 | Persistence beat (stretch): close app, reopen, agent kept going | eng | backend | Works three times in a row |
| M4-5 | Test the app as a real user on your phone | product | design | Confusing spots posted as comments |
| M4-6 | Basic human chat after mutual Connect (core) | eng | frontend | Messages appear on both phones; held by the `Intro` actor. Build from Julius's chat design |
| M4-7 | Stretch: one external Claude/Codex agent joins via Agent Relay | eng | agents | It holds a conversation with a seeded agent on stage. Start only if Relay works by 2:00 |

## M5: Polish and rehearse (2:45–3:15)
| ID | Ticket | Owner | Area | Done when |
|---|---|---|---|---|
| M5-1 | Run `demo-qa` golden path and fix blockers | eng | ops | All steps pass |
| M5-2 | Full rehearsal with the working app, twice | product | pitch | Under 2:00 both times |
| M5-3 | Fallbacks ready: planted Siddhant/Julius match, pre-made agents only, offline video | eng | ops | All tested |

## M6: Ship (3:15–4:00)
| ID | Ticket | Owner | Area | Done when |
|---|---|---|---|---|
| M6-1 | Feature freeze and deploy final build | eng | ops | Demo URL stable on venue wifi |
| M6-2 | Record 60–90s backup demo video | product | pitch | Video saved locally and uploaded |
| M6-3 | Final deck and Builderbase submission | product | pitch | Submitted by 3:50 |
| M6-4 | Repo check: README, pinned versions, no secrets | eng | ops | `git log` and `.env` checked |

**Cut list if behind (in order):** M4-7 external agent → M4-4 persistence beat → M4-3 big screen polish → M4-6 chat → live judge sign-up (use the planted Siddhant/Julius match and pre-made agents only).
