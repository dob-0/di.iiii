## 2026-10-20 — the "too many tabs" ring now shows when the scene code is the thing waiting

- the browser run (6 tabs over http) showed the line never appeared — the starved tab got its document and hung on the lazy scene chunk, whose Suspense fallback was the plain ring. Both waits now draw `LiveStallRing`; tabs answer pings for their whole life (`useAnswerTabPings`). Seen in the browser after the fix: the 6th tab reads "too many tabs of this site are open — close one"; 1 tab loads normally.
