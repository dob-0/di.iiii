## A page project shows page tools only (UX fix wave 3, slice S16, PR a)
- Replaces: the full 3D toolset drawn on every non-empty project, also a page (#1161 opened the page, kept the tools).
- Kept (nothing is lost): "Add a scene" (cluster Scene row, phone bar) brings every 3D tool back with Create open, for the page's life;
  "⚒ All tools" (mode) keeps the old full screen on every project; a page that also holds a scene is unchanged; `?open=create` still opens Create.
- Files: StudioShell.jsx (`pageOnly`, `handleAddScene`, phone bar), StudioControlCluster.jsx (`pageOnly`, `onAddScene`), StudioViewportLayout.jsx (`shared.pageOnly`).
- Measured (agent lane, scratch stack ux-s16): page project 1440 px 13 -> 0 3D buttons, 390 px 8 -> 0; canvas 0 before and after; scene projects 13 / 8 unchanged.
  Pictures and counts: ~/work/agent-reports-2026-10-28/ux-fix/wave3/S16/shots/.
- Tests: StudioShell, StudioControlCluster, StudioViewportLayout, StudioJamMode, StudioCueStrip, move1.golden, viewportMode (5 new fail on origin/dev).
- Not in this PR (PR b): "Add pages or pictures" opening the file chooser (F029); "Add a scene" from the plain project view opening Create on a phone (F086); the "Add something" coach pill on a page.
