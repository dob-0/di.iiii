## 2026-11-16 — Monitor calm layout: Needs you, vital strip, Now/Map/Lists, grouped map

- UI only, no server change. New: monitorCalm.js, monitorMapGroups.js, monitorTier.js, MonitorVital/Activity/Lists/Drawer components; MonitorSection, MonitorMap, MonitorMap3D, MonitorWorkspace and preferences.css reworked; wiki entry 'monitor-board' updated.
- Real snapshot (never committed): first desk screen about 20 to 8 boxes, map 36 to 11 nodes, 0 repeated names, 2D text 13.1 px on desk, 3D 12 labelled cards with 0 overlaps.
- Owed: phone 2D map text is 7 px (List is the phone default); idle rAF in 3D is about 500 per 10 s and comes from hooks/useCameraControls.js (app-wide, also on the Now tab); "since when" for agents is not in the snapshot.
