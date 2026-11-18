## 2026-11-17 — Monitor map and phone admin menu (N4679, N4680)

- Owner sent three screenshots and a note: phone admin list scrolls sideways, map needs full screen and movable 2D nodes, the wheel traps the page over the 3D map, and the Arch Mac and other devices are not on the map.
- Changes: `PreferencesShared.jsx` (SectionNav disclosure), `preferences.css`, `MonitorMap.jsx` (full screen, wheel rule, node drag), `MonitorMap3D.jsx` (wheel rule), `monitorHub.js` (tailnet devices as map nodes).
- Tests: `MonitorMapUx.test.jsx` (5) and a hub test; `src/components/preferences` 15+ files pass.
- Looked at on the agent screen (scratch server of this tree): phone menu open, 2D full screen with a dragged node (moved 106 x 52 px), 3D wheel scrolled the page, map shows 10 machine nodes.
- Not done: touch one-finger on 3D; the wiki page for the Monitor was not updated.
