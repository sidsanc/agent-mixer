# Team protocol

## Who does what
| | Siddhant (engineer) | Julius (product) |
|---|---|---|
| Owns | Everything in `apps/` and `packages/`, deployment, technical Q&A | Designs, seed profiles, deck, demo script, submission, pitch |
| Agent | Claude Code | Codex |
| Agent writes to | Code, `docs/`, Linear | `docs/design/`, `docs/seed/`, `docs/pitch/`, Linear |
| Never touches | Pitch wording without Julius | App code |

## How the two agents stay in sync
Siddhant uses Claude Code; Julius uses Codex. Claude reads `CLAUDE.md`, Codex reads `AGENTS.md`; both hold the same rules.
- **Linear** is the shared board: tasks, status, handoffs. Both agents read and write it through the Linear MCP server (`.mcp.json` for Claude, `.codex/config.toml` for Codex). Rules: `.claude/skills/linear-sync/SKILL.md`.
- **GitHub** carries files. Julius's Codex commits designs and content to `docs/`; Siddhant's Claude pulls them. Small, frequent commits with clear messages; pull before starting work.
- **Agent Relay (optional, day-of):** both agents can also join one Relay workspace for live messages (`relay init --hosted` on Siddhant's Mac, `relay init --key <key>` on Julius's). It lets us say in the pitch that we built Agent Mixer with Claude and Codex talking over Agent Relay: mixed vendors, the same story as the product. Linear stays the source of truth.

## Handoff format
Every "done" message, in Linear or out loud:
1. Start with the ticket in square brackets: `[YC-123] Ticket title`.
2. Provide the direct Linear ticket URL.
3. Provide the direct GitHub PR URL when one exists; otherwise say that no PR applies.
4. Say what was completed.
5. Say what the other person can now use.
6. Give a sample input and expected output.
7. Say how it was tested.
8. Note known limits or the fallback.

Never mention a ticket or PR without its direct link.

## Blocker rule
- Try alone for 5 minutes.
- At 5 minutes, tell the other person the exact error.
- At 10 minutes, switch to the planned fallback.

## Day-of checkpoints
| Time | Check |
|---|---|
| 11:20 | Shared data shape agreed; Julius's designs and profiles handed over |
| 1:00 | One person signs up and appears in the event |
| 2:00 | Two agents talk over Relay and propose a match; go/no-go on stretch (external agent) |
| 2:45 | Full demo rehearsal |
| 3:15 | Feature freeze; record backup video |
| 3:50 | Submitted on Builderbase |

## PRs and commits
- Every major change or bug fix goes through a PR. Work on a branch per ticket, e.g. `yc-20-intro-actor`.
- The PR title starts with the ticket in square brackets: `[YC-20] Intro actor: exactly-once meeting card`.
- Keep the PR description short: what changed, how it was tested, and limits. No code dumps.
- Several commits per ticket are fine. Keep each commit small and focused, so any one can be rolled back on its own.
