## 2026-10-17 — The light desk plays a look's level motion (breathe, pulse, chase… on the wire)

**The gap, measured live 2026-10-17 (MOXIR):** rig looks carry level motion in `components.rigLooks.looks[].motion`
(51 looks: breathe 13, pulse 5, pump 5, chase 4, sparkle 4, bars 4, sine 3, comet 3, strobe 3, blocks 2, pingpong 1,
radar 1). The 3D room animated it (`src/rigbuild/lookMotion.js`, pinned to fx.js); the desk never received it:
`deskLooksWithValues` sent one static step plus `heads`. During a "breathe" the wash dimmers on the wire sat still
(three samples in 0.7 s, identical). With the room now drawn from the desk's DMX, hall and 3D matched and nothing moved.

**The fix, the head-motion pattern:**
- `src/rigbuild/lookMotion.js` `deskMotionOf` — the look's motion plus `units`: the lamps the room's own `motionPlan`
  moves (kinds, lit above `still`), in its order, each with its place in the effect (x, y; radial from `djCentre`,
  moved here from `useRigLook.js` so the room and the desk share one answer). `deskLookValues.js` puts it on the desk look
  next to `heads`; a laser, hazer, smoke or spark machine is never a unit (`NO_MOTION`).
- `serverXR/src/lighting/lookMotion.js` (new, CommonJS) — `sanitizeMotionConfig` (mirror of the schema's
  `normalizeLookMotion`), `sanitizeMotion` (+ units), `motionLevels` (fx.js's own `fxLevel` per unit at `now - epoch`),
  `motionFrame` (the live layers; a higher layer wins a fixture; the fader scales the depth; a crossfade blends the
  replaced look's motion, on its own `fromFiredAt`, out and the new in over `fadeMs`). `looks.js` `sanitizeLook` keeps
  `motion`, so `POST /api/looks`, `/api/looks/add`, show.json and `GET /api/looks` carry it; `desk.js` `fireLook` records
  `fromFiredAt` in memory, like `fromLookId`.
- `engine.js` — one multiplier per fixture on `lvl`, before the global `state.fx` (still multiplied on top); a generic or
  excluded profile sits out both; when a look strobes a lamp the global strobe sits out for it, so no lamp flashes faster
  than fx.js's cap (`MAX_STROBE_HZ` = 3, 350 ms slices on the 40 Hz grid). Every mode in the room's `lookMotion.js` already
  existed in fx.js (the room is its port), so nothing was ported or invented: the desk calls fx.js itself.

**Tests (all green, 2026-10-17):** `npx vitest run src/rigbuild serverXR/src/lighting src/shared/projectSchema.test.js`
→ 129 files, 1776 tests. New in `src/rigbuild/lookMotion.test.js`: schema words and config parity (13 modes × 7 spatial,
both schema copies), desk frame = room frame within 1/255 (13 modes × 3 spatial × 2 epochs × 24 instants × 12 lamps =
22 464 comparisons, max difference 0/255), units, and the engine: no motion = byte for byte as before; breathe floor 43 at the fire (200 ×
55/255), full at half the period, fx.js's curve every frame, back on the beat ten periods later; the beat is `firedAt`;
strobe 2 < flashes/s ≤ 3 at 20/120/300 bpm and with the global strobe on top; a global pulse still rides a breathe;
crossfade in and out; half fader = half depth; a lamp outside the units untouched. `serverXR/src/lighting/tests/test.js`:
the render check. `tests/test-http.js`: a POSTed look keeps its motion, junk is dropped, numbers are clamped.

**Proof for the merge:** `node serverXR/src/lighting/tools/look-motion-proof.js <frames.json>` — one wash's wire dimmer,
81 frames over 2 s, before and after, three modes: breathe (66 bpm, depth 200) 1 distinct → 68 distinct, 55..254; strobe
(120 bpm) 1 → 2 distinct, 2.5 flashes/s; pulse (124 bpm) 1 → 44 distinct. Frames: `~/work/agent-reports-2026-10-17/desk-look-motion-proof.json`.

**Limits, stated:** the desk itself still snaps look VALUES on a fire (the `fadeMs` meta is for the room); only the
motion blends. `sparkle` and `glitch` are not under the 3 Hz cap in fx.js on either side (as before). Not seen on the
real wire yet: the live desk, the controllers and `moxir-v2-11` were not touched; the looks reach the desk when the
room's looks are next pushed (`deskLooksWithValues` → `POST /api/looks`).
