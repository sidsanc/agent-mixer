# Agent Mixer

Your agent works the room, so you only have the conversations worth having. Built at Haunted Hacks (Oct 31, 2026) by Siddhant Sancheti and Julius Leung.

> **Rule:** all app code is written at the hackathon. Everything committed before Oct 31 11:00 is setup, docs, designs and content only.

## Run the app

What it is: sign up once, pick an event, and your agent talks one-to-one with other people's agents over Agent Relay. Terse actors keep everything. When both people Connect, a contact card lands in Connections, with chat and Meet now.

```bash
bun install
bun run dev:relay      # terminal 1: local Agent Relay engine (:8787)
bun run dev            # terminal 2: Terse actors (:7100), server (:3001), web (:5173)
```

- `.env` (never committed) needs `ANTHROPIC_API_KEY`. Without it, agents use scripted lines. Relay keys are created on first run.
- The server reads `RELAY_BASE_URL=http://127.0.0.1:8787/v1` for the local Relay engine, `STORE=terse` (the default), and `EVENT_ID` to pick a clean event, e.g. `haunted-hacks-demo`.
- Phone screens: `/` (sign up), `/events`, `/me`. Projector: `/screen`. `?mock=1` runs without a server.
- Test: `bun run test:e2e` (start a server with its own `EVENT_ID` first) and `bun apps/actors/scripts/smoke.ts`.
- Public link for phones: `cloudflared tunnel --url http://localhost:5173`.
- How it fits together: `docs/architecture.md` and `docs/architecture/router.md`.

## Set up a Mac (one time, about 10 minutes)

```bash
gh repo clone sidsanc/agent-mixer && cd agent-mixer
```

Engineer (Siddhant):
```bash
./setup/mac.sh --role engineer
```

Product (Julius, on Codex):
```bash
./setup/mac.sh --role product --agent codex
```

`--agent` picks the coding agent: `claude` (default), `codex` or `both`.

No `gh` yet? Use `git clone https://github.com/sidsanc/agent-mixer.git` instead; the setup script installs `gh`.

Then, with Claude Code:
1. `gh auth login`
2. `claude` (start Claude Code in this folder)
3. In Claude Code, type `/mcp`, pick **linear**, then **Authenticate**
4. `./setup/verify.sh` to check everything

Or with Codex:
1. `gh auth login`
2. `codex` in this folder (or open the folder in the Codex app). Sign in with ChatGPT and **trust the folder** when asked, so Codex loads `.codex/config.toml`.
3. `codex mcp login linear` to connect your Linear account
4. `./setup/verify.sh` to check everything

## What the setup installs
| | Claude | Codex | Engineer only |
|---|---|---|---|
| Tools | Homebrew, git, GitHub CLI, Node 22, Bun, jq, Claude Code | Same, with Codex CLI instead of Claude Code | Terse CLI, Agent Relay CLI |
| Skills | gstack (/office-hours, /design-review, /qa, /browse…), impeccable, taste-skill, Emil Kowalski's design skills, find-skills | gstack as `gstack-*` skills, plus the same design skills | |
| Plugins | frontend-design | n/a | |
| Repo config | `CLAUDE.md`, subagents in `.claude/agents/`, Linear in `.mcp.json` | `AGENTS.md`, Linear in `.codex/config.toml` | `.env` from `.env.example` |

## Subagents
| Agent | For | Owner |
|---|---|---|
| `product-designer` | Screen specs, wording, mockups in `docs/design/` | Julius |
| `seed-profile-writer` | The 4–6 demo agents and planted partners in `docs/seed/` | Julius |
| `pitch-writer` | Deck, script, Q&A, submission in `docs/pitch/` | Julius |
| `actor-engineer` | Terse durable actors | Siddhant |
| `relay-engineer` | Agent Relay agents and bridge | Siddhant |
| `frontend-builder` | Phone screens and big-screen party view | Siddhant |
| `demo-qa` | End-to-end demo check before rehearsals | Siddhant |

Ask Claude to use one, e.g. "Use the seed-profile-writer agent to draft the profiles." Codex has no subagents; ask it to follow the file instead, e.g. "Follow `.claude/agents/seed-profile-writer.md` and draft the profiles." `AGENTS.md` lists these playbooks.

## How we stay in sync
Linear is the shared board between Siddhant's Claude and Julius's Codex ([project](https://linear.app/yc-hackathon-agent-mixer/project/haunted-hacks-agent-mixer-9079e41d3b4a), tickets across milestones M0–M6); GitHub carries the files. See `docs/team-protocol.md`.

## Where things are
- `docs/brief.md`: the product brief (source of truth)
- `docs/idea.md`: the idea and its refinements
- `docs/research/`: Terse, Agent Relay, sponsors, event rules
- `apps/`: app code (starts Oct 31, 11:00)
