## Studio panels: one file per window (UX round, slice S08)
- `src/studio/components/StudioShellPanels.jsx` (2,241 lines) moved, line for line, into `src/studio/components/panels/`:
  PanelHeader, LibraryPanel (with GeoSwitcher, JamEditPanel), AssetsPanel (with DriveImportSection, CommonsSection),
  StructurePanel, fields (NumberBox, NumberField, MiniRow, SliderField, ColorField, ToggleField, CollapsibleSection),
  ProjectSections (ViewsSection, VisitorChromeSection, LightEnvSection), ProjectPanel, HistoryPanel, TimelinePanel,
  ActivityPanel, CodeEditorArea, FilesPanel, PublishPanel, PopoutDialog, and panelUtils.js (assetSrc, formatTimestamp).
- Nothing replaced, nothing lost: `StudioShellPanels.jsx` stays as a barrel with the same 16 exports, so StudioShell.jsx,
  every test and every `vi.mock('./StudioShellPanels.jsx')` keep working untouched. New code may import from `panels/`.
- The split is reproducible: the script that made it lives with the round's report
  (`~/work/agent-reports-2026-10-28/ux-fix/wave2a/S08/split.py`); a line-count check found no line only in the old or only in the new.
- `src/copyVocabulary.test.js` now scans the panels/ files too, so the copy check still covers the same words.
- Tests: `vitest run src/studio src/copyVocabulary.test.js src/components/surfaceBar.embed.test.jsx src/landing/landingPromises.test.js src/project/components`: 120 files, 1127 passed. eslint clean.
- Look: the Studio on a scratch scene, desktop 1440x900 and phone 390x844, old file vs barrel on the same stack: 9 picture pairs, 0 pixels differ.
- Not seen in pictures: the agent screen had no WebGL, and the pictures show the Create panel and the frame only; the other panels are covered by their unit tests only.
