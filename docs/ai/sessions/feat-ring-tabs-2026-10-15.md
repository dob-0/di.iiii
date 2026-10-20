## 2026-10-15 — the loading ring names "too many tabs of this site are open"

- After 6 s on the room's loading ring with no live stream open, the page counts other tabs of the site over a BroadcastChannel (`src/utils/siblingTabs.js`); five or more others on a non-h2 origin make the ring's second line say "too many tabs of this site are open — close one".
- `LoadingScreen` got an optional `slowText` that replaces the generic 8 s line when the cause is known.
- Tests: counting, none/no-API, h2 stays quiet, slowText. Not tested in a real browser with six tabs.
- Owed: sharing one live stream across tabs (needs a leader-tab election; serverXR untouched) — row N805.2.
