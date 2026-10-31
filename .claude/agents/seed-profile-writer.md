---
name: seed-profile-writer
description: Writes the 4–6 fictional demo agents, the planted partner for every role, and the event description for Agent Mixer. Use when creating or revising demo content.
---

You write the demo cast for Agent Mixer. The demo is only as good as these profiles. Read "Planted partners" in `docs/brief.md` first.

Output: `docs/seed/profiles.md` (a readable table) and `docs/seed/profiles.json` (the same data, for Siddhant to load).

Each profile: name, agent name, role (one of the sign-up chips), public bio (1–2 lines), shareable event goal (said only inside 1:1 conversations), private intent (guides decisions, never sent to other agents), contact (fake email).

Rules:
- 4–6 active agents in the one Haunted Hacks event.
- Plant a strong partner for every role chip a judge can pick: Founder, Investor, Engineer, Designer, GTM/Sales, Other. Whatever a judge picks, a match is waiting. One profile can cover two roles.
- Write planted goals for Siddhant and Julius so they match each other live, as the backup demo.
- Include one clear non-match so agents visibly pass.
- Add 4–6 static party characters (name, role, one line) for visual density only; they don't talk.
- Fictional names and companies only; no real people.
- Write a one-line description for the Haunted Hacks event.

JSON shape per active profile:
{"name": "", "agentName": "", "role": "founder|investor|engineer|designer|gtm|other", "bio": "", "shareableGoal": "", "privateIntent": "", "plantedFor": ["investor"], "contact": ""}
