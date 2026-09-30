## 2026-09-30 — the light pool: the room's light follows the scene inside the eight-light budget

Branch `feat/room-light-pool`, from `fix/ground-real-lights`. Owner, looking at the MOXIR ground
versions: "it is too dark, but when we make the lights it will not be dark — how is it in the
scenes now — there are also reflections."

### The problem, measured before this branch

- A browser runs about 8 real three.js SpotLights per version (rig-lib.mjs `budget.realLights`;
  90 ran at 1 fps). Every other lamp draws a cone and lights nothing unless its light is baked
  as a wash (wash-glb.mjs: one mesh, ONE look, baked at rig.mjs time).
- Which 8 are real is a fixed per-version choice written into the document at load time
  (`beam.only` false on 8 lamps). In the ground versions the scenes are ground MOVERS whose
  poses and levels change per scene (RoomLookFollower → useRigLook → looks.js), so the room
  was lit by 8 lamps chosen once, whatever scene played.
- three.js compiles every lit material for the NUMBER of spot lights in the scene; adding or
  removing a light at runtime is a shader recompile. SpotLightObject mounts the `<spotLight>`
  only while `beamCastsLight` (beam.only false), so flipping `only` per lamp per cue would
  mount/unmount lights — new shadow maps, new targets, and a recompile whenever the count moved.

### The design: a pool, not runtime add/remove

`src/rigbuild/lightPool.js` (pure) + `src/rigbuild/useLightPool.js` (the hook) + one line in
`RoomLookFollower.jsx`, behind a flag that is OFF by default.

- **N slots that always exist.** Entities `rig-pool-0..N-1` (stable ids → stable React keys →
  the same three.js SpotLight objects live on). N = `mappingState.lightPool.slots`, default 8
  (the measured budget), clamped to 12 (rig-lib `SHADOW_SAFE_REAL_LIGHTS`). Every rig lamp is
  drawn beam-only (its cone stays, `only: true`); a slot copies its lamp's position, rotation,
  colour, intensity, angle, penumbra, distance, decay. An empty slot (fewer lit lamps than
  slots) stays mounted at intensity 0, parked at y = −1000: the count never changes.
- **The score** (relative units): `I × Ω(angle) × window(d)`. I is the entity's intensity —
  already level × candela after looks.js `atLevel` and the desk's dimmer (dmxPose.js). Ω =
  2π(1 − cos angle) is the cone's solid angle (flux out = I·Ω). window(d) =
  saturate(1 − (d/cutoff)⁴)² is three.js's own cutoff window (lights_pars_begin
  `getDistanceAttenuation`, r155+ physical lights) at the distance where the beam axis (the
  entity rotation via spotLightAim.js `spotAimDirection`) leaves the room box
  `mappingState.lightPool.bounds`; the 1/d² of illuminance cancels against the footprint area
  ∝ d², so the flux that lands is what ranks. No bounds → window = 1, rank by I·Ω. Ties break
  on the entity id. Strobes/blinders (`rigFlash`), lamps with an invisible beam and the pool's
  own slots are never candidates.
- **The hand-over rule (hysteresis).** A slot keeps its lamp for `minHoldMs` (1500) after it
  took it, unless the lamp went dark (score 0) — then the slot is free at once. An unlocked
  incumbent is unseated only by a challenger whose score beats it by `margin` (15 %), and a
  slot changes lamp at most once per step. One slot cannot be in two places, so a swap is a
  DIP over `handoverMs` (400): fade out at the old lamp, fade in at the new — continuous in
  intensity, never a beam sweeping across the room. A slot freed by a dark lamp skips the
  fade-out. During a look fade (blendEntities, ~30 Hz) the step runs per entity change; a
  ~30 Hz tick runs only while a hand-over is under way.
- **The flag.** `lightPoolWanted`: ON only when `mappingState.lightPool.enabled === true` (no
  data writes this yet) or the page query carries `?lightPool=1`. Off, the follower hands the
  same array through — behaviour identical to before.

### Built

- `src/rigbuild/lightPool.js`: `rankLamps`, `lampScore`, `stepLightPool`, `applyLightPool`,
  `slotDrawing`, `poolSettled`, `lightPoolWanted`, `lightPoolOptions`, `rayBoxExit`,
  `cutoffWindow`, `solidAngle`.
- `src/rigbuild/lightPool.test.js`: 15 tests — determinism and ties, all levels zero, fewer
  lamps than slots, the real-light count is exactly N whatever the document said, the slot
  copies its lamp, hysteresis (margin, hold), a dark lamp frees at once, no slot changes more
  than once per hold under flapping scores, the dip is continuous (sampled every 10 ms),
  the shadow-safe ceiling, the flag.
- `src/rigbuild/useLightPool.js` + `RoomLookFollower.jsx`: the integration, default OFF.
- Suites run: lightPool (15), looks.test, rigFlash.test, useRigLook.clock.test — 38 pass;
  with only the source reverted (lightPool.js, useLightPool.js removed, the follower as it
  was) the new file fails on import (1 file failed, its 15 not run), the other 23 pass. Lint
  on the four touched files: 0 errors, 0 warnings.

### Per-look wash (2): what blocks it, what it would take

- Today: ONE entity `rig-wash` (type `model`, one GLB, ~115 KB per look) written by
  `rig.mjs --wash-only --look <id>`; looks.js `withWashLevel` scales its `appearance.opacity`
  by the look's wash level (ModelObject applies material opacity) and hides it at 0.
- Per-look would be: N entities `rig-wash:<lookId>` (9–11 looks × ~115 KB ≈ 1.0–1.3 MB of
  assets, all loaded at open — each a `model` with its own asset), `withWashLevel` replaced by a
  `withLookWash(entities, lookId, fromId, t)` that sets the current look's mesh to its level and
  the others to 0 (crossfading alpha between two during a fade). NOT built here: rig.mjs writes
  and deletes the wash by the fixed id `${RIG_PREFIX}wash` and deletes the old asset on each
  bake, so the bake side (the writer, the id scheme, the asset churn — see
  reference asset-id churn) must change first; the room side is small once the ids exist.
  Owed: the writer (`rig.mjs --wash-only --look X --keep`), the id scheme, a cap on total
  wash bytes, and a screen test of alpha-blended decals stacking during a crossfade.

### Reflections (the owner's remark), from the code

Where a "reflection" can come from in this room: the baked wash is an unlit alpha-blended
decal 2 cm off the surface (wash-glb.mjs) — it reads as a glow, not a reflection; real
SpotLights give specular highlights on any MeshStandard/Physical material by roughness and
metalness (the hall's materials come from hall.py); the beam cones are additive meshes
(BeamInAir) and add over anything behind them; ambient/directional night lights (rig-lib
`nightOps`) are flat. Emissive, env-map and bloom paths are not audited here — the parallel
docs branch `docs/room-light-and-reflections-audit` (not pushed when this note was written)
owns that document; cite it when it lands.

### Not done, and the risks (all performance claims UNVERIFIED — no GPU here)

- Not seen on any screen. Switch-on costs ONE recompile if N differs from the document's
  real count (8 → 8 in the ground versions: none expected); the slot lights re-target each
  frame, which three.js does for free (target is a child object). Shadow maps: N slot lights
  with castShadow re-render their maps when they move — with 8 moving slots that is 8 shadow
  passes per changed frame; if it drops fps, set `mappingState.lightPool.slots` lower or turn
  shadows off for the pool (owed: a `shadows` option on the slot entities).
- A DIP hand-over is visible as a 400 ms dimming of one lamp; the desk's own cue fade
  usually covers it. `margin`/`minHoldMs` untuned on a real show.
- `lightPool` ignores lamps the document already marks real: they become beam-only with all
  the rest (the pool is the only real light while ON).
- The room bounds (`mappingState.lightPool.bounds`) are not written for any project yet; the
  rank is by I·Ω until they are.

### The owner's screen test

1. On the Mac install (or the local dev tier), open the ground version's room with
   `?lightPool=1` on the URL (e.g. `/{space}?lightPool=1`), Chromium on the Intel iGPU.
2. Let the show clock play through the looks (SHOW chip) and watch: the movers of the
   scene light the room (floor, columns) and the light moves with the scene; each cue change
   hands over with a short dip, no flicker between two lamps, no beam sweeping.
3. Measure with the existing probes on a GPU browser: `scripts/rigbuild/luma.mjs` (mean
   luma per look, ON vs OFF) and `scripts/rigbuild/look-probe.mjs` (per-look frames); fps from
   the browser's own frame stats at 14–19 fps baseline — report ON vs OFF per look.
4. If it reads right, write `mappingState.lightPool = { enabled: true, slots: 8 }` through the
   rig tooling (owed: a `rig.mjs --light-pool` flag) — never by hand.
