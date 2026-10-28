---
name: game-playtest
description: "Stage 4 of the di-games routine. Use when a playable v1 passes its checks and real players should try it. Writes the test plan, runs sessions with friends, keeps notes, and turns them into fixes. Done when players ask for another round."
---

# game-playtest: stage 4, sessions with real players

- **Makes:** `docs/playtest/plan.md`, one `docs/playtest/session-<date>-<n>.md` per session, and a fix list.
- **Gate (done when):** the players ask for another round. We ask them; we do not assume it.
- **Who:** game-verifier runs the plan with the owner; game-builder fixes.
- **Templates:** `${CLAUDE_SKILL_DIR}/test-plan-template.md` and `${CLAUDE_SKILL_DIR}/session-notes-template.md`.

## Method (cited)

- The playcentric loop: playtest, evaluate against the player-experience goals, fix, retest (Fullerton,
  *Game Design Workshop*, 5th ed., CRC Press, 2024). The goals are design section 2; the checks are section 8.
- The two templates are ours, built on that loop. They are not a published instrument and are unvalidated.
- After release, Roblox's analytics page gives retention (D1, D7, D30) and session time, with benchmarks
  from 100 daily players (create.roblox.com/docs/production/analytics, read 2026-10-28; the page has no
  playtest guidance). A friends test is far below that size, so use notes and counts, not statistics.

## Steps

1. Write the plan from the template: which build (the commit), which questions, how many sessions and
   players, which devices (PC and phone).
2. Ask before you play. Each tester says yes, and a parent or guardian too when the tester is under 18.
   Write the yes in the session notes. Use first names or handles only. No personal data in the repo.
3. Play in private first: publish to a private experience and invite the testers (game-release, step 4).
4. Run a session. The observer watches and writes; does not help or explain unless the round cannot go on.
   Note what happened, not opinions.
5. At the end ask the same questions every time (the template lists them), and write the answers in the
   players' own words.
6. Sort every note into one kind: bug (it broke), balance (a number is off), clarity (they did not
   understand), feel (a goal feeling missed).
7. Make the fix list: one line each, with the design section it touches. A number changes in `Config` only.
8. Retest the fixes in the next session. The stop line is the design's section 8 line about players asking
   for another round, in as many sessions as the plan names before the first session.

## Counts to write down each session

- rounds started, won, and lost on time
- seconds per round
- times caught (or failed) per player
- bugs that stopped a round, each with the steps to repeat it
- the answer to "another round?" per player

## Rules

- A bug is written with the build and the steps that repeat it.
- A change to the design goes back to the designer and the owner (a new yes).
- The verifier reports; the builder fixes; neither signs off its own work.
- No recording of faces or voices without a separate yes.
