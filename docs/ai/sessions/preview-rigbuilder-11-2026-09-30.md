## 2026-09-30 — preview rigbuilder.11: rectangular controls, the sheet reads the desk, the folded version row

- Not for merging to dev: an integration branch for the owner's own install. It is `fix/moxir-square-controls` (which carries the whole rigbuilder.10 line: the cut, the halo, the X, hall 09-29, smart view, beams in haze, the LTP cue layer, the version switch from live versions, the grouped patch flags) plus `feat/moxir-sheet-reads-desk` and `feat/moxir-version-row-phone`, merged without conflicts.
- What the owner sees new over rigbuilder.10: no pills or circles on the version switch, view bar, Walk/Fly and project switcher; the patch sheet's table and counts follow the desk, like the room's steps row; labelled copies fold behind "Old versions (n)" once their marks carry `copyOf`; a versions control in walk mode.
- Tests: each branch's touched suites passed on its own branch (sheet 53/53, version row 50/50, square controls 47/47); the merged result is re-run before the package is built, and the count is recorded in the install note.
- Not seen on a real screen when this was written; the build, install and look come next, on the owner's machine.
- Still owed: `copyOf` on the six old-hall copies (data, not code); the two X old-hall copies have no version mark at all.
