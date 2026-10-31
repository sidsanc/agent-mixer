---
name: linear-sync
description: How Siddhant's and Julius's Claudes coordinate through Linear. Use at the start of any work session, when a task is done or blocked, and when asked "what's the status" or "what should I work on".
---

# Linear sync

Linear is the shared board between the two Claudes and the two humans. The Linear MCP server is configured in `.mcp.json`.

## Board
- **Team:** Agent Mixer. **Project:** Haunted Hacks.
- **Statuses:** Todo, Now, Blocked, Done, Cut. Keep at most one issue in Now per person.
- **Labels:** `eng` (Siddhant) or `product` (Julius). Assign the issue to its human owner.

## At the start of a session
1. List open issues in the project. Note anything Blocked that's waiting on your side.
2. Tell your human what changed since last time in two or three lines.
3. Move the issue you're starting to Now.

## When something is done or blocked
Post a comment on the issue in this exact format, then move it to Done or Blocked:

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
