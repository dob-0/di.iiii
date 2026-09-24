## 2026-09-24 — Perform, phase 1: the show run with only the windows the job needs

- Owner, 2026-09-24: *"we need separate line where there are only the vj and mapping by example
  with the lights no need to nodes so we need to flexible"*; on own address vs mode: *"yes we need
  to all versions and for all kind of task and user"*. He was shown the sketch
  (local.thedi.studio/lab/p/perform-sketch) and answered: way in BOTH (address + switch), preset
  kept BOTH (this device + the show). Decision draft and method sources: di-atlas
  `decisions/2026-09-24-perform-line.md` (grandMA3 views and user profiles, ETC Eos snapshots,
  Ableton Link, Cristian 1989 / RFC 5905 for the clock offset).
- **Address:** `/{space}/perform/{project}[?preset=][&from=]` (`src/perform/performRouting.js`,
  dispatched in `RootApp.jsx` beside Projection, behind the same gate). `perform` is reserved in
  `shared/reservedSegments.cjs` + `spaceRouting.js` — checked first: `/serverXR/api/spaces/perform`
  and `/projects/perform` 404 on prod, dev and the local install.
- **Switch:** Desk | Perform in the bar's one-control slot (`src/perform/DeskPerformSwitch.jsx`),
  on Projection, Studio (only once the project has a connection or a wall, or under All tools —
  a bare project stays bare) and Nodes. Written with the bar's own classes; one small
  `.sbar-switch` rule so the pair never wraps apart.
- **The desk:** `src/perform/PerformDesk.jsx` is RawEditor with `perform` set — same store, op log,
  node windows and DesktopWindow — the canvas, topbar and palette not drawn. Arrangement kept as
  percent rectangles (resizes with the window); windows cannot be pinned (no canvas: the pin
  button is hidden via a new `pinnable` prop, not left doing nothing).
- **Presets:** seven built-ins as DATA (`src/perform/presets.js`, rectangles from the sketch).
  Mine = the `presets` slot of `dii.rawLayout.<space>.<project>.<wide|narrow>` (now read on the
  first render, so a saved preset is found on reload). The show's = new additive document key
  `performState.presets` with `upsertPerformPreset` / `deletePerformPreset` ops (per preset, so two
  people saving at once both land), inverses for undo, mirrored in `shared/projectSchema.cjs`;
  no version bump — an older document normalizes to an empty list. Round-trip through a real
  `.diiii` export/import is tested (`scripts/space-bundle.test.js`).
- **Windows, native:** deck (`VjDeckView` placement `perform`), Out (the Picture Out's or the
  deck master's picture), Clock, Master · Blackout, and the Projection panes — Wall, Wall out,
  Surfaces, Cues (1–9 fire), Machines, Surface settings — moved into `src/map/MapDeskParts.jsx`
  without a markup change, driven by `useMapApi` (split out of `useMapDocument`) over RawEditor's
  op layer, so no second sync of the project. **Honest placeholders:** Scenes, Looks · FX, Audio,
  Status, Footage, My surface, Now open dim, "Coming in phase 2", saying what they will be. No
  iframe anywhere.
- **One clock:** `src/timeline/showClock.js` (Link-style `{ bpm, epoch }`, beat/phase/quantum,
  tap, Cristian offset with min-RTT filter, `pickLeader` seam: Light leads, deck fallback) +
  `src/perform/useShowClock.js` (polls `GET /light/api/clock` 500 ms when up, 2 s when the desk is
  closed, 15 s where there is no desk). The desk route answers `{up:false}` WITHOUT building the
  desk (`lightingRoutes.js`), so a VJ never starts the 40 Hz loop.
- **Measured** on a dev stack (SwiftShader, same machine): Light tempo change → deck shows it,
  n=20: median 375 ms, p95 511 ms, max 523 ms (bounded by the 500 ms poll). Phase agreement,
  60 samples over 30 s at 128 bpm: |error| median 0.5 ms, p95 2.5 ms, max 4.5 ms; RTT median
  10 ms. Four deck taps 502/510/504 ms apart → Light desk 119 bpm (it keeps whole bpm), its beat
  anchor 1 ms after the last tap.
- **Fixed, owner-seen 09-24:** BPM 300.0 (double-click taps averaged in), dark non-playing slots
  (stills now), blend names cut, the deck window over its own wired cards. Rows in known-fixes.
- **Seen:** desktop 1440x900 DPR2 and phone 390x844 DPR3, every preset; walk: /lab/perform/<new>
  ?preset=vj → add deck → upload two clips → play → save as mine → reload → "friday at MOCT" kept;
  Projection → Perform → Desk. Phone found two faults the unit tests had not: windows under the
  120 px floor overlapped (all seven presets now guarded by a test), and the Projection panes had
  no stylesheet unless the Projection desk had been opened first.
- **Owed (phase 2):** Light as native windows, the Status line, Guest's footage and surface, cues
  that fire deck columns, cues on the beat, clips on the beat. `desk` is a banned word in
  `docs/ai/vocabulary.md` yet the owner's sketch says "Desk | Perform" — kept as he approved it;
  the word is his to settle.
