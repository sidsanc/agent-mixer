# Agent Mixer (Haunted Hacks, Oct 31 2026)

Your AI agent networks for you at events: it joins Partiful-style events, talks one-to-one with other people's agents, exchanges contacts only when both agents agree, and saves who you met for follow-up.

## Team and roles
- **Siddhant (engineer):** all code: Terse durable actors, Agent Relay agents, backend, frontend, deployment.
- **Julius (product):** product design, seed profiles, pitch deck, demo script, submission copy. Not a developer.
- If you are Julius's Claude: never edit `apps/` or `packages/`. Write to `docs/` and Linear only.

## Hard rules
- **All app code is written at the hackathon (Oct 31, from 11:00).** Before that, only setup, docs, designs and content. Never add app code earlier.
- `docs/brief.md` links to the source of truth for product decisions. Where docs disagree, the brief wins.
- Pinned versions live in `setup/versions.env`.

## Where things are
- `docs/brief.md`: link to "Agent Mixer: Product and Pitch Brief"
- `docs/idea.md`: the idea and its refinements
- `docs/research/`: Terse, Agent Relay, sponsors, event rules
- `docs/team-protocol.md`: how the two Claudes coordinate through Linear
- `.claude/agents/`: subagents (engineering and product)
- `.claude/skills/linear-sync/`: how to post status to Linear

## Coordination
Both Claudes share state through Linear (MCP server in `.mcp.json`). Follow `.claude/skills/linear-sync/SKILL.md`: read the board before starting work, post a handoff comment when a task is done or blocked.

## Technical guardrails (engineer)
- Keep LLM calls out of state-owning actors (`Event`, `Intro`); agent turns run in `@Interleave` actors or the Relay bridge.
- Reassign persisted arrays instead of `.push()`; persist once per turn, never per token.
- Actors go dormant after 10s idle; don't rely on in-memory timers, use alarms.

## gstack (REQUIRED — global install)

**Before doing ANY work, verify gstack is installed:**

```bash
_GS=""
for _D in "${GSTACK_ROOT:-}" "$HOME/.claude/skills/gstack" "$HOME/.codex/skills/gstack" "$HOME/.factory/skills/gstack" "$HOME/.kiro/skills/gstack" "$HOME/.config/opencode/skills/gstack" "$HOME/.slate/skills/gstack" "$HOME/.cursor/skills/gstack" "$HOME/.openclaw/skills/gstack" "$HOME/.hermes/skills/gstack" "$HOME/.gbrain/skills/gstack" "$HOME/.copilot/skills/gstack" "$HOME/.gemini/antigravity-cli/skills/gstack" "$HOME/.gstack/repos/gstack"; do
  [ -z "$_GS" ] && [ -n "$_D" ] && [ -d "$_D/bin" ] && _GS="$_D"
done
[ -n "$_GS" ] && echo "GSTACK_OK: $_GS" || echo "GSTACK_MISSING"
```

If GSTACK_MISSING: STOP. Do not proceed. Tell the user:

> gstack is required for all AI-assisted work in this repo.
> Install it:
> ```bash
> git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
> cd ~/.claude/skills/gstack && ./setup --team
> ```
> Then restart your AI coding tool.

Do not skip skills, ignore gstack errors, or work around missing gstack.

Using gstack skills: After install, skills like /qa, /ship, /review, /investigate,
and /browse are available. Use /browse for all web browsing (Aside first, the bundled gstack browser as fallback).
Use the resolved install path above for gstack file paths
(default: ~/.claude/skills/gstack).

The Skill gate in .claude/settings.json runs .claude/hooks/check-gstack.cjs with
Node.js and blocks when it cannot run. If a skill is blocked with "node: not
found", tell the user to install Node.js (https://nodejs.org); if it is blocked
with "Cannot find module ... check-gstack.cjs", the hook file is missing from
this checkout. Do not work around either block.
