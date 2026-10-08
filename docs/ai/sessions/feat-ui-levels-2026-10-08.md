## 2026-10-08 — View and Studio levels of the settings panel

Owner: two parallel UIs for the same settings. `ViewSettingsPanel` takes `level`:
- `view` (public viewer): Look (Current/Form + Light), Zoom Speed, Smooth View, Invert wheel, Mouse mapping with its help, Reset, and "More settings", which swaps in the full list in place ("Fewer settings" returns). No control appears twice.
- `studio` (Studio Display group): everything, grouped Navigation, Orbit & Pan, Zoom, Clip, Look.
Same stores for both (viewSettings.js, viewLook.js, navigation preference); no duplicate state. `ViewSettingsButton` passes `level` through; PublicProjectViewer uses "view", StudioControlCluster "studio".
Tests: src/project/viewport/ViewSettingsPanel.test.jsx (5, pass). Not seen on a real screen: owner's look on a 390 px phone and 1440 desktop is owed (dev server serves the main worktree, not this branch).
Owed: fold Blender-parity settings from the audit reports if they ask for more; the simple level is a first cut (which controls a first-timer needs is a judgement the owner should confirm).

## 2026-10-08 — wave 2 slice: Blender view keys in the PUBLIC viewer (branch feat/nav-elite-2026-10-08)

- From the Blender navigation parity audit (agent-reports-2026-10-08/blender-nav-parity.md, top gap 1-3): Numpad 1/3/7 (+Ctrl), Numpad 2/4/6/8 orbit steps, Home did not move the public camera (their listener lived only in StudioEditor.jsx). `PublicProjectSceneSurface.jsx` now listens with the same pure `resolveViewKey` and `runViewCommand`.
- Measured on the real RTX 3080 (di-test-browser): Numpad7 top (camera to y 25), Numpad1 front, Numpad3 right, Numpad4/6 orbit +-15 deg (they return to the exact start), Home frame all.
- Seen: Home frames the whole project loosely (the hall is about a quarter of the width) because the bounding sphere includes tall beams/off-hall entities. To tighten. Not touched by the owner's hands.
- Merged here: feat/ui-levels-2026-10-08 (View / Studio levels of the settings panel) and feat/nav-fly-motion-2026-10-08 (flyMotion.js, unwired).
