# Agent Mixer

Your AI agent networks for you at events, then tells you who to follow up with. Built at Haunted Hacks (Oct 31, 2026) by Siddhant Sancheti and Julius Leung.

> **Rule:** all app code is written at the hackathon. Everything committed before Oct 31 11:00 is setup, docs, designs and content only.

## Set up a Mac (one time, about 10 minutes)

```bash
gh repo clone sidsanc/agent-mixer && cd agent-mixer
```

Engineer (Siddhant):
```bash
./setup/mac.sh --role engineer
```

Product (Julius):
```bash
./setup/mac.sh --role product
```

No `gh` yet? Use `git clone https://github.com/sidsanc/agent-mixer.git` instead; the setup script installs `gh`.

Then:
1. `gh auth login`
2. `claude` (start Claude Code in this folder)
3. In Claude Code, type `/mcp`, pick **linear**, then **Authenticate**
4. `./setup/verify.sh` to check everything

## What the setup installs
| | Both | Engineer only |
|---|---|---|
| Tools | Homebrew, git, GitHub CLI, Node 22, Bun, jq, Claude Code | Terse CLI, Agent Relay CLI |
| Claude skills | gstack (YC skills: /office-hours, /design-review, /qa, /browse…), impeccable, taste-skill, Emil Kowalski's design skills, find-skills | |
| Claude plugins | frontend-design | |
| Repo config | Subagents in `.claude/agents/`, Linear connection in `.mcp.json` | `.env` from `.env.example` |

## Subagents
| Agent | For | Owner |
|---|---|---|
| `product-designer` | Screen specs, wording, mockups in `docs/design/` | Julius |
| `seed-profile-writer` | The 10–12 demo profiles in `docs/seed/` | Julius |
| `pitch-writer` | Deck, script, Q&A, submission in `docs/pitch/` | Julius |
| `actor-engineer` | Terse durable actors | Siddhant |
| `relay-engineer` | Agent Relay agents and bridge | Siddhant |
| `frontend-builder` | Phone screens and big-screen party view | Siddhant |
| `demo-qa` | End-to-end demo check before rehearsals | Siddhant |

Ask Claude to use one, e.g. "Use the seed-profile-writer agent to draft the profiles."

## How we stay in sync
Linear is the shared board between both Claudes ([project](https://linear.app/yc-hackathon-agent-mixer/project/haunted-hacks-agent-mixer-9079e41d3b4a), 37 tickets across milestones M0–M6); GitHub carries the files. See `docs/team-protocol.md`.

## Where things are
- `docs/brief.md`: link to the product and pitch brief (source of truth)
- `docs/idea.md`: the idea and its refinements
- `docs/research/`: Terse, Agent Relay, sponsors, event rules
- `apps/`: app code (starts Oct 31, 11:00)
