# Node backlog

The node registry declared 49 types. An audit on 2026-07-30 found **27 that do
something and 22 that were declarations with nothing behind them** — no case in
`nodeGraphRuntime.js`, no renderer, no capability code.

Nothing is deleted. Each dead definition is the **port contract to build
against**: its inputs, outputs and types are the spec. They are withheld from the
palette via `UNIMPLEMENTED_NODE_TYPES` in `src/project/nodeRegistry.js` so the
editor stops advertising work that does not exist.

**Implementing one means deleting its line from that set.** That is the whole
workflow — the set is the backlog, the diff is the progress.

Existing documents are untouched. The gate blocks *creating* new instances;
anything already placed still loads and renders.

---

## Works today (27)

A 2026-08-06 audit found the "works today" label had overstated things: several
of the 27 had output ports that were never computed, or read `node.values`
directly instead of through the graph, so wiring into/out of them was a no-op
even though the palette let you draw the edge. First stabilization pass (same
day, see `docs/ai/known-fixes.md`): `universe.world.title`/`.bgColor` are now
genuinely wire-evaluated, `geom.cube.bounds` is a real computed output, and
every port that had zero consumers anywhere (`gridSize`, `slug`, `description`,
`active`, `entry`, `state`, `signal`, `preview`, `world.background.texture`,
per-node `position`/`width`/`height`, and the never-consumable `geom.*.out`
Geometry ports) was deleted rather than left as a decorative wire target.
Remaining gaps: `math.multiply`/`math.mix`/`math.clamp`, `world.light`,
`world.grid`, and `geom.sphere`/`geom.plane` wiring are implemented but still
have no dedicated runtime test — correct by inspection, not yet guarded.

| Group | Types |
| --- | --- |
| Compute (14) | `value.number` `value.color` `value.vec3` `value.boolean` `value.string` · `math.add` `math.subtract` `math.multiply` `math.divide` `math.mod` `math.pow` `math.sin` `math.mix` `math.clamp` |
| Clock (1) | `time` — **built 2026-07-30**, the first one off this backlog |
| 3D (4) | `geom.cube` `geom.sphere` `geom.plane` `universe.desk.3d` |
| World (3) | `world.light` `world.background` `world.grid` |
| Panels (4) | `universe.world` `view.browser` `view.image` `view.text` |
| Structure (1) | `universe.space` |

---

## The queue (22)

Ordered by leverage per unit of work. Take them top-down.

### 1. Capture — 6 types

`source.webcam` · `source.mic` · `source.ar` · `source.insta360` ·
`source.stereo` · `source.realsense.d405`

**`getUserMedia` appears zero times in `src/`.** No camera or microphone is ever
opened. These produce `texture` and `number` outputs that nothing generates.

Build `source.webcam` first: it is the smallest real capture node and proves the
whole texture path end to end (getUserMedia → `<video>` → `VideoTexture` → a
`geom.plane`'s `textureUrl`). `source.mic` is next and needs an `AnalyserNode`
for its `volume`/`frequency` outputs. Everything after that is hardware —
`insta360`, `stereo` and `realsense.d405` cannot be finished or tested without
the physical devices, so keep them last regardless of how interesting they are.

Watch for: permission denial and device-unplugged are the normal cases, not edge
cases. A capture node must render a visible refused/unavailable state rather than
sitting blank. Every stream also needs stopping on unmount — a leaked webcam is
a lit camera light the user cannot explain.

### 2. Devices — 5 types

`device.osc.in` · `device.osc.out` · `device.ptz.osc` · `device.midi.in` ·
`device.midi.out`

**`requestMIDIAccess` appears zero times.** OSC appears only inside
`nodeRegistry.js` — there is no client, no socket, nothing.

MIDI is the cheaper pair: Web MIDI is a browser API, so `device.midi.in`/`out`
are self-contained. OSC is UDP and the browser cannot speak it — all three OSC
nodes need a `serverXR` relay (WebSocket in, UDP out) before any of them can
work, so treat that relay as the real ticket. `device.ptz.osc` sits on top of
that relay and additionally claims a `frame` output, which makes it a capture
node too; it depends on §1.

### 3. Streaming — 6 types

`stream.compositor` · `stream.switcher` · `stream.output` · `stream.recorder` ·
`stream.monitor` · `stream.controller`

**`RTCPeerConnection` appears zero times.** No compositing, no transport.

This family is a project, not a task, and it depends on §1 — a compositor with
nothing to composite is meaningless. `stream.recorder` is the exception worth
pulling forward: `MediaRecorder` is already used in `src/hooks/useAssetPipeline.js`,
so recording a canvas to an asset is mostly wiring that exists.

Note `stream.monitor` and `stream.controller` are `panel-2d`, so they hit the
trap in §"Known trap" below.

### 4. Structure — 5 types

`universe.node0` · `universe.desk.2d` · `universe.activate` · `universe.link` ·
`node.null`

Zero consumers outside the registry. Cheapest group by far — no hardware, no
protocol, no permissions — and the one most likely to be **cut rather than
built**. Decide intent before writing code:

- `universe.node0` predates the 2026-07-17 decision that the document root is an
  ordinary scope with no forced root type (see the comment in `RawEditor.jsx`).
  It probably no longer has a meaning. Likely delete.
- `universe.desk.2d` is the flat sibling of `universe.desk.3d`, which does work.
- `universe.link` overlaps the URL/tree addressing work in
  `docs/architecture/SPEC_url_architecture_and_tree_addressing.md` — do not build
  it before that spec is signed off, or it will be built against the wrong model.
- `node.null` is the pass-through/reroute node; `getNodeInputs` already has an
  `isNull` branch for it, so it is closer to done than it looks.

---

## Known trap: dead panel nodes become text boxes

`RawEditor.jsx`'s panel switch handles `universe.world`, `view.browser` and
`view.image`, and **everything else falls through to `TextPanelWindow`**. So an
unimplemented `panel-2d` node — `stream.monitor`, `stream.controller`,
`universe.desk.2d` — opened looking like a deliberate feature and quietly showed
a text panel instead.

The palette gate closes this for new documents. If a `panel-2d` type is ever
un-gated before its panel exists, it returns.

## Note on the demo preset (removed)

`RawEditor.jsx` used to have a "Streaming Prototype" overflow-menu button that
built a canned studio graph — Insta360, stereo, mic, PTZ, controller,
compositor, output, monitor — via `createNode` calls that bypassed the palette
gate. It laid out the cards; nothing drove them, and two of the nodes
(`stream.monitor`, `stream.controller`) hit the "Known trap" below and silently
rendered as generic text boxes. It was never evidence any of those types work,
only misleading UI, so it was deleted rather than fixed.

## Method

Static analysis: call-graph and reference tracing, not clicking through the app.
Strong evidence for absence — you cannot capture a webcam without `getUserMedia`
— and weaker evidence that the 27 "working" types are bug-free. A runtime pass
over the working set is worth doing separately.
