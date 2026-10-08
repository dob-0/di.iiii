## 2026-10-08 — View and Studio levels of the settings panel

Owner: two parallel UIs for the same settings. `ViewSettingsPanel` takes `level`:
- `view` (public viewer): Look (Current/Form + Light), Zoom Speed, Smooth View, Invert wheel, Mouse mapping with its help, Reset, and "More settings", which swaps in the full list in place ("Fewer settings" returns). No control appears twice.
- `studio` (Studio Display group): everything, grouped Navigation, Orbit & Pan, Zoom, Clip, Look.
Same stores for both (viewSettings.js, viewLook.js, navigation preference); no duplicate state. `ViewSettingsButton` passes `level` through; PublicProjectViewer uses "view", StudioControlCluster "studio".
Tests: src/project/viewport/ViewSettingsPanel.test.jsx (5, pass). Not seen on a real screen: owner's look on a 390 px phone and 1440 desktop is owed (dev server serves the main worktree, not this branch).
Owed: fold Blender-parity settings from the audit reports if they ask for more; the simple level is a first cut (which controls a first-timer needs is a judgement the owner should confirm).
