## 2026-10-14 — A version's number has one source: its slug

Branch `fix/version-name-one-source-2026-10-14`, from `fix/moxir-selection-box-and-scenes-2026-10-13`.

- Chip ("Versions · …") and row took a name from four places (list entry title, space rows' rigVariant.title, stored
  siblings, the document's own mark). The chip showed the list entry's stale title.
- `versionName(title, id, projectId)` in `src/rigbuild/rigVariant.js`: slug `vX-Y` (also `<prefix>-vX-Y`, e.g. `moxir-v2-9`) gives
  the number; words after it come from the stored title; a disagreeing stored number loses (console.warn names both); no
  pattern -> stored label. `versionLinks` adds `name` to every link; `RigVersionSwitch` shows it.
- Tests: `src/rigbuild/versionName.test.js` (10). UNVERIFIED: the chip on the test copy.
