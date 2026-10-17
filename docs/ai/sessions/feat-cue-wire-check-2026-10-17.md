## 2026-10-17 — cue-wire-check: does the wire play what the 3D plays? (MOXIR, "in 3d beams are strobe but in real not")

`scripts/rigbuild/cue-wire-check.mjs` (tests: `cue-wire-check.test.js`, 23, incl. a fake desk + node on 127.0.0.1). No production name in any default.

- Expected, per cue, from the room's own maths: look (`rig-<x>` ↔ document look, `looks.js`), lit lamps (`lookPoses` level > 0), motion
  (`lookMotion.js` motionPlan/motionFrame, which `lookMotion.test.js` pins to the desk twin). Lasers, hazers, smoke, spark are not measured (`NO_MOTION`, now exported from `deskLookValues.js`).
- Measured: GO the cue, wait fade + 0.5 s, sample desk `GET /light/api/dmx` and each node's `GET /api/dmx`; lit = dimmer max > 0, moving = swing > 20.
- Wire keys (measured 2026-10-17): the desk's `/dmx` keys are `universe - 1`. A node answers ONE key "0" (its own port); which desk universe it is comes from the node's
  own `GET /api/input` `config.universes[0].universe`. Node 192.168.4.1 = desk universe 1, 192.168.4.3 = universe 2.
- Node finding: a node runs the same desk code standalone with its own Art-Net input (own `/api/input`, own `/api/state` with its own fixtures, answers 1 of the 2 universes, each byte equal to the desk's matching universe). Its `/api/dmx` is its OWN received buffer, not a bridge to the desk; the tool says so per node (`nodeKindOf`) and leaves a node out that is not clearly so.
- Safety: GET only apart from `POST /cues/go` per cue and the restore (back to the cue that was up, or `/cues/stop`); `--dry-run` posts nothing and reads no wire; Ctrl-C restores.
- Not tested here: a GO on the live desk (the lead's, after the desk motion fix #1018 is installed).

## Later the same morning (lead chat): --follow, and the show that sat on cue 1

- `--follow` measures each picked cue while the desk's own runner plays the show: no GO, nothing posted, so the people watching
  keep their show. It waits for each cue's fade from the desk's `firedAt` (`followNext`, `followMinutes`, tests in
  `cue-wire-check.test.js`). The restore after a GO run now also turns play-in-order back on when it was on.
- `show-loop.mjs` started the show with `POST /api/cues/go {index:0}` only, and a GO on a named cue turns play-in-order OFF
  (cuerun.js, owner 2026-10-09), so the show sat on cue 1: seen 2026-10-17 10:38 (index 0, autoplay false, nextInMs null, six
  minutes after the start). It now sends `startCalls()`: the GO, then `POST /api/cues/autoplay {autoplay:true}` (test in
  `show-loop.test.js`).
