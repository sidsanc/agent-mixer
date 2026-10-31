---
name: linear-sync
description: How Siddhant's and Julius's Claudes coordinate through Linear. Use at the start of any work session, when a task is done or blocked, and when asked "what's the status" or "what should I work on".
---

# Linear sync

Linear is the shared board between the two Claudes and the two humans. The Linear MCP server is configured in `.mcp.json`.

## Board (already set up)
- **Team:** YC-Hackathon-Agent-mixer (key `YC`). **Project:** Haunted Hacks: Agent Mixer (`P-YC-1`).
- **Milestones and tickets:** M0 Prep → M6 Ship, tickets YC-5 to YC-41 plus stretch tickets from YC-42, mirroring `docs/linear-plan.md`. Each ticket title starts with its plan ID, e.g. "M2-2 Event actor: …", and its description holds the "Done when" check.
- **Statuses:** Todo → In Progress → Done. Cut work goes to Canceled. Keep at most one issue In Progress per person.
- **Blocked:** add the `blocked` label and a comment saying what's needed; remove the label when unblocked.
- **Labels:** owner `eng` (Siddhant) or `product` (Julius), plus one area label (`backend`, `agents`, `frontend`, `design`, `content`, `pitch`, `ops`). `eng` issues are assigned to Siddhant; assign `product` issues to Julius once she joins the workspace.
- New tickets: same title format with the next free plan ID in that milestone; search first so nothing is duplicated.

## At the start of a session
1. List open issues in the project. Note anything Blocked that's waiting on your side.
2. Tell your human what changed since last time in two or three lines.
3. Move the issue you're starting to In Progress.

## When something is done or blocked
Post a comment on the issue in this exact format, then move it to Done, or add the `blocked` label:

```
Done: <what was completed>
You can now use: <file, screen, endpoint or doc, with path or link>
Example: <sample input and expected output, or where to look>
Tested by: <how>
Limits: <known gaps or the fallback>
```

For a blocker: `Blocked by: <exact error or missing decision>` and mention the other person.

## Handing work across
- Julius's Claude creates `eng` issues for Siddhant when a design or content is ready ("Build sign-up screen per docs/design/sign-up.md").
- Siddhant's Claude creates `product` issues for Julius when a decision or content is needed ("Pick a name", "Review contact card wording").
- Link the file or doc in the issue; don't paste long content.

## Don't
- Don't change another person's issue status without a comment.
- Don't paste API keys, `.env` values or personal data into Linear.
- Don't create duplicate issues; search first.
