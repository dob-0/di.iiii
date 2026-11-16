## 2026-11-16 — the admin page as a desk: tiles, section windows, hints instead of text

- /admin opens on a tile per section (a number or a state, no sentence); a tile opens the section as a DesktopWindow in screen space, several side by side, arrangement remembered per device; `/admin#<section>` links keep working, `#monitor-full` too. Phone: one window at a time.
- Helper sentences became ? hints, empty "nothing selected" boxes became drawers, long lists became folds. Gates unchanged: the Monitor window only after GET /api/monitor answered 200, admin-only sections.
- Table of windows and hash links: src/components/preferences/adminWindows.js; bodies of the staff windows: AdminWindowBodies.jsx; styles: src/styles/adminDesk.css.
- Still undone: a wiki entry (src/wiki/wikiContent.js), an idle-frame re-measure of the 3D Monitor, and first-screen words are still above 60 in a few desk windows (Status, Scene objects, Switches, Spaces and users).
