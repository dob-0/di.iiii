## 2026-10-15 — the loading ring names "too many tabs of this site are open"

- After 6 s on the room's loading ring with no live stream open, the page counts other tabs of the site over a BroadcastChannel (`src/utils/siblingTabs.js`); five or more others on a non-h2 origin make the ring's second line say "too many tabs of this site are open — close one".
- `LoadingScreen` got an optional `slowText` that replaces the generic 8 s line when the cause is known.
- Tests: counting, none/no-API, h2 stays quiet, slowText. Not tested in a real browser with six tabs.
- Owed: sharing one live stream across tabs (needs a leader-tab election; serverXR untouched) — row N805.2.
- 2026-10-20: the browser run (6 tabs over http) showed the line never appeared — the starved tab got its document and hung on the lazy scene chunk, whose Suspense fallback was the plain ring. Both waits now draw `LiveStallRing`; tabs answer pings for their whole life (`useAnswerTabPings`). Seen in the browser after the fix: the 6th tab reads "too many tabs of this site are open — close one"; 1 tab loads normally.
