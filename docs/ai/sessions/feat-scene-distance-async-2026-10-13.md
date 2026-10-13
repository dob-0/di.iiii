## 2026-10-13 — Studio Edit: the scene-distance depth picture is read in the background

Builds on PR #892 (branch fix/studio-scene-distance-2026-10-13; its note: docs/ai/sessions/fix-studio-scene-distance-2026-10-13.md).
Brief from the studio-nav lead (session 3a5bf6cd). Subject: the Edit tool (Blender preset) in the Studio editor, MOXIR project
moxir-v1-1. This branch changes how the depth picture is read, nothing about what it is used for.

## Why

`createSceneDistance().measure()` renders a 64 x 36 float depth picture and reads it back with `gl.readRenderTargetPixels`, which
makes the CPU wait for the GPU. It ran on every Edit wheel notch and at every Edit drag start. Measured by the lead (30 notches,
RTX 3080 lane, `window.__diSceneDistance.ms`): median 3 ms, p90 9.1 ms, max 40.3 ms per notch.

## What changed (the lead's design; the places where a fact changed the how are marked)

- **`src/studio/navigation/sceneDistance.js`**: `createSceneDistance()` gains `request(args)` and `peek(camera)`. `measure` is the same
  render with the read injected (one shared `draw`), its behaviour unchanged.
  - `request` draws exactly as `measure` does (same hide/restore, shader, camera copy, state save/restore) and reads with three's
    `readRenderTargetPixelsAsync` into its own buffer. At most one read is in flight. A request made meanwhile only replaces the one
    waiting (newest args win) and is drawn when the read lands: coalesced, never queued. The finished picture is kept as
    `{ value, pose, projection }`; `pose` is a Float64Array copy of the VIEW camera's `matrixWorld.elements` at render time.
  - `peek(camera)` returns the kept value only when every element of `camera.matrixWorld` is within 1e-6 of `pose`. Otherwise
    `undefined` (no picture for this pose). `null` still means "measured, nothing in view".
  - `dispose()` abandons a read in flight: it is dropped when it lands, the waiting request is never drawn, nothing is written.
  - Dev only: `window.__diSceneDistance.source` is `'peek'` or `'sync'` (`ms` only for sync); `window.__diSceneDistanceReads` keeps
    counters and the last 200 submit and latency times; `window.__diSceneDistanceOff = true` turns the background path off (the A/B).
- **A seam for the render rewrite** (the lead, 2026-10-13: the render will draw with the scene's own materials into a depth-texture
  target and turn depth into metres in a float target): inside `createSceneDistance`, `render(args)` returns `{ target, t0 }` or
  null; `readSync(gl, target)` and `readAsync(gl, target, into)` read ANY float target (R = metres, A = hit); `centreMedian` makes the
  value. A new `render` drops in under the two reads; nothing in them depends on how the target was drawn.
- **`src/studio/navigation/useCameraNavigation.js`**: `measureView()` peeks first and only then measures on the spot. Both callers
  (Edit wheel, Edit drag start) get it. The traces carry `via: 'peek' | 'sync'`.
- **Where the brief had to be read through a fact:**
  1. *When to ask.* The brief says to call `request` after each notch's `setLookAt`. camera-controls 2.10.1 `setLookAt` only sets the
     goal; the CAMERA moves in `update()` of the next frame (camera-controls.module.js:1728, :2071-2230). A picture asked for inside
     the wheel handler shows the pose the camera is about to leave and would never match the next notch. So the hook announces the
     notch (`asker.moved()`), and the picture is asked for at the first `update` that shows a different pose, and at every stop.
     The when-to-ask logic is `createAsker` in sceneDistance.js (pure, tested), not code inside the hook.
  2. *Which events.* `rest` is wired as asked. `controlend` is not: it fires on pointer-up, before the controls have applied the
     last move, so the pose is not final there (and the wheel fires a synthetic one). `sleep` (the frame after the last update) is
     the stop where the pose is final; it is wired. One stop is asked for once (a pose already asked for is skipped).
  3. *The lens is part of the key.* `peek` also compares the view camera's `projectionMatrix` (aspect, fov, zoom): a resized view
     shows other things from the same pose. Only more conservative than the brief; remove the second `samePose` in `peek` to get
     the brief's pose-only key.
  4. *three leaves its pixel-pack buffer bound.* `readRenderTargetPixelsAsync` binds a PIXEL_PACK_BUFFER, issues the read, and waits
     for its fence with that buffer still bound (WebGLRenderer.js:3190-3215, r185). With one bound, a `readPixels` into client memory
     is an INVALID_OPERATION and reads nothing (WebGL 2.0 spec): the synchronous fallback of the next notch would have returned an
     empty or stale picture while a read was in flight. `request` lets go of the binding right after the call (`unbindPackBuffer`);
     three binds it again itself. Shown on the GPU by the `PBO` line of scripts/nav/probe-depth-cost.cjs.
  5. *A failing read.* The fence rejects with no argument on WAIT_FAILED. A failure is warned once and the notch reads on the spot;
     after three in a row `request` stops asking. A read that never settles (lost context) leaves the last picture in place and the
     synchronous path in charge; not guarded by a timer.
- **Tests:** `sceneDistance.async.test.js` (21): a fake renderer whose `readRenderTargetPixelsAsync` is resolved by hand. Coalescing,
  never two reads at once, the newest args, the pose kept is the one drawn (not the one at landing), the 1e-6 edge, the lens, dispose,
  failures, the pack buffer, the dev readout, and `createAsker`. Mutation-checked: 13 deliberate breakages of the code; 12 are caught
  (two tests were tightened for it: a write after dispose, a missing unbind). The 13th, "the waiting request is not cleared on
  dispose", survives on purpose: `finish` also refuses to run after dispose, a second guard for the same thing.
- **Probes:** scripts/nav/probe-depth-cost.cjs (new; alternating background-off/on phases, `source` per notch, handler time, submit and
  latency of the background reads, the `PBO` check), probe-wheel-run.cjs (`NAV_ASYNC=off`, `via` per notch), probe-depth-picture.cjs
  (turns the background path off: it reads the synchronous picture's samples).

## Limits

- The key is the camera (pose and lens), not the scene. A scene edited while the camera stands still serves the old picture to the
  next move; the next request replaces it. Owed if it matters: a scene revision in the key (Studio has none today).
- The first notch after load, a notch that comes before the read lands, and a drag that starts before the last stop was asked for
  still read on the spot (as before, no worse).
- Dev stack: `di-dev up` refuses every tree whose `.nvmrc` is 24 (since 25d1e4ab) and aylmo has Node 22.23.2 and 26 only. The stack for
  this branch was started with `.nvmrc` = 22 for the `up` call only, then restored. Owed: Node 24 on aylmo, or di-dev falling back
  to `engines` (22.x || 24.x).

## Measured (RTX 3080 lane, scripts/nav/probe-depth-cost.cjs, MOXIR moxir-v1-1, 60 Edit notches per mode, phases alternate)

The machine was at 95-100 C package, GPU 84 C, fans at maximum during every run (board, 14:49), so absolute times are inflated against
the lead's 3 ms median; the comparison is background-off against background-on in the same page.

| per notch, 120 ms apart (actual 167 ms) | background off (every notch reads on the spot) | background on |
| --- | --- | --- |
| served by `peek` | 0 of 60 | 58 of 60 (96.7 %); the other 2 are the first notch after the switch, which has no picture yet |
| wheel handler, median / p90 / max | 9.5 / 13.6 / 32.3 ms (run 1) | 1.0 / 1.4 / 15.1 ms (the max is a notch that read on the spot) |
| the on-the-spot read, median / p90 / max | 7.9 / 11.6 / 30.3 ms (n = 60) | 12.8 ms (n = 2) |
| the picture drawn in the frame for the next move (`request`, no wait), median / p90 / max | - | 7.6 / 10.4 / 16.0 ms |
| read latency (request to landed), median / p90 / max | - | 15-36 / 29-100 / 73-115 ms over the phases |

- **The notch no longer waits, the work is not gone.** The handler falls from 9.5 to 1.0 ms. The CPU cost of drawing the picture
  (about 7 ms here, `submitMs`) is the same as the on-the-spot read's (about 7.9 ms): it moved from the wheel handler into the frame,
  before the main render. What async removes is the GPU wait inside the handler, which in these runs was small (the on-the-spot p90 is
  about 2 ms above the request's) next to the lead's 40 ms tail. Frame cost per notch is not reduced. Owed if it matters: ask less
  (`sleep` only), or draw the picture cheaper.
- Run 2 (the code as committed): the first background-off phase was disturbed by other tests starting on the same GPU (median 59.9,
  max 93.3 ms); its three later off phases and all on phases match run 1. Both runs' lines are in the report.
- **Notch for notch the same distance.** probe-wheel-run, background on against off: 60 notches each, 0 dead, worst step ratio 1.44
  both, the distance used per notch differs by 0 (3 decimals) in both runs.
- **stress** (NAV_SEED=835088540, 60 s): run 2, on: 12 rounds, 0 stuck, 0 errors, lowest camera y 3.16, 111 frames over 33 ms of 4239;
  off: 10 rounds, 0 stuck, 0 errors, lowest y 3.48, 190 of 3506. **Run 1, on, lowest y was -6.6** (the round was not kept; the stress is
  seeded in its actions, not in their outcome). One of two on runs broke the "lowest y >= 0.5" gate and I do not know that async is not the
  cause: open, needs several paired on/off runs (`ACCEPT_STRESS=on,off,on,off,on,off`), see the report.
- **Shown on the GPU:** with three's async read in flight the pixel-pack buffer is bound and an ordinary read gets INVALID_OPERATION
  (error 1282; Chrome says "readPixels: PIXEL_PACK buffer should not be bound"); it is unbound again once the read lands.

## For the render rewrite on fix/studio-scene-distance-2026-10-13 (merge by hand)

- Keep `render()` returning the float target; `request`, `peek`, `measure`, `createAsker` and the tests need nothing else.
- `cc.update(0)` at the top of the wheel handler can fire `update` or `sleep` inside the handler. `createAsker` skips a pose already
  asked for and asks only for a pose different from the one before the notch, so the cost is one wasted picture when two notches fall
  into one frame (the read is then in flight when `peek` looks, and the notch reads on the spot). If that matters, wrap the handler
  in an `inWheel` flag that makes the three listeners return.
- The ratio 1.2^|n| and `lastWheel` keeping the distance the notch used do not touch this branch's lines (the `asker?.moved()` call
  sits just before `controlstart`).
