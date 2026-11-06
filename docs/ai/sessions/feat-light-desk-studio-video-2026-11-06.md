## 2026-11-06 — light desk: the studio desk's follow times, colour effects, stage objects and labels, and video pixel-mapping with NDI

- Emily's ask: "push studio lighting folder stuff to di with ndi signal and stuff". The studio desk
  (her private viz.di.formal, branch `studio`, `OneDrive\Desktop\studio`) carried a lot di's light
  desk did not; the old draft #625 (`feat/lighting-studio-converge`, 09-28) had begun it and sat
  ~1900 commits behind dev. Scope she picked: replay #625 onto today's dev and add the video layer
  (NDI first), one PR that replaces #625. Not in scope: the studio's OSC/network panel, undo,
  show snapshots/export, the two-screen rev guard, its PIN gate (di has its own login), its Stage
  page.
- #625 replayed commit by commit onto dev (its own note is folded in below). Conflicts were small:
  per-fixture FX groups now sit beside dev's look motion (two strobes still never stack — the
  check reads the group's mode), the colour-FX `val` comes before dev's head pose, dev's
  `backupShow('before-switch')` stays after the studio's save-then-refuse in `switchShow`,
  `engine.cues` (follow times) lives beside dev's `cueRunner` (the cue list) — two different
  things, both kept.
- One real clash found by the suite: dev's `/api/state` already has `now` (what is on the desk,
  `nowOnDesk`), and the studio port's `now: Date.now()` overwrote it. The desk clock is
  `serverNow` now (state and `/api/dmx`); test-http "nothing on is null" is the guard.
- Video, server half (`pixelmap.js`, studio 1b83092/3d6b420/1b9a597): `state.video` persists with
  the show (box, mix, sample size, A→B animation, the mix's LFO, tone, file speed/loop);
  `state.pixels` is live only, non-enumerable like the audio levels, and freshness-gated — a second
  after the page stops sending, every light is back on its look. Order in `engine.js`: look →
  video → colour FX → brightness FX / objects / audio → master, blackout. The two routes read the
  CURRENT state (`getState`), because `switchShow` replaces it. Bounds follow the desk's WORLD.
  The default show carries a video setting; `/api/state` carries `videoLive`.
- `ui/objcore.js` is the studio's final object maths (motion A→B, direction, easing, phase,
  once/loop, pause/play/restart, spin, pulse) with di's WORLD bound kept; a run-once object
  restarts on its scene's recall. The colour wheel skips 50–185° (was 68–172°: both edges read
  green on her lights).
- Page half: `objects.js`, `markers.js`, `video.js` and their styles, from the studio, relative
  addresses. `app.js` gives them `viewOf`/`snapv` (this desk has one view for every stage), the
  objects/labels poll guards, the desk clock, the video placed under the lights in
  `placeStages`, labels framed by Fit. The object CSS that lived in the studio's style.css went
  into `objects.css` (without it the tool icons drew as blobs and the radar not at all).
- NDI is di.iiii's own receiver now, not NDI Webcam: the strip lists `/ndi/api/sources` and draws
  `/ndi/in.mjpg?name=…&w=320&bw=lowest` — same origin, so the pixels can be read; Stop takes the
  address away and the receiver lets the source go after its linger. The NDI base is the desk's
  sibling (`…/light` → `…/ndi`, also under `space/<id>/`). Without the NDI runtime it falls back to
  the studio's camera way (NDI Webcam / OMT Mini) and repeats the server's own "how". The mark
  line "NDI® is a registered trademark of Vizrt NDI AB — ndi.video" shows where NDI is picked
  (docs/architecture/NDI.md). An MJPEG picture that stops changing for 3 s is said.
- Tests: the studio's 22 video/animation checks (test.js); HTTP: a posted colour reaches the wire,
  lets go after a second, blackout wins, the colours never reach `/api/state`; a space keeps its
  own video setting and live colours across a show switch. Wiring: the three modules load in
  order after app.js, every api call has a route, the NDI receiver and its mark are there, the
  app.js hooks exist; the orphan-control check reads the modules (`#objPill`). api-contract lists
  colorfx, scenes/follow, cue, objects, markers, video, pixels as class c.
- Seen in a real browser (headless Chrome, `channel: 'chrome'`, desktop 1646 px and a 390 px
  phone): on a standalone desk the colour bars drove 4 lights at ~30 fps, a Radar and a label
  landed, Stop gave the look back, no sideways scroll on the phone; on a scratch serverXR with
  `serverXR/src/ndi/devSender.js` as the source, the strip found "PONYO (di b9 harness)" by
  itself, drew it natively, the lights took its colours on the wire, Stop released the receiver.
  Not yet tried: a real rig, and Resolume's own NDI output (the dev sender stood in for it).
- Windows baseline seen here, not from this branch: `src/copyVocabulary.test.js` reports 19 hits in
  files this branch does not touch (RootApp.jsx, the Raw editor, PublicProjectViewer…).
- Owed: close #625 once this lands (it is superseded); the studio's network panel, undo, show
  snapshots and Stage page if Emily wants them next.

### Folded from #625's own note (`feat-lighting-studio-converge`, 2026-09-24)

- Port 1: `fx.js` is the studio's file (rig-extent Follow, even column/row slots, one lane per
  slot, short tail for few lanes, radar round the rig centre, the `fade` mode) with di.iiii's
  downbeat grid (`epoch`, `beatGrid`, `BEATS_PER_BAR`) kept. `engine.js` gains per-fixture
  effects (a fixture's own `fx.mode` beats the rig-wide one; `none` holds it still), rig bounds
  per effect group, and the LFO-capture fix; `desk.js` `/api/fx` takes `{ids, mode}` / `{all}`
  and scenes keep per-fixture fx. Two known-fixes rows (LFO capture, compact-rig Follow).
- Port 2: save safety. `writeShow` from the timer is now `saveSoon`, which never throws — a
  locked/read-only show file used to throw out of the timer (fatal inside serverXR) and lose the
  edit. Retry with backoff, in-place write after 3 failed renames, `status.save` for the page.
- Port 3: follow times (`cues.js`; on a desk with no containers a follow goes on to the next scene
  in the library), colour effects (`colorfx.js`, never green), stage objects (`ui/objcore.js`,
  shared by engine and page) and stage labels (`markers.js`). Routes are inline in `desk.js` and
  read the live `state` binding. Identify beats objects. The studio's own 22 tests came with them.
- Port 4: ENTTEC. On Windows a missing or lost widget is reopened asynchronously (`mode` and the
  open off the event loop, still at most once a second) — each retry used to block the frame
  path ~70ms. Lost/reconnected bookkeeping and `status().state`. POSIX keeps its fast sync open.
- Port 5: UI for colour-effect pads (Control under FX + Touch) and follow times (right-click
  Follow… editor, "→ 3s" badges on scene rows, "Step 1 of 2 · next in …" beside the transport,
  a pill).
- Review fixes, save path: the empty-boot guard and `dirty` clear only after the write lands; in a
  space, a rig change the machine show could not take is retried on its own; `switchShow` saves
  through `saveSoon` and refuses (409) while the show being left cannot be saved. The
  save-failure tests block the save with a directory at `show.json.tmp` (platform-neutral).
- Review fixes, follow times and scenes: `/api/scenes/follow` refuses before clearing;
  `MIN_STEP_MS` 100 ms between steps; `dueAfter` clamps the fade like `startFade` (60 s, NaN =
  none); `switchShow` stops the cue runner; `/api/scenes/replace` goes through `sanitizeScene`
  on the scene fields.
