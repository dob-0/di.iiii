## Laser: one light scene drives both desks, Follow light scenes (2026-10-31)
- The owner asked (ledger N1587, his second time) that picking a scene on the light desk also puts the matching look
  live on the laser desk. Off by default: `followLight` in the laser desk's desk.json; off is today's desk exactly.
- `lighting/engine.js` `recallScene` is the one place a scene becomes active (click, key, MIDI, a quantised recall, every
  chase step): `onScene({ id, name, origin })`. `lightingRoutes` takes `sceneOrigin`, returns `onSceneRecall` and `scenes`.
- Safety core: `origin` is `laserRoutes.originOf(req)`, which runs the laser's own Go guards as they are
  (requireLocalRuntime, requireOwnPage, the local token, requireSameMachine): 'page', 'token' or null. A chase keeps the
  origin of the request that started it; a chase restored on a restart has none. `laser/sceneLink.js` refuses first.
- `laserDesk.followScene` changes the live look only: no arm, no Go (its frames carry go:false, also to a cube with no
  record such as right after Release; the half-built version sent go:true there, fixed and tested), no Blackout lifted,
  Master and BPM untouched. Release does not pause the link (lead's call); nothing reaches a cube until a person presses On.
- Links: per look `follows` (null not set, '' none, else a scene id); first fill by leading word and number, ambiguous
  stays unlinked, a choice in Edit wins, none is never refilled; not part of the picture, Save-as-new or undo.
- Routes: POST /laser/desk/api/follow, POST /laser/desk/api/looks/follows, GET /laser/desk/api/follows. UI: laser top bar
  toggle and status, Edit "Follows light scene"; the light desk shows "laser: <look>" per scene. Wiki: the laser desk.
- Tests: `laser/sceneLink.test.js` 12 (mapping, link, safety, origin through express with both lanes, chase restored after
  restart; two mutants killed). Laser + lighting + routes: 56 files, 747 passed. Seen on the agent screen with a scratch
  copy of the Projector Room scenes and looks. Not tested: a real cube, the Mac itself, a phone.
- Limit: through a di-dev tree address the laser's requireOwnPage refuses every laser POST (the proxy rewrites Host);
  the laser desk was looked at on the scratch serverXR's own address, the way the Mac's installed di serves it.
