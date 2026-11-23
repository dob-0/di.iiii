## 2026-11-10 — Perform: laser window, blackout for picture + light + laser

**What**
- New window kind `laser` (`src/perform/presets.js` WINDOW_KINDS, WINDOW_ORDER; `LaserWindow` in `src/perform/PerformWindows.jsx`). Status (cubes connected of configured, armed yes/no read-only, sim), the desk's looks as buttons (live one marked `is-live`), laser master, "Laser follows Light". Engine unreachable: one line "Laser engine not on this machine".
- Master · Blackout now sends PICTURE + LIGHT + LASER, with three tags (live / black / absent) from real reads. A failed target is named and does not stop the others. Release lifts the laser blackout only if this page set it.
- Preset `show` = deck + master + cues + clock + laser (`vj` untouched).
- One go: a cue may carry `laserLook` (schema `src/shared/projectSchema.js` + hand mirror `shared/projectSchema.cjs`; absent unless set). `fireCue` fires light, then laser look (`src/map/cueFiring.js`). A Laser picker sits in the cue editor (`src/map/MapCueList.jsx`).
- One wire: `src/map/laserLink.js` (all addresses), poll hook `src/perform/useLaser.js` (2 s, paused when hidden).

**Endpoints (serverXR/src/routes/laserRoutes.js)**
- GET `/laser/api/state` :219 · GET `/laser/desk/api/state` :355
- POST `/laser/desk/api/go` {look} :358 · POST `/laser/desk/api/master` {level 0..1} :371 · POST `/laser/desk/api/follow` {on} :376 · POST `/laser/desk/api/blackout` {on: boolean} :382
- NOT used, not reachable: `/laser/api/arm`, `/laser/api/blackout`, find, config, show.
- Note: desk blackout ON disarms the engine unless "Blackout keeps the arm" is set (laserDesk.js setBlackout). Lifting it from Perform does NOT re-arm; arm on the Laser page.

**Tested** (vitest, fetch mocked): `src/perform/PerformLaser.test.jsx` (status, no arm control, look press, no looks, master/follow, unreachable, blackout x3, failure isolation, release only if set here, cue go order, Show preset overlaps), presets.test.js.
**Not tested**: no real laser or light desk answered; only GETs were sent to the live system. No browser look (desktop/phone) yet. `serverXR/src/schemaSync.test.js` passes (66), but it does not cover `laserLook`.
