# feat/venue-profile-go-2026-11-01 — venue profile, `di show go`, checkpoint, show skills

Slice S13 of the show-day fix plan (agent-reports-2026-11-01/audit-show-day/PLAN.md), gaps G07, G10, G12, G13, G15, G16, G20, G27.
Base `origin/stage/copy9-2026-10-31` (63d9dc1dd). Built 2026-11-01 03:0x–03:4x by one Opus agent.

## What changed
- `scripts/show/` (new): `di show go | checkpoint | profile | mark`, the venue profile loader (flag > DI_* env > venue file >
  default; a machine marked for another venue is refused), a read-only probe, the GO lines under ILDA's four phases, the
  checkpoint (from di-atlas a0ffd48), a lint that fails on a production name or id in any default, two seed profiles.
- `scripts/di/cli.mjs` + `ui.mjs`: the `show` command (lazy import, a clear message when a pack has no show tools).
- `scripts/pack-runtime.mjs`: ships `scripts/show` as `show/` beside `cli/` (tests left out).
- Skills: `show-checkpoint` corrected (the command exists now), `show-night` and `crew-channel` new, `job-end-gate` gains
  2b scratch-keep and 5b LESSON/SLIP closure.

## Found while building (each guarded by a test)
- GNU `readlink -f` prints a path for a missing `current` link: a machine with no running di read as version "current".
  Both bash halves use `readlink -e`; `checkpoint.test.mjs` "fails (exit 1) … when no version is running".
- A static import of `../show/` from `scripts/di/ui.mjs` broke every `di` command in an installed copy (`cli/` has no
  `../show/` until the pack ships it); caught by `openFile.test.js`. ui.mjs now holds a pointer, not an import.
- The stage machine's tailnet address was kept out of this public repo: host and user live in the operator machine's
  `~/.di/data/show/venues/<id>.json` or `DI_SHOW_HOST`.

## Tests
`npx vitest run scripts/show/ scripts/di/ scripts/packProfile scripts/check-agent-frontmatter` → Test Files 51 passed (51),
Tests 754 passed | 1 skipped (755). `npx eslint scripts/show scripts/di/cli.mjs scripts/di/ui.mjs` → 0 problems.

## Owed (rows)
- GO seen once on the real stage machine, in daylight (owner); `di show mark <id>` on it (provisioning, S14).
- The owner confirms both seed profiles (`toConfirm` lists); LSO, zone, stop limits (G06); the port plan (G12).
- The interfaces GO reads from S10 (release.json, PATCHES), S11 (watch unit + csv), S12 (`safety` block), S14
  (`midi.heardAt`, posture unit): NO-GO until each lands; names are this slice's, one line to change each.
- "venue" is not in `docs/ai/vocabulary.md` (its word is "place"): the owner or the word keeper decides.
- Project documents of a space are not yet in `di show checkpoint` (skill step 1b by hand).
- Wiki entry for `di show` (`src/wiki/wikiContent.js`) not written.
