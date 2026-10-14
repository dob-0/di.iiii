<!-- Landed 2026-10-14 (ledger N645.4) from agent report: raw-laser-workflow-design.md (date 2026-10-14).
Source of facts: external repos/pages named in the body with URLs and commit SHAs; licences as recorded there.
Licence rule: GPL-3.0 code may be quoted briefly with attribution, never copied wholesale; no code from this note is in the product.
MEASURED vs CLAIMED: file:line facts are read from origin/dev 4a10bc1c and PR #931; cost budgets are estimates.
UNVALIDATED: the whole design: no code ran. The flicker threshold at 2000 points is unvalidated until judged on the wall. Phase 1's bench is raw-laser-trace-bench.mjs (lands with the Phase 1 PR, not here). Owner decisions of 2026-10-14 are in docs/ai/decisions/2026-10-14-raw-laser-workflow.md and override section 6 defaults.
Provenance: written by an agent, so a claim until re-checked at the cited commit. -->

# Nodes laser workflow — design (ledger N645, 2026-10-14)

Design only, no code changed. Read from `origin/dev` 4a10bc1c and `origin/feat/laser-guards-2026-10-14` (#931).
To land as `docs/ai/decisions/2026-10-14-raw-laser-workflow.md`. Words follow `docs/ai/vocabulary.md`: the
canvas is **Nodes** (route stays `/raw`), a card is a **node**, the 3D place is a **scene**, a real room is a **place**.

**The goal (owner):** everything he did in TouchDesigner for the LaserCubes (build Geos, Merge them, animate with
LFO and Animation COMP keyframes, draw on the cubes), end to end in Nodes, and then more than TD can do.

---

## 0. What exists today (facts, with file:line on origin/dev)

| Piece | What it is | Consequence for this design |
|---|---|---|
| `geometry` wire | A plain **descriptor**, not a three.js object: `{kind, …dims, color, position, rotation}`; kinds `box sphere plane cylinder cone torus line circle group` (`src/project/graph/geometryDescriptor.js:13`). Groups carry `position/rotation/scale` and `children`; caps 256 pieces, depth 16 (`:19-20`). Merge splices bare groups (`mergeGeometry`). Array = N transform groups (`nodes/geom.array/runtime.js`). Geo/Constructor wear their children (`graph/constructorGeometry.js`). | No edges, no vertices travel on the wire. A laser node must **build** drawable lines from the descriptor itself. Good: the descriptor is pure and testable without WebGL. |
| Mesh building | Only in the viewport, by React components (`src/raw/components/RawViewport.jsx:191-290`, `BoxObject`, `SphereObject`, … ; rotation in radians, R3F convention). | The laser and the viewport must read the **same** dimensions and transforms; one walk (`pruneGeometryDescriptor`) for both. |
| Evaluation | In the **browser**, pure, per animation frame: `createNodeGraphContext(document, {now, liveOutputs, frameMemory})` (`graph/nodeGraphRuntime.js:96`), clock from `useDocumentClock` (`RawEditor.jsx:1753`). 90 of 108 node types are `runtime: 'any'`. | Phase 1 runs where Nodes runs. A headless runner is a later phase (rule 4, "runs with no hands"). |
| Laser frame | `{kind:'laser', points:[[x,y,r,g,b]…]}` on an `any` wire; x,y −1…1 in the cube's field, y up; colour 0…1; (0,0,0) = blank move; cap 2000 points (`shared/laserFrame.cjs:1-33`). | Keep the server's wire. Add a richer value **between nodes** (paths), flatten at Laser Out. |
| `laser.shape` "Laser" | 8 generators, one colour, one frame (`nodes/laser.shape/laserShapes.js:8`). | Stays; becomes one source among many. |
| `device.laser.out` "Laser Out" | One frame in, `cube` = `'all'` or an id, `blackout`. The panel posts `/laser/api/frame` throttled to 25 fps, keep-alive every 50 ms (`LaserOutPanelWindow.jsx:6-223`). | The single exit to the server; all new routing builds on it. |
| Server | `serverXR/src/laser/laserEngine.js`: arm phrase, keep-in zone per cube, still-beam guard, 200 ms signal-loss blank, DAC-rate pacing. #931 adds `laserGuards.js`: step limit, corner hold, start/end dwell, blanking delays, temperature limiter, park-at-centre stop. | **All galvo shaping and safety are server-side.** The graph must not duplicate them. |
| Scene preview of a frame | `src/objectComponents/laserLine.js` `scanLines(points)` turns a frame into beam directions; field ±18.5° (`FIELD_HALF_DEG`, an ASSUMPTION read from the maker's ">37°"). Stated limit `:44-45`: sub-lines run to one measured throw, **not to the surface each meets**. | The scene-aware phase must fix that gap (physics-first rule). |
| Modulation | `signal.lfo` "Oscillator": Hz + phase, 4 fixed outputs (`nodeRegistry.js:2163`). `time` has a `bpm` input and `beat` output (`:489`). counter/timer/trigger/ease/lag/hold/delay/speed, `value.noise/random`, `colour.ramp`, `source.mic` (3 bands, edges 250/2000 Hz, `src/raw/utils/soundAnalysis.js:13`), MIDI in, OSC in, `view.timeline` (playhead only). | LFO lacks beat sync, amplitude/offset, random. No keyframe node. |
| Keyframes elsewhere | Studio objects already have keyframe tracks: `src/project/viewport/timelinePlayback.js` (`keys:[{t,value,easing}]`, smoothstep or linear). | The Animation node reuses this model; one keyframe format in di.iiii. |
| Light desk (`/light`) | Tempo grid + tap (`serverXR/src/lighting/fx.js:40,79`), beat-synced LFOs (`lighting/lfo.js`), show clock `GET /light/api/clock` (bpm, epoch, beatsPerBar, master, blackout; `desk.js:1227-1243`), followed in the browser by `src/perform/useShowClock.js` (Cristian's method, 500 ms poll). Audio: the desk page computes level/low/mid/high and a beat (low band > 1.35 × its ~2 s average, 240 ms refractory, BPM = median of 8 gaps) and posts `POST /light/api/audio` (`lighting/ui/app.js:3080-3112`, `desk.js:2061-2075`). | Reuse the clock and the audio results. Note **two band definitions exist** (150 Hz in `/light`, 250 Hz in Nodes): one shared module is owed (learn once). |

Not found on GitHub at this read: the laser-ops PR (Arm/Disarm + Find cubes in Laser Out). This design assumes it lands
first and that **arming stays a human action in the Laser Out window**. `scripts/place/physics_check.py` exists on a branch
(072a3398), not on `origin/dev`.

---

## 1. Method (cited)

| Problem | Method used | Source |
|---|---|---|
| Geometry to laser | SOP → laser points, optional camera view; colour from point attributes; corner hold and blanking done by the output stage | TouchDesigner Laser CHOP, docs.derivative.ca/Laser_CHOP (parms `source`, `camera`, `stepsize`, `bstepsize`, `mincornerhold`, `maxcornerhold`, `closedoverlap`, `preblankon/off`, `postblankon/off`, `interpcolors`). The page does **not** document point ordering, per-primitive colour or projection maths, so we write ours down below. |
| Projection for a galvo | The scanner deflects by **angle**, so a 3D point at camera coordinates (x, y, z) lands at `x_f = atan2(x, −z)/θ_half`, `y_f = atan2(y, −z)/θ_half`. Not a pinhole `x/z`. The inverse is what `laserLine.js scanLines` already does. Pincushion of a two-mirror galvo is a warp concern, owed to the zones phase. | ILDA practice; di's own `laserLine.js` (FIELD_HALF_DEG 18.5, ASSUMPTION). |
| Drawable lines from a mesh | (a) feature edges where neighbouring face normals differ by more than a threshold: three.js `EdgesGeometry(geometry, thresholdAngle)`; (b) silhouette edges = edges shared by a front-facing and a back-facing face. | three.js docs (EdgesGeometry); Markosian et al. 1997 "Real-time nonphotorealistic rendering"; Hertzmann & Zorin 2000 "Illustrating smooth surfaces". |
| Joining segments | Chain segments that share an endpoint into polylines (fewer blank jumps). Done **once per shape in object space**: topology does not change when the shape moves. | Pen-plotter practice: vpype `linemerge` (github.com/abey79/vpype; not re-read this session). |
| Path order | Greedy nearest neighbour with reversal of open paths; closed paths enter at their nearest vertex. Optional 2-opt later. | Rosenkrantz, Stearns & Lewis 1977 (NN heuristic, SIAM J. Comput.); Croes 1958 (2-opt); vpype `linesort`. |
| Resampling | Arc-length parameterisation to a point budget, blank points at each jump. | Standard; ofxLaser and OpenLase also resample on the host (see `laser-guards-ofx-openlase-helios.md`). |
| Clipping | Clip segments at the near plane and the field edge (Liang–Barsky); never clamp (clamping draws false lines along the edge). The server's keep-in zone still clamps **and blanks** as the last guard. | Liang & Barsky 1984. |
| LFO | Waves Sine, Triangle, Ramp, Square, Pulse, Gaussian; Amplitude, Offset, Bias (square width / triangle→saw), Phase, Reset. | docs.derivative.ca/LFO_CHOP. TD has **no** beat sync or random wave in the LFO; beat sync comes from Beat CHOP, random per cycle from Pattern CHOP ("Random per Cycle", docs.derivative.ca/Pattern_CHOP). We put both on our Oscillator — the /light LFO already does beats (`lighting/lfo.js`). |
| Beat clock | Ramp, Pulse, Sine, Count, Bar, Beat, Sixteenths, Ramp Bar, Ramp Beat, BPM; Period in beats (fractions allowed); Multiples with Shift Step; tap tempo sets BPM. | docs.derivative.ca/Beat_CHOP. |
| Keyframes | Channels of keys; each key a value, slopes and an interpolation type; extend before/after: Hold, Slope, Cycle, Mirror; play modes Locked to Timeline, Use Input Index, Sequential. | docs.derivative.ca/Animation_COMP and /Keyframe_CHOP (the latter does not name the segment types). Segment types from Blender F-curves (Constant, Linear, Bezier + Penner easings; docs.blender.org Graph Editor → F-Curve properties, not re-read) and W3C CSS Easing Functions L1 `cubic-bezier(x1,y1,x2,y2)` for a portable bezier key. |
| Trail | Keep the last N frames, Increment skips frames, older copies fade. | docs.derivative.ca/Trail_SOP ("Preserve Original", Trail Length, Trail Increment). |
| Beat / onset from audio | Today: energy-over-average (the `/light` algorithm = Patin 2003 "Beat Detection Algorithms", simple sound-energy). Upgrade: spectral-flux onset with adaptive threshold. | Bello et al. 2005, "A Tutorial on Onset Detection in Music Signals", IEEE TSAP 13(5); Dixon 2006 DAFx "Onset detection revisited". TD Audio Spectrum CHOP gives FFT 64–16384, no beat detection (docs.derivative.ca/Audio_Spectrum_CHOP). |
| Beyond TD | Abstract generators (oscillators combined), projection zones with geometric correction and beam attenuation map, cue grid + timeline, ILDA/SVG import. | Pangolin BEYOND wiki and LaserOS, MadLaser, ofxLaser: second-hand via `laser-raw-gap-audit.md` §1; wiki.pangolin.com could not be fetched this session (blocked). **Re-read before quoting.** |
| ILDA files | ILDA Image Data Transfer Format, revision 011 (2014), formats 0/1/4/5 (3D/2D, indexed/true colour). | ilda.com technical standards. |
| Single-stroke text | Hershey fonts (public domain; US NBS 1967). | A. V. Hershey, NBS report 1967. |

---

## 2. Architecture

```
 geometry nodes ──► Laser Trace ─┐                          browser (Nodes, pure, per frame)
 laser.shape ───────────────────►├► Laser Merge ─► Path ops ─► Laser Out ─┐
 Laser File / Laser Text ───────►┘          ▲ numbers from Beat, Oscillator, Animation,    │ flatten: order + resample
                                             Audio, Sequencer, MIDI/OSC                     │ POST /laser/api/frame {cube, points}
                                                                                            ▼
                                serverXR (#931): keep-in zone → step limit, corner hold, dwell, blanking
                                → still-beam guard → temperature limiter → pacing → park/stop → LaserCube
```

### 2.1 The value between laser nodes: a path set (frame v2)

New port type **`laser`** in `PORT_TYPES` (one colour; today the frame rides `any`). Its value:

```js
{ kind: 'laser', v: 2,
  paths: [ { p: [x,y,r,g,b, x,y,r,g,b, …],   // flat, stride 5, field units −1…1, y up, colour 0…1
             closed: true|false } ],
  order: 'free' | 'kept',                     // free: Laser Out may reorder and reverse; kept: drawn as given
  source?: 'trace' | 'shape' | 'file' | … }   // for the status line only
```

- **No blank points inside a path.** Blank moves are made only at flatten time, so every path op (resample, trim,
  displace, trail) works on clean strokes, like TD's SOP primitives before the Laser CHOP.
- **Legacy frames** `{kind:'laser', points}` are read by splitting at blank points into paths with `order:'kept'`.
  `laser.shape` keeps working unchanged; it may later emit v2 directly.
- `shared/laserFrame.cjs` gains `normaliseLaserPaths`, `pathsFromPoints`, `flattenLaserPaths(frame, {budget, start})`.
  Shared, so the server can accept v2 later without a second implementation.
- **The server wire does not change in Phase 1:** Laser Out still posts `{cube, points}` (≤ `FRAME_MAX_POINTS` 2000).

### 2.2 Laser Trace — geometry → laser (`laser.trace`, label **Laser Trace**)

The name follows `laserFrame.cjs`'s own sentence ("a list of points the scanner traces"). Two words, no parenthesis
(`src/nodeLabelVocabulary.test.js`). The PR adds it to vocabulary.md.

Inputs: `geometry` · `view` (`front` | `point` | `cube`, the last from Phase 7) · `position` / `aim` (for `point`) ·
`size` (field units per metre for `front`; default fits the bounds into 80 % of the field) · `mode` (`outline` |
`edges` | `wire`) · `angle` (edge threshold, default 30°) · `hidden` (cull back-facing edges, closed shapes only) ·
`colour` (wired overrides the shape's own) · `level` 0…1. Output: `laser`, and `status` (paths, points, ms).

1. **Walk** the descriptor with the renderer's own walk (`pruneGeometryDescriptor`: same caps, same order), composing
   group `position/rotation/scale` into one matrix per leaf: what the viewport shows is what the laser draws.
2. **Object-space paths per leaf, cached** by a key of `kind` + dimensions + mode (+ segment counts). Built once, not per
   frame:
   - `outline` (default, laser practice: few clean lines): box 12 edges; plane 4; line 1; circle 1 ring; cylinder 2 rims
     plus 2 silhouette generators; cone 1 rim plus 2 generators; sphere its silhouette ring (the tangent circle from the
     viewpoint: exact for `front`, computed per frame for `point`); torus outer and inner equator plus `rings` meridians.
   - `edges`: three.js `EdgesGeometry` of the same `BufferGeometry` the viewport builds (segment counts from **one
     module** shared with `BoxObject`/`SphereObject`/…, so the two cannot drift).
   - `wire`: every triangle edge, capped.
   - Segments are **chained into polylines** in object space (`linemerge` practice).
3. **Per frame:** transform each path's points, project (`front`: orthographic X,Y; `point`: angular, see §1), clip at
   the near plane and the field edge, drop paths that end up shorter than one step.
4. **Colour** per leaf from the descriptor's `color` (a Merge of a red cube and a blue sphere draws red and blue), times
   `level`; a wired `colour` overrides. Per-point colour along a path comes later from a Path op with a Colour Ramp.
5. Output `{kind:'laser', v:2, paths, order:'free'}`.

### 2.3 Laser Merge (`laser.merge`, **Laser Merge**)

Inputs `a`, `b` (chain for more, as Merge and Math do today: `nodeRegistry.js` Merge comment "two, chained for more").
Concatenates `paths`. `order` = `kept` only if every input is `kept` (otherwise free). TD Merge CHOP/SOP semantics.

### 2.4 Laser Out (existing, extended)

- Accepts v2 and legacy. **Flattens**: nearest-neighbour order with reversal (if `free`), starting from where the
  previous frame ended (fewer jumps between frames), then arc-length resampling to `budget` (new input, default 1000;
  open question 3), blank points at each jump. Then posts as today.
- `cube` accepts an id, `'all'`, or (Phase 6) a group name.
- Shows the **server's** plan for this cube from `/laser/api/state` (#931 adds per-cube `path`: points in/out, frames/s):
  "scans at N Hz". The client never runs the optimiser; it reads its result.
- Unchanged: 25 fps cap, 50 ms keep-alive, blackout rising edge first. Unchanged frames are not re-sent (`pointsKey`).

**Division of work, written down so nobody duplicates it:** the browser decides **what** is drawn and in **what
order** (content). The server decides **how the galvo gets there** (step limit, corners, dwell, blanking, rate,
temperature, zone, still beam, stops). Nothing in §2 touches a galvo number.

### 2.5 Safety stays server-side (#931) — nothing in the graph can bypass it

- The graph's only door is `POST /laser/api/frame` and `/alive` and `/blackout`. No node arms, disarms, changes
  `laser.json`, the zone, the still-beam list or the guards. Arm/Disarm stay buttons in the Laser Out window (laser-ops PR).
- Blackout is an OR: any wired blackout, the window's button, `/light` blackout, the server's own stops. Audio, MIDI or
  a cue can **set** blackout, never clear another source's.
- `level` inputs only scale down (0…1).
- **New server rule, owed with collaboration (Phase 6):** one sender per cube at a time (a lease by window id). A second
  window that posts to a held cube is refused with a reason until its person presses "take over". Without it, two
  people with Laser Out open fight frame by frame.
- Every stop path #931 tests (signal loss, still beam, disarm, shutdown) applies to any frame the graph makes, because
  the graph has no other route. Phase tests add: a Trace that clips everything sends a blank frame and the server's
  review-fix "cut the playing pass" (#931 review item 1) holds.

---

## 3. Node list in three tiers (TD parity mapped)

Labels are proposals checked against vocabulary.md rules; each PR adds its rows there.

### A. TD parity

| di node (type id, label) | TD equivalent | What it does | Phase |
|---|---|---|---|
| `laser.trace` **Laser Trace** | Laser CHOP (SOP in, camera) | geometry → paths (§2.2) | 1 |
| `laser.merge` **Laser Merge** | Merge CHOP/SOP | concatenate path sets | 1 |
| Laser Out (extended) | Laser CHOP output + Laser Device CHOP | flatten, budget, route to cube | 1 |
| Cube · Sphere · … · Geo · Merge · Array · Transform (exist) | SOP primitives, Geometry COMP, Merge SOP, Copy SOP, Transform SOP | build the shape | exists |
| `signal.beat` **Beat** | Beat CHOP + tap | Ramp, Pulse, Count, Bar, Beat, Ramp Bar, BPM; Period in beats; follows the `/light` show clock when it answers (`useShowClock`), else its own BPM; Tap input forwards to the desk's tap | 2 |
| `signal.lfo` **Oscillator** (extended) | LFO CHOP + Beat CHOP sync + Pattern "Random per Cycle" | adds `wave` (sine, triangle, ramp, square, pulse, random, sample&hold), `amplitude`, `offset`, `bias`, `beats` (cycle in beats when a Beat or the show clock is wired; ratios ¼ … 64 like `/light`'s `LFO_BEATS`), `reset`. Old four outputs kept (existing documents unchanged) | 2 |
| `signal.animation` **Animation** | Animation COMP + Keyframe CHOP | keyframe channels (any number) `keys:[{t, value, easing}]` = the Studio format (`timelinePlayback.js`), easing `constant` · `linear` · `smooth` (existing smoothstep) · `cubic-bezier(x1,y1,x2,y2)`; extend Hold/Cycle/Mirror; play: Sequential (own play/speed/reset), Locked to the show clock (length in beats), or Index (wired 0…1). One output per channel. A curve editor window. Keys live in `node.values`, so the op log, undo and `di follow` carry them | 3 |
| `laser.path` **Path** (wears its operation name, the Math precedent) | Resample SOP, Carve/Sweep, Noise SOP, Trail SOP | operations: **Resample** (points per unit), **Trim** (start/end 0…1, offset: the drawing-on effect), **Displace** (noise amount/scale/speed, value-noise from `value.noise`), **Trail** (length, increment, fade; uses `frameMemory`), **Colour** (Colour Ramp along each path) | 4 |
| `laser.transform` **Laser Transform** | Transform SOP / Laser CHOP x/y scale, rotate | scale, offset, rotate, mirror X/Y, copies with step (Copy SOP in 2D), all in field units | 4 |
| `signal.audio` **Audio** (the name vocabulary.md reserves for analysis) | Audio Spectrum CHOP + TD palette audio analysis | level, low, mid, high, onset, bpm. Reads the mic in Nodes **or** the `/light` desk's `/api/audio` results; one shared analysis module for both (band edges decided once). Onset upgraded to spectral flux (Bello 2005) with the energy method kept as fallback | 5 |
| `signal.sequence` **Sequencer** | Pattern CHOP (Step), BEYOND step sequences | N steps × channels, advance on a Beat/Pulse/trigger, outputs values and a step index; drives `shape`, colour, cube group, Trace inputs | 5 |

### B. Beyond TD

| Node / feature | Why it is beyond TD | Phase |
|---|---|---|
| **Cube groups and show zones**: Laser Out `cube` takes a group (`left` = 1, 2, 3); groups live in the **project document** (not in `laser.json`, which stays safety-only); a **zone** = a group plus an artistic warp (scale, offset, keystone) applied in the browser. The safety keep-in zone and any beam attenuation stay server-side | TD Laser Device CHOP has no zones (gap audit §1); BEYOND/ofxLaser have them | 6 |
| **Batched frames**: one `POST /laser/api/frames {cube: points, …}` per tick instead of N posts; the one-sender lease (§2.5) | needed for 6 cubes × 25 fps | 6 |
| **Scene-aware lasers**: Trace `view: 'cube'` takes a laser **object** standing in a scene (position + aim) as its viewpoint; the scene preview draws the same frame through `scanLines`, and **each scan line stops at the first surface it meets** (raycast against the scene's meshes), replacing `laserLine.js`'s stated "one throw for all" limit. A frame that would leave an enclosed hall except through an opening is flagged before it is sent. `physics_check.py` (branch 072a3398) must report 0 leaks; look from outside and from the floor. Owner's physics-first rule | TD has no notion of the place | 7 |
| **Cue grid / clip launcher** `laser.cues` **Cue Grid**: a grid of saved sub-graph states (presets), launched by click, MIDI or Sequencer, quantised to beat or bar (the `/light` desk already holds changes to the next beat/bar, `desk.js:401-420`) | BEYOND cue grid; TD needs hand-built UI | 8 |
| **Laser track on the timeline**: `view.timeline` gains tracks of cues and Animation clips | BEYOND timeline | 8 |
| **Presets**: any laser node's values saved and recalled by name, stored in the project | | 8 |
| **Import**: `laser.file` **Laser File** (ILDA formats 0/1/4/5, SVG paths) and `laser.text` **Laser Text** (Hershey single-stroke) | TD has no ILDA reader in the Laser CHOP | 9 |
| **Live collaboration**: several artists edit one graph (already true for Nodes via ops and `di follow`); the lease (§2.5) decides who drives a cube; everyone sees the frame in their scene preview | TD is one person per .toe | 6 (lease) |
| **Headless runner**: the same pure evaluator runs on serverXR (or the installed di) with no browser open, so a show survives a closed tab and a reboot. Prerequisite: laser nodes import no React/DOM (three core is fine in node; the bench below ran in node) | rule 4 | 10 |

### C. Safety (unchanged, server-side, #931): see §2.5. No tier-A or tier-B node gets a safety parameter.

---

## 4. Where each operation runs, and the cost budget

| Step | Where | Notes |
|---|---|---|
| Descriptor walk, object-space paths (cached), projection, clipping, path ops, merge | browser, inside the graph pass (pure) | Worker if over budget (see below) |
| Order + resample to budget (flatten) | browser, Laser Out | shared function in `shared/laserFrame.cjs` |
| Zone (safety), step limit, corners, dwell, blanking, still beam, temperature, pacing, stops | serverXR (#931) | never in the graph |

**Budget (proposal, to be confirmed by measurement in Phase 1):** all laser work in the browser **≤ 8 ms per frame for
6 cubes at 1000 points each** on aylmo (i7-11800H) at 25 fps: 20 % of the 40 ms frame, leaving the rest to the 3D
viewport and the editor. Server: #931 review item 2 asks ≤ 5 ms per tick with a 2000-point frame on 6 cubes — that is
#931's fix, not ours; our part is to send ≤ `budget` points and not to resend unchanged frames.

**Measured now (prototype, not the product):** `raw-laser-trace-bench.mjs` (next to this file; Phase 1 lands it as
`scripts/laser/trace-bench.mjs`). Node 22.23, three 0.185.1 (dev pins ^0.186.1), aylmo at 79 °C package, 300 frames,
dense primitives in `edges` mode (sphere 16×12, torus 12×32, cylinder/cone 24 sides, all edges over 20°: 2128 segments
for 20 pieces), rotating every frame, NN order, resample to the budget:

| Case (per Trace) | 20 pieces, 1000 pts | 60 pieces, 1000 pts | 20 pieces, 2000 pts |
|---|---|---|---|
| edges rebuilt every frame | 14.3–18.9 ms median | 48–64 ms | 16.9 ms |
| edges cached per shape | 3.8–4.1 ms | 16.7–26.2 ms | 5.0 ms |
| edges **and chains** cached in object space | **2.3 ms** (p95 3.6) | 12.7 ms (p95 18.3) | — |

Frame on the wire: 925 points = 20.4 KB JSON at 4 decimals (12-bit DAC = 0.0005 steps), so 6 cubes × 25 fps ≈ 3 MB/s
on loopback — to be measured in Phase 6 against the batched route.

What the numbers decide: (1) object-space caching is mandatory (6–8× faster); (2) dense wireframes cost too much and
draw badly — **`outline` is the default** (a sphere is one ring, not 200 edges); (3) 6 Traces of 20 dense pieces is
~14 ms, over 8 ms, so if a real project exceeds the budget, the laser pass moves to a Web Worker (same pure code). The
budget check is a test: the bench fixture (6 Traces × 20 outline pieces) must stay ≤ 8 ms median on aylmo, and Laser
Out's status shows the live `performance.measure` of the laser pass.

Limits of the measurement: one machine, hot CPU, a naive prototype (string keys, O(n²) NN); not in a browser; the
viewport's own cost not included.

---

## 5. Phases — one reviewable PR each

Every phase: own branch from `origin/dev`, vitest unit tests for each pure function (counted gate: `Tests N passed`,
N > 0), the agent-screen browser check (`di-test-browser`, ends on `about:blank`), the fake-cube rehearsal from #931
(`scripts/laser/fake-cube-rehearsal.mjs`), then **seen on the real surface**: the two LaserCubes on aylmo drawing on the
wall, armed by the owner in the Laser Out window, with a phone video kept in the PR. Vocabulary rows added in the same PR.
Prerequisites for Phase 1: #931 merged with review items 1–2 fixed, and the laser-ops PR merged.

| # | PR | Tests | Seen on the real surface |
|---|---|---|---|
| **1** | **Geometry to laser.** `laser` port type; frame v2 helpers in `shared/laserFrame.cjs` (normalise, from points, flatten with NN + resample); `laser.trace` (front + point views; outline and edges; colour per piece; caches); `laser.merge`; Laser Out reads v2, `budget` input, shows server scan rate; bench lands in `scripts/laser/`. Uses the **existing** Oscillator to animate | descriptor → paths for every kind (counts: box 12 edges, …); group transforms compose like the viewport; clipping never clamps; NN never loses a path; legacy frames round-trip; flatten ≤ budget and ≤ 2000; bench ≤ 8 ms | **The TD workflow, end to end:** a Geo with a Cube and a Torus → Merge with a Sphere → Oscillator drives the Geo's rotation → Laser Trace → Laser Out to cube 1, a second Trace with `point` view to cube 2. Owner sees both on the wall: shapes match the viewport, colours per piece, no false edge lines, corners sharp |
| 2 | **Beat and Oscillator v2.** `signal.beat`; Oscillator waves/amp/offset/bias/beats/reset; follows the `/light` show clock | wave values at exact ms (as `lighting/lfo.js` tests do); beat phase vs clock epoch; tap forwarded | a Laser Trace pulsing on the beat of music playing in the studio; a tap on the desk moves the laser's tempo within 0.5 s |
| 3 | **Animation.** `signal.animation` + curve editor window; Studio's key format and easings shared from one module | interpolation per easing; extend Hold/Cycle/Mirror; locked-to-clock vs sequential; ops carry keys (two windows) | the owner keys a rotation and a size over 8 beats; it loops on the cubes in time |
| 4 | **Path ops and Laser Transform.** `laser.path` (Resample, Trim, Displace, Trail, Colour), `laser.transform` | each op on fixtures; Trail memory cleared on document change; budgets held after Trail | a drawing-on Trim, a noise wobble, a trail behind a moving shape, mirrored on cube 2 |
| 5 | **Audio and Sequencer.** one shared analysis module (Nodes mic + `/light`), `signal.audio` with onset; `signal.sequence` | onset precision/recall on a labelled clip (method: Bello 2005 evaluation, ±50 ms window); sequencer steps on pulses | a kick drum switches shapes on the cubes; the owner judges the timing by ear and eye |
| 6 | **Routing, groups, zones, batched frames, one-sender lease** (client + server) | group resolution; lease refusal and take-over; batched route; network MB/s measured | one graph drives "left" (cube 1) and "right" (cube 2) differently; a second browser cannot steal a cube without take-over |
| 7 | **Scene-aware lasers.** Trace `view: 'cube'`; preview lines stop at the first surface; `physics_check.py` 0 leaks | raycast stops; a frame aimed through a wall is flagged | the scene's preview of the two cubes matches the wall from the floor and from outside |
| 8 | **Cue Grid, laser timeline track, presets** | quantised launch to beat/bar; presets round-trip | the owner runs a short set from the grid with MIDI |
| 9 | **Laser File and Laser Text** (ILDA 0/1/4/5, SVG paths, Hershey) | ILDA fixtures from the ILDA test patterns; SVG path commands; point caps | the ILDA test pattern and a word on the wall |
| 10 | **Headless runner** on the installed di / serverXR | the same graph gives the same frames in node and browser; survives a reboot (systemd user unit) | the cubes keep drawing with every browser closed; a fault shows in one place (`/laser/api/state`) |

---

## 6. Open questions for the owner (with the default I recommend)

1. **How should round shapes draw?** Outline (sphere = its silhouette ring, cylinder = rims + sides; clean, bright,
   few points) or every mesh edge like a TD wireframe. *Default: outline; `edges` and `wire` one click away.*
2. **Which clock leads?** *Default: Nodes follows the `/light` desk's clock and tap when the desk answers, and keeps its
   own BPM otherwise; a tap in Nodes taps the desk.*
3. **Points per cube per frame.** 1000 ≈ 30 drawings a second at 30 kpps (steady), 2000 ≈ 15 (more detail, visible
   flicker). *Default 1000, per Laser Out; the server's real scan rate shown beside it.* (Flicker threshold unvalidated:
   to be judged on the wall.)
4. **Where do cube groups live?** In the project (travels with the work, follows to dev) or in the place's rig.
   *Default: in the project; `laser.json` stays safety-only.*
5. **After Phase 1, keyframes or audio first?** *Default: Beat + Oscillator (2), Animation (3), then path ops (4),
   audio (5) — the order of the TD workflow he already uses.*

---

## 7. Not done / owed (stated, not rounded up)

- Pangolin BEYOND wiki pages could not be fetched (domain blocked for the fetcher); BEYOND claims are second-hand from
  `laser-raw-gap-audit.md`. Blender F-curve and vpype pages cited from knowledge, not re-read this session.
- The laser-ops PR was not found on GitHub; its scope is assumed from the brief.
- Phase-1 budget is a proposal measured on a prototype, not on the product, in node not the browser.
- Flicker threshold, step/dwell numbers and the ±18.5° field are unvalidated until seen on the real cubes (#931 owes
  the same checks).
- Two audio band definitions (150 vs 250 Hz) exist today; the shared module in Phase 5 settles one, with the owner's ear.

Sterile: the bench ran in the session scratchpad and finished; a copy is kept beside this file for Phase 1 to land.
