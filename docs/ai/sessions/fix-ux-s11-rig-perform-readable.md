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

## Review 2
- The target floor named `.vis` and `.show`, which no page carries (roots are `.vis-page`, `.show-page`): the visualise page had no floor. Fixed in rigSteps.css; the test names the real roots with a strict boundary and fails on the previous commit (1 failed).
- known-fixes entry updated for fix round 2 (floor, map label case, 8 tests).

Round 3 (S11): on the Build page at 390 px the 12 px status box spans the full width and sat on the Undo/Redo row (top 110px, 44px tall). The box now starts at 160px (rig bar: +160px), below both the Items button and the Undo row; tests: `buildPhoneTotals.test.js` (starts below Undo/Redo), `readableType.test.js`.
