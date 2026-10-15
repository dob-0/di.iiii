# docs/venue-to-show-skill-2026-10-15

## The venue-to-show process as one skill + a step check (2026-10-15)

- Owner 14:4x: "why we not learned the creating process? … a month on MOXIR and it still like idiot" (ledger N811).
- `docs/ai/skills/venue-to-show.md`: 14 steps from venue measure to the real cubes/DMX, each with input, command, output,
  check and the owner's look; traps already paid for; his standing choices; the measure of success (v2.12 by a fresh agent in
  ≤ 1 h and ≤ 60 rounds). Same text as the di-atlas skill `skills/venue-to-show/SKILL.md`.
- `scripts/place/venue_to_show_check.py` (+ `venue-to-show-check.test.js`, 3 tests): reads a project document, prints
  OK / MISSING / OWED per step and the command for the next one. Read-only. On moxir-v2-11 (scratch, 14:5x): 11/13 —
  missing: patch (UP-LA40WF ×2, UP-YZ31P ×1 unpatched with `--off-dmx ext-lc-ultra-mk2`), laser frames (the two 40 W lines).
- First migration: the scenes file `scripts/place/rigs/moxir-scenes-50-2026-10-15.json` (was only in agent-reports).
- It supersedes in part the unmerged 10-07 runbook `.claude/skills/venue-show` (PR #808, v1-era `versions.mjs` flow).
- Report with the counts: `~/work/agent-reports-2026-10-15/moxir-50/creating-process-report.md`. Rows N811.1–N811.11.
