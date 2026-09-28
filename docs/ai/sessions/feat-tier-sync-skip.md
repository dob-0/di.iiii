## 2026-09-28 — tier-sync can hold projects back (`--skip`)

The owner asked for local's new work on dev "but not publish things that don't need to be seen by
everyone". tier-sync could narrow to one `--space` but never leave a project out, so a space holding
one internal page had to be copied whole or not at all. `--skip space/project` or `--skip space`
(repeatable, comma-separated) now drops them from the finished plan in every mode, and a space left
with nothing is not created. Guard: `applySkip` in `scripts/tier-sync.test.js` (3 tests, red on the
old script: `applySkip is not a function`).

First use (2026-09-28): 114 of local's 137 dev-missing projects copied; 23 held back — ops notes with
security to-dos, a funder and fellowship marked private, the owner's email, the Dilijan camp, internal
brand work, a support sketch, five Open Space looks whose images no tier holds, three test leftovers,
and `drive-decisions` (the same id lives in `decisions` on dev; a plain copy would have overwritten
it silently). Spaces the script creates start private (`isPublic` unset) and are labelled by slug.
