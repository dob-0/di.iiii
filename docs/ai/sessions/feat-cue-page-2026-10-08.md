## 2026-10-08 — the show page: everyone sees the live cue, the team chooses it from a phone

- New page `/{space}/show/{project}` (RIG_BUILD.md §24): the live cue (name, act, next, time to next, who chose it) and every cue as a big card with its ember/ash swatch. No WebGL; one JSON a second.
- A tap sends the cue to Light's cue runner in process (`serverXR/src/routes/showRoutes.js`, rules in `serverXR/src/show/showRemote.js`). Who may choose is the operator's SETTING — team (default) · everyone · operator only — stored in `<DATA_ROOT>/show/control.json`; owner: "create it now, we decide later". One choice per 10 s for everybody.
- Laser moments are refused for everyone, operator included (`shared/laserMoments.cjs`, guarded against the fixture library). MOXIR v1.0: 4 of 13 cues are laser moments (one line, sparks, fire returns, dawn).
- Seen: scratch stack (auth off) and an auth-on throwaway server serving `dist/`, phone 390×844 @3 and desktop 1440×900 @2; a choice reached a second phone in 189–266 ms (3 runs).
- Found, owed: the scene deck's `LASER_TYPES` misses `ext-lc-ultra-mk2` (MOXIR's LaserCubes); `rigToolAccess` treats `session.local` as "everyone edits" on a `--guests` install. Not on a real phone yet.
