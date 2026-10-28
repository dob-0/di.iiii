# di.iiii agent skills

One index of every skill under `.claude/skills/`. A skill is a recipe: when to use it, the steps, the method source. Words: `docs/ai/vocabulary.md`. A production (a place, a client) is an example inside a skill, never a default.

| skill | use it when |
|---|---|
| `open-call` | applications are collected, reviewed and closed out for a linked space (apply form, /admin board, transform to exhibition) |
| `run-di-iiii` | the app must be built, run and driven (sign in, screenshot, two-person flow, tests) to see a change working (`driver.mjs`; on aylmo start servers with `di-dev up <tree>`, not `npm run dev`) |
| `venue` | a place (hall) goes from photos to a rig and a show; the index of the venue-* skills below, in order |
| `venue-paint-plan` | the areas the owner will paint are planned |
| `venue-read-paint` | the owner's painted areas are read back as data |
| `venue-layout` | a rig is laid out against the painted areas |
| `venue-render` | the rig is rendered in the scene and measured on the real GPU |
| `venue-integrate` | the result is put into the place's project |
| `venue-review` | the result is shown back and reviewed |
| `venue-gear-check` | a rental list arrives: makers verified, each code confirmed / probable / equivalent / unknown |
| `venue-paper` | the patch, the crew's paper and the rental order draft are made |
| `venue-safety-packet` | the rigging safety packet and site checklist are drafted for the humans who sign |
| `show-scenes-job` | a show's light scenes are designed or rebuilt (safe `epic-build` flags by default) |
| `show-checkpoint` | before ANY change to a live or approved show: snapshot, RESTORE.md, the owner's yes, change, measure |
| `hall-compare` | before any lamp check: compare the project and the desk with the place's hall reference (`--ref`) |
| `release` | a change must be live: dev deploy, dev to main, hotfix, the Mac prod path, the land check, rollback |
| `job-end-gate` | the last step of every job: physics, sterile, cost, what was built and where it lives |

## How to add a skill
1. One folder `.claude/skills/<name>/SKILL.md` (lowercase, hyphens). Frontmatter exactly two keys: `name` (equals the folder) and `description` (what it does AND when to use it, one paragraph).
2. House format: see `venue/SKILL.md` (index/pointer) and `run-di-iiii/SKILL.md` (steps). One source: a skill holds the rules that must never be skipped and points to a longer doc in `docs/ai/skills/`; never keep two copies of one text.
3. Name the method source (paper, standard, institution, or a dated decision file). Mark any command you did not run as UNVERIFIED.
4. No production name as a default or special case; use the words of `docs/ai/vocabulary.md`.
5. Add one line to the table above, in the same commit.

## How a teammate gets these skills
They come with the repo checkout: clone or pull `dob-0/di.iiii` and Claude Code reads `.claude/skills/` from the project folder, no install step. Every SKILL.md has a **Needs** line (tools, versions). Paths in skills are repo-relative; tools that exist only on a di-atlas machine (`di-dev`, `di-test-browser`, `di-show`, `di-merge`, `ledger-add`) are named as such, each with a plain fallback. Memory notes are cited as dated background only; no skill needs them to run.
