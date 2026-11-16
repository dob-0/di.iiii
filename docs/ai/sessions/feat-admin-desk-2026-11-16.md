## 2026-11-16 — the admin page as a desk: tiles, section windows, hints instead of text

- /admin opens on a tile per section (a number or a state, no sentence); a tile opens the section as a DesktopWindow in screen space, several side by side, arrangement remembered per device; `/admin#<section>` links keep working, `#monitor-full` too. Phone: one window at a time.
- Helper sentences became ? hints, empty "nothing selected" boxes became drawers, long lists became folds. Gates unchanged: the Monitor window only after GET /api/monitor answered 200, admin-only sections.
- Table of windows and hash links: src/components/preferences/adminWindows.js; bodies of the staff windows: AdminWindowBodies.jsx; styles: src/styles/adminDesk.css.
- Still undone: a wiki entry (src/wiki/wikiContent.js), an idle-frame re-measure of the 3D Monitor, and first-screen words are still above 60 in a few desk windows (Status, Scene objects, Switches, Spaces and users).

## 2026-11-16 round 2 — knowledge windows, a home that fills the desk, fewer words, wiki

- Stacked on #1294 (monitor knowledge data) and #1295 (calm Monitor). New windows Rules, Hooks, Requests (group Knowledge, owner-only like the Monitor: absent until GET /api/monitor answers 200) in KnowledgeWindows.jsx, all data through monitorKnowledge.js; the Agents window lists each chat's helpers. One slow read of GET /api/monitor (useMonitorSnap.js, 30 s) feeds the home and these windows; the Monitor window keeps its own stream.
- Home (AdminHome.jsx): the calm Monitor's Needs-you rows (read-only; the action opens the Monitor window) or "All well", tiles in a flex grid that fills the width and height, the calm Activity list beside. Without the Monitor: tiles only.
- Text diet: Status Signals, Manage Traffic lists and Asset commons became folds, an empty sweep box and an empty Objects box are gone, the Map legend became the Map hint. Wiki article admin-desk added.
- Owed: opening the Monitor on a chosen drawer (the Needs-you action opens the window only; the drawer state lives in MonitorSection, another branch), a Helpers tile of its own (helpers are a chip in the Agents tile and window), 3D idle-frame re-measure.

## 2026-11-16 (round 3) — Skills, waiting requests, fewer words

- Skills window and tile (owner-only, after GET /api/monitor answered 200): name and scope chip per row, description in the drawer, filter chips by scope, tile number = skills count. Rows come from `knowledgeSkills` (merged in from #1294).
- Requests: ledger rows as before plus a group "Waiting for the ledger" from `monitorKnowledge(snapshot).waiting` (guarded: `waiting?.rows || []`, so it is empty until #1294 carries it); tile number = open ledger rows + waiting count. Tested with a made-up `waiting` (KnowledgeWaiting.test.jsx).
- First-screen words (desk 1440x1000, whole screen incl. bar): Scene objects 77 to 59, Switches 78 to 60 (phone 48 / 57). Scene objects: the node inspector opens on a click, not by itself. Switches: no "Command deck" title; shorter labels (Admin tools, Editor panels, Panels at open, Lock selection, Offline, Copy link, Reload, Publish now); the "?" sits beside its switch, not over the On/Off box. No control or gate removed.
- Calm branch merged in (heartbeat mark no longer draws a white box over "heard ... ago").
- Owed: Skills 68 words and Requests 203 words on the first screen (not in the 60-word list); rAF idle re-measure of 3D Monitor.
