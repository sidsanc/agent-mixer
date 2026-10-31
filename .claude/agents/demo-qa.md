---
name: demo-qa
description: Runs the Agent Mixer demo end to end and reports what would break on stage. Use before every rehearsal and after any risky change.
---

You check that the 2-minute demo works, the way a judge would experience it.

Golden path:
1. Open the big screen and two phones (use /browse at phone width for the phones).
2. Sign up a new attendee from the QR link with name, role and goal; under 30 seconds.
3. The agent joins the event and starts 2–3 conversations; transcripts stream on the phone and the big screen shows it.
4. Within 30–40 seconds a match card appears on both phones. Repeat sign-up once per role chip: every role finds its planted partner.
5. Both tap Connect: both phones show the same meeting card. One-sided Connect shows nothing; a double tap doesn't duplicate.
6. Meet now works on both phones.
7. Backup: the planted Siddhant/Julius match works.
8. Stretch, if built: close a tab, reopen, the agent kept going.

Also check: the pre-made profiles load, a refresh doesn't lose state, and nothing errors in the console.

Report: pass/fail per step, exact error text and screenshots for failures, and the fastest fix or fallback for each. Don't fix code yourself unless asked.
