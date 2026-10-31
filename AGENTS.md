# Agent Mixer (Haunted Hacks, Oct 31 2026)

Instructions for Codex and other agents that read `AGENTS.md`. Claude Code reads `CLAUDE.md`; both files hold the same rules.

Your agent works the room, so you only have the conversations worth having. Your AI agent joins an event, talks one-to-one with other people's agents, and proposes matches. When both humans choose Connect, both phones get a meeting card with a place and an opener.

## Team and roles
- **Siddhant (engineer):** all code: Terse durable actors, Agent Relay agents, backend, frontend, deployment.
- **Julius (product):** product design, seed profiles, pitch deck, demo script, submission copy. Not a developer.
- If you are Julius's agent: never edit `apps/` or `packages/`. Write to `docs/` and Linear only. Explain choices in plain language; don't ask Julius to run code beyond the setup commands. Commit and push for her when she asks.

## Hard rules
- Every major change or bug fix goes through a PR titled `[YC-xx] ...`, with a short description and small, focused commits. See `docs/team-protocol.md`.
- **All app code is written at the hackathon (Oct 31, from 11:00).** Before that, only setup, docs, designs and content.
- `docs/brief.md` is the source of truth for product decisions. Where docs disagree, the brief wins.
- Pinned versions live in `setup/versions.env`.
- Never commit `.env` or paste keys into Linear.

## Where things are
- `docs/brief.md`: the product brief (source of truth). Read it first.
- `docs/linear-plan.md`: milestones and tickets (mirrors Linear)
- `docs/design/`, `docs/seed/`, `docs/pitch/`: Julius's output
- `docs/research/`: Terse, Agent Relay, sponsors, event rules
- `docs/team-protocol.md`: how the two humans and their agents coordinate

## Playbooks
The files in `.claude/agents/` and `.claude/skills/` are written for Claude, but they are plain instructions any agent can follow. When asked for one of these jobs, read the file and follow it:

| Job | Playbook | Output |
|---|---|---|
| Screen specs, wording, mockups | `.claude/agents/product-designer.md` | `docs/design/` |
| Demo agents and planted partners | `.claude/agents/seed-profile-writer.md` | `docs/seed/` |
| Deck, demo script, judge Q&A, submission | `.claude/agents/pitch-writer.md` | `docs/pitch/` |
| Posting status to Linear | `.claude/skills/linear-sync/SKILL.md` | Linear comments and statuses |

Mockups are static HTML pages (one per screen) that open in a browser, or images. They are design references, not app code.

## Coordination
Both agents share state through Linear. The Linear MCP server is declared in `.codex/config.toml` (Codex) and `.mcp.json` (Claude). Follow `.claude/skills/linear-sync/SKILL.md`: read the board before starting work, and post a handoff comment when a task is done or blocked.

## Technical guardrails (engineer)
- Keep LLM calls out of state-owning actors (`Event`, `Intro`); agent turns run in `@Interleave` actors or the Relay bridge.
- Reassign persisted arrays instead of `.push()`; persist once per turn, never per token.
- Actors go dormant after 10s idle; don't rely on in-memory timers, use alarms.

## gstack
gstack's skills are installed for Codex by `./setup/mac.sh --agent codex` (they show up as `gstack-*`, e.g. ask for `gstack-office-hours` or `gstack-design-shotgun`). In Codex they are advisory; use them when they fit.
