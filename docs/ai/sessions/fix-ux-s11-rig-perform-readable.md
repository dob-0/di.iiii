# fix/ux-s11-rig-perform-readable (2026-10-29)

Slice S11 of the UX fixes, round 3. Built on S05's 12 px ladder.

What changes and where the old stays (nothing lost): sub-12 px sizes in `src/rigbuild/*.css` become 12px (the old sizes were a floor bug, kept in git history of `dev` before this commit); the step bar title/numbers move from `--di-faint` to `--di-dim` (`--di-faint` stays the token for rules); the toybox gains `--make-ink-readable` beside `--make-ink-soft` (soft stays for all other lines).

Not done: no before/after pictures at 1440 and 390 (no browser run this round); the "my toybox" door (F103 second half) is in S36; the rig bar's 13 px top-bar link heights (F040) were not measured again.
Tests: `npx vitest run src/rigbuild src/perform src/make src/styles` 168 files / 2483 passed.

## Fix round 2 (reviewer FIX-FIRST)
- Added the 24 px target floor (F040, F094): one rule in rigSteps.css for buttons, fields, step and top-bar links on every rig root; perform.css `.perform-pane`; mapSurface.css small buttons. The window square/dash/cross are already 44 px in raw.css.
- Map labels use `--di-label-case` (was hard-coded uppercase).
- Replaces nothing: it only raises sizes (mode/tool/archive: not needed, no behaviour removed).
- Not seen in a browser this round: F100 phone totals, F096 float-bar contrast, cards slot at 390 px still need the ship pictures.
