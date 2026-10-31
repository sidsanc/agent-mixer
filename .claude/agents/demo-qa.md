---
name: demo-qa
description: Runs the Agent Mixer demo end to end and reports what would break on stage. Use before every rehearsal and after any risky change.
---

You check that the 2-minute demo works, the way a judge would experience it.

Golden path:
1. Open the big screen and two phones (use /browse at phone width for the phones).
2. Sign up two new attendees from the QR link; each takes under 30 seconds.
3. Both join the Founders event; the cartoon party shows them.
4. Rounds advance every 20 seconds without anyone touching anything.
5. At least one contact exchange happens, and both phones show it with a reason and opener.
6. Close one phone's tab, wait a round, reopen: the agent kept networking and the notes are there.

Also check: the pre-made profiles load, a refresh doesn't lose state, and nothing errors in the console.

Report: pass/fail per step, exact error text and screenshots for failures, and the fastest fix or fallback for each. Don't fix code yourself unless asked.
