## 2026-11-16 — Monitor calm layout: Needs you, vital strip, Now/Map/Lists, grouped map

- UI only, no server change. New: monitorCalm.js, monitorMapGroups.js, monitorTier.js, MonitorVital/Activity/Lists/Drawer components; MonitorSection, MonitorMap, MonitorMap3D, MonitorWorkspace and preferences.css reworked; wiki entry 'monitor-board' updated.
- Real snapshot (never committed): first desk screen about 20 to 8 boxes, map 36 to 11 nodes, 0 repeated names, 2D text 13.1 px on desk, 3D 12 labelled cards with 0 overlaps.
- Owed: phone 2D map text is 7 px (List is the phone default); idle rAF in 3D is about 500 per 10 s and comes from hooks/useCameraControls.js (app-wide, also on the Now tab); "since when" for agents is not in the snapshot.

## 2026-11-16 (polish round) — empty column, one-row strip, linked map, phone map

- Now: Activity spans the width under the agents and its events flow in columns; empty area at open on desk 1440x1000 about 300 px column (1000x300) to 91 px strip (9 %).
- Vital strip: one row at 1440 (2 rows to 1): chips padded tighter, "Pull requests" shortened to "PRs"; text stays at --di-text-3 or larger; the phone still wraps (5 rows).
- 2D map: every holds line (the link from a space or group to its tier) is drawn when the map has at most 12 of them (visibleEdges holdsMax); the centre "di.iiii" text box became a plain square mark. At fit: 11 labelled nodes, min text 14.3 px (was 13.1), 0 overlaps, 0 repeated names.
- Phone: List is the default under 600 px and the 2D button is gone there (3D and List only); a stored 2D choice falls back to List.
- Owed: idle rAF in 3D varies 212 to 587 per 10 s between runs (hooks/useCameraControls.js, app-wide, unchanged here).

## 2026-11-16 (round 3) — white box over "heard ... ago"

- Cause: the heartbeat mark (`.monitor-live-mark.is-beat`) is re-keyed on every snapshot and its `monitor-beat` keyframe scaled the 1 rem square to 2x in the white text colour (`--di-text`), a 2 rem white box over the label beside it. Seen in monitor-look/calm2/desk-now.png.
- Fix: the beat now fades the mark's own colour (opacity 0.3 to 1); no scale, no white. Still off under reduced motion.
- Test: src/styles/monitorBeat.test.js (the keyframe has no transform, scale or text colour; reduced motion turns it off). Monitor tests + guards: 479 passed.
