# Inside a node: audit + one design for every node

Worktree `/home/dob/work/di.iiii-asuz`, branch `feat/raw-picture-operators`, HEAD `10c5ed79`.
Read-only audit, 2026-09-14. All line numbers are at that HEAD.

Owner, 2026-09-14: *"when I'm inside the Cube it's not the same as in Camera In and the
nodes … like a see-through Game Boy where you can see all details, and if needed go inside
and change something, or from outside change the parameters."*

Said back: every node, when you step inside it, is the same case. You see it working (its
picture, shape, number or signal), you see and change its settings, you see what goes in and
what comes out with the live values and where the wires lead, and you see the parts it is made
of: the real code. Where it is safe, you can change that code too. A container is the same case
with its inner nodes as the thing you look at.

---

## 0. How "going inside" works today (shared mechanics)

| What | Where |
|---|---|
| Enter = double-click a card, or its enter button | `RawGraphSurface.jsx:1364`, `:1376-1395` -> `onEnterNode` |
| Enter handler | `RawEditor.jsx:629-649` `handleEnterNode` |
| A **panel** node (`render:'panel-2d'`) whose window is closed does NOT enter; it reopens the window | `RawEditor.jsx:636-639` |
| `universe.world` also turns on fullscreen | `RawEditor.jsx:640` |
| **The selection is cleared at the door** | `RawEditor.jsx:645` |
| Scope stack | `src/project/graph/useNodeGraphScope.js:17-62` |
| The inspector only shows a node that stands in the current scope, so the node you are inside is never inspectable from inside | `RawEditor.jsx:385-388` (`isNodeInScope`), `:1846`, `:2711` |
| The canvas is swapped for the node's children | `RawEditor.jsx:2291-2346` (`RawGraphSurface key={currentScopeId}`) |
| Empty-canvas sentence depends on the kind | `RawEditor.jsx:995-1027` (`scopeEmptyHint`, `isNodeMadeOfCode` = `nodeRegistry.js:2960`) |
| "What it's made of" button on the empty canvas (code nodes only) | `RawEditor.jsx:2328` -> `RawGraphSurface.jsx:1243-1245` |
| Scope marker `‹ inside X ? ◈` | `RawEditor.jsx:2501-2551` |
| The anatomy sheet, a floating DesktopWindow | `RawEditor.jsx:211`, `:1034-1045`, `:1560-1580`, `:2664-2679`; frame `windowLayout.js:270-340` |
| Picture-operator overlay | `RawEditor.jsx:2350-2357` -> `topInside/TopInsidePanel.jsx` |
| Panel windows mount only in the scope they stand in | `windowLayout.js:55-68` `selectMountedPanelNodes` |

Three consequences hold for every family. Most of the audit below comes from them.

1. **Inside, the parameters are gone.** Selection is cleared on entry (`:645`), and the node
   you are inside is out of scope for the inspector (`:385`). So inside a Cube you cannot see
   or change its size or colour. Inside Camera In you cannot change Mirror or any operator
   parameter: `TopInsidePanel` has Camera/Shader/Script sections and **no parameters**
   (`TopInsidePanel.jsx:50-62`).
2. **Inside a panel node, its own window disappears.** The window stands in the parent scope
   (`windowLayout.js:65`), so entering Text, Webcam, MIDI In or DMX Out gives an empty grid
   and the sentence "Inside X, code, no room of its own." The inside shows *less* than the
   outside.
3. **Nothing live is shown for non-picture nodes** unless you open the `?` sheet. Even there
   the values are text rows at 125 ms steps (`RawEditor.jsx:1560`). There is no preview, no
   history and no downstream list.

---

## 1. Audit by family

Family membership: `nodeRegistry.js:66-190` (`FAMILY_BY_TYPE`). Code locations below come
from `buildManifest()` (`scripts/node-anatomy-lib.mjs:209-267`), run against HEAD.

### 1.1 make / geometry
`geom.cube/sphere/plane/cylinder/cone/torus/line/circle` (spatial-3d), `geom.array`,
`geom.transform`, `shape.merge` (hidden), `view.text/list/image/browser/library` (panel-2d),
`node.null` (container, unbuilt), `geom.constructor` (container).

- **Entering Cube today:** empty grid. The hint says "Inside Cube. What you place here becomes
  part of it." (`RawEditor.jsx:1021-1024`), with a "What it's made of" button (`:2328`). No
  picture, no params (consequence 1). The `?` sheet lists takes/gives with values, and the
  compute lines `nodeGraphRuntime.js:205-223` and draw lines `RawViewport.jsx:345-353` sit
  behind "Show the lines" (`NodeAnatomyPanel.jsx:115-160`).
- **Array/Transform/Merge:** same, with "code, no room of its own". Their card shows a 3D shape
  preview (`cardPreview/previewTypes.js:134-147`, kind `shape`). **Inside shows no shape.**
- **Text/List/Image/Browser/Library (panel-2d):** entering with the window open gives an empty
  grid, and the window vanishes (consequence 2). The panel code is `RawEditor.jsx:1626-1631`,
  `:1768-1770`, `:1813-1842`. The sheet names the location only and never quotes it
  (`NodeAnatomyPanel.jsx:287-298`). The real component file (`TextPanelWindow.jsx` etc.) is
  never named.
- **Missing vs owner's model:** a live 3D view of the object inside (the card already has one,
  at 184x104 px), its parameters, the outputs' destinations, and the code in view without a
  disclosure hunt.

### 1.2 numbers / signals
`value.*`, `math.*`, `signal.*`, `time`, `value.noise/random`, `vector.*`: all hidden,
colocated runtimes in `src/project/nodes/<id>/runtime.js`. `value.*` is the switch
`nodeGraphRuntime.js:198-204`.

- **Today:** empty grid, "Inside LFO, code, no room of its own." The sheet shows each output
  as a text value quantised to 125 ms. A sine becomes a number flickering every eighth of a
  second, with no waveform.
- The runtimes are tiny: 31.6 kB raw total, 8.9 kB gz for all of them. The whole module is
  one type's code, so it is the ideal "made of".
- **Missing:** a number with a sparkline or scope per output, input/output wiring you can
  jump to, params (frequency, phase) you can scrub while watching the trace, and a way to
  change the formula (no hook exists). The inspector's "Code — stored, not run" box
  (`nodeInspectorSections.js:75-84`, `:174-182`) is the only "code" a person can type into,
  and nothing reads it (grep: only `nodeInspectorSections.js` and its test mention `__code`).

### 1.3 colour
`value.color`, `colour.combine/split/ramp`: numbers family, hidden, colocated.
- **Today:** same as numbers. The sheet shows a swatch per colour port
  (`NodeAnatomyPanel.jsx:31-39`, `formatPortValue.js:47`).
- **Missing:** a big swatch with a history strip (a ramp being driven reads as a band of
  colour over time), and params.

### 1.4 logic
`logic.compare/combine/route/toggle`: hidden, colocated. `math.op` and `logic.route` are
operator families: the operation is a select above the ports (`nodeInspectorSections.js:133-142`).
- **Today:** as numbers. Booleans read "yes/no" (`formatPortValue.js:50`).
- **Missing:** a step scope (0/1 over time) so a gate opening is visible, and the Operation
  menu inside.

### 1.5 time
`time` (colocated `nodes/time/runtime.js`), plus the one hand-kept extra place
`useGraphClock.js` (`node-anatomy-lib.mjs:201-207`). `view.timeline` is watch/panel-2d, with
runtime `nodes/view.timeline/runtime.js` and panel `RawEditor.jsx:1738-1754`.
- **Today:** as numbers. The sheet adds "It only moves because something outside it keeps a
  clock." Timeline: empty grid, window gone.
- **Missing:** elapsed/beat readout, sin/cos traces, beat ticks. For Timeline, its own window
  in the inside.

### 1.6 the scene / world
`world.light`, `light.point`, `world.camera` (spatial-3d, no computes, draws
`RawViewport.jsx:495-569`); `world.environment/background/grid` (hidden, no code of their own:
they fall through to `node.values`, `nodeGraphRuntime.js:381`); `port.in` (switch
`:336-347`), `port.out` (no code: it is read by the doorway block `:181-195`); containers
`universe.world/space/desk.3d`, `geom.geo`, `studio`; unbuilt `universe.activate/link/desk.2d/node0`.
- **Light today:** empty grid with "What you place here becomes part of it". The card has a
  lit-sphere preview (`previewTypes.js:127`, `previewRenderer.jsx:71-101`). Inside has none.
- **Environment/Grid/Background:** "code, no room" and the sheet says "code". The truth is
  *their consumers* read them (the room reads `node.values`), and no line of their own exists.
  The manifest reports `computes: null`.
- **Missing:** the lit preview, params, and for consumer-read nodes an honest "read by" place
  (RawViewport's world resolution) rather than a blank.

### 1.7 watch / panels
`view.outliner/inspector/timeline/director/desk`, `stream.monitor`: all panel-2d, panel
branches in `RawEditor.jsx:1632-1646`, `:1722-1724`, `:1759-1767`, `:1783-1797`.
- **Today:** consequence 2. The window disappears and the grid is empty.
- **Missing:** the window itself, as the inside's preview. The component file (e.g.
  `MonitorPanelWindow.jsx`) as "made of", not a line range in the 146 kB editor.

### 1.8 bring-in devices
`source.webcam` (switch `:286-290` + `WebcamSourcePanel.jsx`), `source.mic` (`:311-318` +
`MicSourcePanel.jsx`), `device.midi.in` (`:291-301` + `MidiInputPanel.jsx`), `device.keyboard`
(hidden, colocated, fed by `KeyboardFeed.jsx` mounted at `RawEditor.jsx:2582`), `view.button`
(colocated + `ButtonPanelWindow.jsx`), `geom.model`, `media.video/audio` (spatial, colocated
readers of `liveOutputs`). Unbuilt: `device.osc.in`, `device.ptz.osc`, `source.ar/insta360/stereo/realsense.d405`.
- **Webcam today:** entering with the window closed reopens the window and does not enter.
  With it open, you get an empty grid and the camera window vanishes: **the precise contrast
  the owner saw with Camera In**, which shows its picture and device controls.
- The sheet does classify outputs as "put here by its own window" through substitution
  (`nodeReading.js:99-136`). That is correct and useful.
- **Missing:** the live frame (`LiveTextureView.jsx` already copies a texture to a canvas),
  device status (which device, permission, error), params, and "fed by window X / feed Y" as
  the made-of.

### 1.9 send-out devices
`device.dmx.out` (colocated status reader + `DmxOutPanelWindow.jsx`, 13 kB), `device.midi.out`
(colocated + `MidiOutFeed.jsx`, mounted `RawEditor.jsx:2587`), `view.publish` (panel). Unbuilt:
`device.osc.out`, `stream.output/recorder/compositor/switcher/controller`.
- **Today:** empty grid. The sheet says the status output is "code". The runtime comment says
  "the sending half lives in DmxOutPanelWindow" (`nodes/device.dmx.out/runtime.js:1-4`), but the
  sheet never shows that file.
- **Missing:** what is going out now (the inputs' live values *are* the output), device/rig
  status, and the sending component as made-of.

### 1.10 agents
`agent` (panel only, `RawEditor.jsx:1798-1808`, `AgentChatPanelWindow.jsx`), `agent.keeper`
(`:302-310` + `KeeperPanelWindow.jsx`), `work.agent` (`:325-329`), `work.status` (`:319-324`
+ `WorkStatusPanel.jsx`).
- **Today:** consequence 2. Keeper's reply is visible only as a quoted 60-char string in the
  sheet (`formatPortValue.js:53`).
- **Missing:** the conversation/status window as the preview, and busy/running as a signal
  scope.

### 1.11 pictures `top.*`
`top.camera/difference/level/blur/edge/feedback/blend/analyze/out`. Types are built from
`TOP_OPERATORS` (`tops/topOperators.js:26-220`, `:261-287`). Params are `configInputs`, not
ports (`:258-259`). One shared runtime `tops/topRuntime.js:8-12`.
- **Today (the best inside):** a full-width overlay above the grid, `z-index:5`
  (`topInside.css:2-15`), containing:
  - header: kicker, label, "runs on" (`TopInsidePanel.jsx:41-48`)
  - 640x360 live picture via `registerTopThumbnail` + `setInspectedTop` (`:27-32`, `:51-53`)
  - Camera section for `source:'camera'`: resolution/modes/ranges and JSON constraints from
    the machine's report (`:79-175`)
  - Shader: editable GLSL, local `checkShader` + remote compile report, "Back to the
    original" (`:207-246`)
  - Script: `frame()`/`open()` JS, gated per machine by `DI_DESK_SCRIPTS=1`
    (`:250-292`, `topScripts.js:19-35`, enforced at `useTopNetwork.js:109`, `:147-170`,
    server flag `serverXR/src/machineIdentity.js:66-70`)
- **Missing:** the operator's **parameters** (Mirror, Level's gamma, etc.: not on screen, see
  consequence 1), inputs/outputs with wiring, the Analyze numbers as live traces, and the
  scope marker's `?` anatomy for tops, which is wrong: the manifest has `computes: null` for
  every `top.*` because `NODE_RUNTIMES` spreads `computeTopOutput` instead of a
  `nodes/<id>/` folder (`nodes/index.js:60`). The sheet would say "code" and show no place.
  The overlay also hides the `?` sheet's usefulness entirely.

### 1.12 containers
`universe.space` (root, auto-entered `useNodeGraphScope.js:26-31`), `universe.world`
(panel-2d, fullscreen on enter), `universe.desk.3d`, `geom.geo`, `geom.constructor`, `studio`,
`node.null`/`universe.node0` (unbuilt/authoring-only). Set at `nodeRegistry.js:2930-2942`.
- **Today:** children as a sub-graph. The hint says "Inside X. Tap to place the first node."
  The `?` sheet's fourth row says "It holds N nodes. You are standing in them."
  (`NodeAnatomyPanel.jsx:211-218`) and quotes the doorway block `nodeGraphRuntime.js:181-195`.
- **Missing:** the container's own params (a Geo's position/scale) are unreachable inside, its
  doors' live values sit behind `?`, and there is no preview of what it *gives* (the Geo's
  combined shape, which the card shows).

### Summary table

| Family | Inside today | Preview | Params inside | Live I/O | Made of | Change code |
|---|---|---|---|---|---|---|
| make 3D | empty grid + hint | no (card has one) | no | `?` sheet only, text | behind disclosure | no |
| make panel | empty grid, window hidden | no | no | `?` | location only | no |
| numbers/colour/logic/time | empty grid | no | no | `?`, 125 ms text | runtime.js quote | dead `__code` box |
| scene (lights) | empty grid | no (card has one) | no | `?` | draws quote | no |
| watch | empty grid, window hidden | no | no | `?` | location only | no |
| bring-in | empty grid or window reopen | no | no | `?` "its window" | location only | no |
| send-out | empty grid | no | no | `?` | status reader only | no |
| agents | empty grid, window hidden | no | no | `?` | location only | no |
| pictures | overlay: picture/camera/shader/script | yes | **no** | no | shader (editable) | shader + script (gated) |
| containers | sub-graph | no | no | `?` | doorway quote | n/a |

---

## 2. Design: one inside for every node

### 2.1 The frame

One component, `InsideView`. It mounts whenever `currentScopeId` is set, and replaces both
`TopInsidePanel` and the anatomy DesktopWindow. It absorbs the scope marker's job for
non-containers (back, name, runs-on), so there is no extra strip.

Four regions, always the same order and names on every node:

```
 HEAD   ‹  ● Label (rename)   typeId · family            runs on: this machine   ◈
 ------------------------------------------------------------------------------
 IN (params + inputs)  |  SEE (live preview)             |  OUT (outputs + feeds)
                       |------------------------------------|
                       |  MADE OF (code: computes/draws/   |
                       |  window/shader/script tabs)       |
```

**Desktop, 1440 wide** (below the 49 px topbar; the frame fills the workspace, no floating
window, no wasted margin):
- HEAD: 40 px, one line.
- Grid `280px | 1fr | 260px`, gap 1 px hairlines (not cards-in-cards).
- SEE: top of the centre column, `aspect-ratio 16/9`, `max-height: 55%` of the frame.
- MADE OF: under SEE, fills the remaining height, scrolls inside itself; collapsed to its
  tab strip (32 px) if the person closes it (remembered per viewer in localStorage).
- IN and OUT columns scroll independently.
- Containers: the centre column is the live sub-graph (`RawGraphSurface` unchanged). IN and
  OUT become 260 px side rails, each collapsible to a 28 px edge tab. SEE becomes a
  160 px-tall strip at the top of the OUT rail showing what the container *gives* (the Geo's
  shape). MADE OF is a tab in the OUT rail (doorway lines + draws).
- Below 1100 px: OUT folds under IN in one left column (`320px | 1fr`).

**Phone, 390 wide:** one column.
- HEAD 44 px (back, label, runs-on as an icon with the name in its title).
- SEE full width at 16:9 (~219 px), `position: sticky; top: 0` so a parameter being scrubbed
  stays in view of its effect.
- A segmented control (40 px, one-finger): **In · Out · Made of**. In is selected on entry.
- The chosen list scrolls under the sticky preview. All scrub fields are already touch-capable
  (`ScrubNumberInput.jsx`, pointer events + arrows).
- Containers on phone: sub-graph full screen; In/Out/Made of open as the existing 38 dvh
  bottom sheet (`raw.css:4397-4408`) from a 3-button strip.
- The selection inspector sheet is not shown for the scope node (the frame is its
  inspector); selecting a child inside a container still uses it.

### 2.2 SEE: live preview by output type

Choose by the node, in this order (`insidePreviewKind(node)`, a pure function next to
`previewTypes.js`):

| Kind | When | Renders | Reuses |
|---|---|---|---|
| `picture` | `isTopType` | full-size operator output | `registerTopThumbnail` + `setInspectedTop` (`TopInsidePanel.jsx:27-32`) |
| `texture` | first output type `texture`, not top (webcam, video) | the live frame | `LiveTextureView.jsx` on `evaluateNodeOutput(node,'frame')`; "no frame, the window that makes it is closed" when null |
| `object3d` | `cardPreviewKind(typeId)` is `body`/`shape`/`light` | the real body, orbitable | export `PreviewContent` from `previewRenderer.jsx:47-102`; a lazily imported `InsideStage3D.jsx` with its own R3F `<Canvas>` + OrbitControls at frame size (one extra WebGL context, only while inside) |
| `window` | `render:'panel-2d'` (text, list, webcam UI, DMX, keeper, monitor, timeline…) | the node's own window content | `renderViewNodeContent(node)` (`RawEditor.jsx:1582`), rendered in SEE; the floating window stays hidden inside, so there are never two live copies |
| `number` | all outputs numeric | big current value of the first output + a 10 s sparkline, one trace per numeric output (LFO: 4 overlaid, labelled) | new `InsideScope.jsx` (2D canvas ring buffer) |
| `signal` | boolean or `signal` outputs | step scope; a rising count (beat, presses) is drawn as ticks | `InsideScope` mode |
| `colour` | colour outputs | large swatch + a 10 s history strip | `InsideScope` mode |
| `vec3` | vec3 outputs | x/y/z traces + readout | `InsideScope` mode |
| `text` | string outputs | the text, wrapped, full | plain |
| `device` | send-out without a window (MIDI Out) | status line + what is going out now (inputs' live values) | plain |
| `none` | no outputs, not panel (Grid, Background) | a single line: "Read by the room: nothing of its own runs" + values | plain |
| unbuilt | `!isNodeTypeImplemented` | the existing banner text (`NodeAnatomyPanel.jsx:238-242`) | |

Sampling for scopes: one `requestAnimationFrame` loop in `InsideView` evaluates the node's
outputs with the frame's own context each tick and pushes into ring buffers (600 samples).
Rules:
- Its own `frameMemory` (the anatomy comment `RawEditor.jsx:1548-1553` explains why sharing
  corrupts Lag).
- The **unquantised** clock for the scope; the 125 ms quantising stays for text readouts only.
- When no clock node exists (`hasClockNode` false), sample on document change only, so an
  idle desk costs nothing.

### 2.3 IN: parameters and inputs, one list

In this codebase a parameter *is* an unwired input or a `configInput`
(`nodeInspectorSections.js:152-154`). So IN is **one list**, not "params" plus "inputs":

Each row: `label · type` / control / live value / origin.
- **Control:** exactly the inspector's field, via the existing `PropertyField` (extract it from
  `PropertyInspector.jsx:36-150` and export it). Numbers and vec3 use `ScrubNumberInput`;
  colour, checkbox, select, asset as today. Operation menu first (`nodeInspectorSections.js:133-142`).
  Top machine/camera options via the `withMachines` augmentation (`RawEditor.jsx:873-889`),
  moved into a helper so both inspector and frame use it.
- **Wired row:** control disabled (same `wired` flag, `nodeInspectorSections.js:91-95`),
  replaced by the live value + `from Card · port ›`. Clicking jumps to that card (2.5).
- **Origin word** from `resolveInputRow` (`nodeReading.js:65-87`): typed here / default /
  wired / "wired, nothing coming through".
- Door sockets (containers) marked as today (`NodeAnatomyPanel.jsx:88-90`).
- Top camera device controls (`TopInsidePanel.jsx:79-203`) move in as an IN sub-group
  "Camera (from its machine)" under the Camera row.

Field data: `deriveNodeInspectorSections(node, { wiredPortIds })` for controls, merged by port
id with `readNode(...).takes` for values/origins. No new field derivation.

### 2.4 OUT: outputs and where they go

Each row: `label · type` / live value (swatch, number, "a picture 640x360", text) /
source word (code, its window, a door; `resolveOutputRow`, `nodeReading.js:122-136`) /
**feeds:** `→ Card · port ›` for every edge from this port. Clicking one jumps to that card.

`readNode` gains `feeds` per give row: `edges.filter(e => e.fromNodeId === node.id && e.fromPort === port.id)`,
labelled with `getNodeInputs(toNode, allNodes)`. That is 10 lines in `nodeReading.js:182-187`
plus a test.

Top Analyze outputs (brightness, amount, x, y) get sparklines through the same row mini-scope.

### 2.5 Jump to a node

Edges only join siblings (doorway design, `nodeGraphRuntime.js:330-335`), so an upstream or
downstream card of the node you are inside stands in the *parent* scope. Today's
`handleShowFeedingCard` (`RawEditor.jsx:1575-1580`) already does "walk out one level, select".

Generalise to `goToNode(nodeId)` in `useNodeGraphScope.js`: build the ancestor chain from
`parentId` into a nav stack `[null, …ancestors]`, then select. This also serves Outliner and
future search. Optional second action on the row: `enter ›` (go to its parent scope, then
enter it), so a person can walk a chain inside-to-inside the way TouchDesigner's network
jumps work.

### 2.6 MADE OF: the real source

Tabs appear only for places that exist for that type. The slot names are the anatomy's own
facts, not new ones:

| Tab | Source | Which kinds | Editable |
|---|---|---|---|
| **computes** | colocated `nodes/<id>/runtime.js` whole file, or the `computeNodeOutput` switch case | numbers, colour, logic, time, most make, some bring-in/agents | no (built-in JS) |
| **door** | `nodeGraphRuntime.js:181-195` | containers | no |
| **draws** | `renderNodeBody` case in `RawViewport.jsx` | spatial-3d | no |
| **window** | the **component file** the panel branch renders (e.g. `WebcamSourcePanel.jsx`), plus the 1-line branch location in `RawEditor.jsx` | panel-2d, feeds (`KeyboardFeed`, `MidiOutFeed`) | no |
| **shader** | `shaderSourceFor(typeId, values)` (`topEngine.js:42`) with preamble disclosure | `top.*` | **yes** (moved from `TopInsidePanel.jsx:207-246`) |
| **runtime** | `tops/topRuntime.js` | `top.*` | no |
| **script** | `values.__script` | `top.*` now; numbers/colour/geometry in phase 2 (2.8) | **yes**, gated |
| **also needs** | `EXTRA_PLACES` (`useGraphClock.js` for time) | time | no |

Above the code, the anatomy's summary sentences stay as one line each (worksItOut,
sharedWith, alsoNeeds: `NodeAnatomyPanel.jsx:162-209`). Built-in code is shown in a
read-only `<pre>` with line numbers matching the real file (`fromLine` offset), so
"line 212" is the same line in an editor.

**Getting the text at runtime.** Today `nodeSourceSlices.js:21-32` lazily `?raw`-imports
**whole files** and slices them: `nodeGraphRuntime.js` is 6.3 kB gz, `RawViewport.jsx` is now
**16.9 kB gz** (its comment still says 7.0, stale), and `RawEditor.jsx` (38 kB gz) is refused.

Proposal: a second virtual module, `virtual:node-source`, from the same plugin
(`vite.config.js:260-292`) and the same `buildManifest()`. It emits **only the measured
slices**, keyed `{ [typeId]: { computes, draws, window, door } }` as strings, plus the doorway
text once and de-duplicated shared cases (value.* share one).
- Measured at HEAD: all `computes` slices 40.1 kB raw / **10.6 kB gz**, `draws` 13.7 / **2.8**,
  editor branches 11.5 / **2.4**; all together **15.3 kB gz**.
- Import it only via `import('virtual:node-source')` from `InsideMadeOf.jsx`, so it is **one
  lazy chunk paid on the first Made-of open**. The main bundle only carries the existing small
  `NODE_ANATOMY` JSON.
- Fingerprint refusal is no longer needed for these slices (text and ranges come from one
  build), so `nodeSourceSlices.js` shrinks to the **component files**: an
  `import.meta.glob('../components/*{PanelWindow,Panel,Feed}.jsx', { query: '?raw' })` map,
  each its own lazy chunk (0.5–3.9 kB gz each, measured), plus `tops/topRuntime.js?raw`.
- Net: first open pays ~15 kB gz instead of 6.3 + 16.9 kB gz today, and the quote limit
  `MAX_QUOTED_LINES` (80) goes away in favour of an in-panel scroll.

Manifest extensions in `node-anatomy-lib.mjs`:
1. `top.*`: set `computes` to `src/project/tops/topRuntime.js` whole file (`sharedWith` = other
   tops). Fixes today's `computes: null` for every picture.
2. `panel` branches: walk the branch body for the JSX element name, resolve it through
   `RawEditor.jsx`'s `ImportDeclaration`s, and record `component: { file }`. Same acorn walk
   style as `extractIfChain` (`:139-157`). Also record the feeds mounted at `:2582`/`:2587`
   (`device.keyboard -> KeyboardFeed.jsx`, `device.midi.out -> MidiOutFeed.jsx`): a small
   hand-kept `EXTRA_PLACES`-style map with a test asserting the symbol exists, the same
   pattern `time` already uses.
3. `renderSourceModule()` next to `renderManifestModule()` (`:274-285`), and `configureServer`
   invalidates both virtual ids.

### 2.7 CHANGE IT: what is safely editable

| Kind | Editable in the frame | Stored in |
|---|---|---|
| every node | all parameters (IN), rename (HEAD) | `values.*`, `label`, via `updateNode` op as the inspector does (`RawEditor.jsx:694-711`) |
| `top.*` | shader (compile check local + remote), script, camera constraints | `__shader`, `__script`, `__constraints` (unchanged) |
| panel/device/agent | parameters only; the window in SEE is itself interactive (typing text, pressing a button) | as today |
| numbers/signal/colour/geometry | **phase 2**: `compute()` script | `__script` (2.8) |
| built-in JS | read-only, always | none |

### 2.8 Per-node script hook (phase 2, specified now)

**Contract** (a module body, like `topScripts.js`):

```js
// runs whenever the graph asks this node for an output
function compute({ input, time, values, memory, builtin }) {
  return { out: builtin('out') * 2 }      // any subset of the node's output port ids
}
```

- `input(id)`: lazy, same as colocated runtimes' `input` (`nodeGraphRuntime.js:188`). **Not an
  eager `inputs` object:** evaluating ports the node never reads would pull them into cycle
  detection and poison loops that are fine today (`:131-150`).
- `time`: `context.now` seconds. `values`: a frozen copy of `node.values`.
- `memory`: a per-node object in `context.frameMemory`, key `${id}:script`.
- `builtin(portId)`: the original computation, so a script can wrap rather than replace.

**Plug point:** `computeNodeOutput`, `nodeGraphRuntime.js:177`, after the doorway check
(`:181-182`) and **before** `NODE_RUNTIMES` (`:186`):

```js
const scripted = context?.scripts?.run(node, portId, context, nextStack, builtinFor)
if (scripted !== NOT_SCRIPTED) return scripted
```

- `context.scripts` is injected through `createNodeGraphContext(document, { scripts })`
  (`:96`). `null` means scripts are off, so the runtime stays pure and importable by tests,
  `nodeReading` probes and card previews, all unchanged.
- The runner (new `src/project/graph/nodeScripts.js`):
  - compiles with a `compileTopScript`-style cache
  - runs **once per pass per node** (cache the returned object in `context.scriptResults`,
    since `evaluateNodeOutput` asks per port)
  - coerces each value to its port type (a non-finite number becomes `undefined`, so consumers
    fall back as they do for a dead wire)
  - on throw or compile error: records it in a `nodeScriptReports` store (the `topReports.js`
    shape), adds the source to a failed set, and returns `builtin(portId)`. The node keeps
    working as built.
- **Gate:** the runner exists only when this window's machine has `scripts === true`
  (`machineLink.js:156`, server `machineIdentity.js:69`). `RawEditor.jsx:872` must then call
  `useMachinePresence` whenever any node carries `__script`, not only on desks with tops.
  The same wiring is needed in `RawViewport` (`:720`) and `RawOutSurface`, otherwise the
  projector computes the built-in while the editor computes the script.
- Card previews (`resolvePreview.js:30`) stay script-off in phase 2 and say so ("card shows the
  built-in") until a follow-up passes the runner in.

### 2.9 How the anatomy facts fold in

| Anatomy piece today | Goes to |
|---|---|
| `readNode().takes` (`nodeReading.js:165-180`) | IN rows' value + origin |
| `readNode().gives` (`:182-187`) | OUT rows' value + source word; gains `feeds` |
| `worksItOut` sentence (`NodeAnatomyPanel.jsx:176-199`) | one line atop MADE OF |
| `putsOnScreen` (`:204-229`) | picks the `draws`/`window` tab; its sentence becomes the tab caption |
| `inside` / container count (`:211-218`, `:319-330`) | HEAD badge "holds N" on containers; the "no inside, a limit of the tool" sentence is **deleted** (the frame *is* the inside) |
| `SourceLines` disclosure + refusals (`:115-160`) | replaced by MADE OF tabs (always open, lazy text) |
| unbuilt banner (`:238-242`) | SEE `unbuilt` kind |

`nodeReading.js` stays the single source of truth and keeps its tests. `NodeAnatomyPanel.jsx`
is deleted once its sentences move. The "never an editor" rule (`:23-25`) is retired
deliberately: the owner asked for a see-through case you can change. The honest form of that
rule survives as **built-in code is never editable, and the frame says so on the tab**.

---

## 3. File plan

**New** (all under `src/raw/components/inside/`, plus two in `project/graph`):

| File | What |
|---|---|
| `InsideView.jsx` | the frame: HEAD + grid/columns + phone segments; owns sampling loop + its frameMemory |
| `InsideIn.jsx` | IN list (PropertyField + readNode takes + wired jumps + top camera sub-group) |
| `InsideOut.jsx` | OUT list (gives + feeds + mini scopes) |
| `InsideSee.jsx` | preview switch by `insidePreviewKind` |
| `InsideStage3D.jsx` | lazy R3F Canvas + OrbitControls around exported `PreviewContent` |
| `InsideScope.jsx` | 2D-canvas ring-buffer scope: number/signal/colour/vec3 modes |
| `InsideMadeOf.jsx` | tabs; lazy `virtual:node-source` + component `?raw` loader; shader and script editors moved from TopInsidePanel |
| `insidePreviewKind.js` | pure kind picker (+ test) |
| `inside.css` | one stylesheet; replaces `topInside.css` |
| `src/project/graph/insideReading.js` | merges `deriveNodeInspectorSections` fields with `readNode` rows by port id (pure, tested) |
| `src/project/graph/nodeScripts.js` | phase 2 runner + reports store |

**Changed:**

| File | Change |
|---|---|
| `RawEditor.jsx` | mount `InsideView` when `currentScopeId` (`:2350-2357` replaced); delete anatomy frame state/effects/window (`:211`, `:1034-1045`, `:1560-1573`, `:2664-2679`); `onExplainScope` removed (`:2328`); `scopeEmptyHint` code-node branch removed (`:1020-1025`); scope marker kept only for containers, its `?` removed (`:2530-2540`); `renderViewNodeContent` passed to InsideView; `withMachines` extracted; `handleShowFeedingCard` becomes `goToNode` |
| `useNodeGraphScope.js` | add `goToNode(nodeId, nodes)` (ancestor chain) |
| `nodeReading.js` | add `feeds` to gives; add configInput rows (tops' params have no port) |
| `PropertyInspector.jsx` | export `PropertyField` (no behaviour change) |
| `cardPreview/previewRenderer.jsx` | export `PreviewContent` |
| `scripts/node-anatomy-lib.mjs` | top runtime entries; panel component resolution; feed places; `renderSourceModule` |
| `vite.config.js` | plugin serves `virtual:node-source` too; invalidates both |
| `utils/nodeSourceSlices.js` | shrink to component-file loader |
| `RawGraphSurface.jsx` | drop `onExplainScope` prop (`:156`, `:1243-1245`) |
| `nodeInspectorSections.js` | **delete `CODE_SECTION` and both uses** (`:60-84`, `:118`, `:174-182`); `node.null` keeps its real `body` field |
| `windowLayout.js` | delete `RAW_ANATOMY_*`, `getAnatomyDefaultFrame` (`:270-340`) |
| phase 2: `nodeGraphRuntime.js` | `scripts` option in context + plug point (`:96`, `:177-186`) |

**Deleted:** `topInside/TopInsidePanel.jsx`, `topInside/topInside.css`,
`NodeAnatomyPanel.jsx` (+ its test, rewritten as InsideView tests),
`topInside/TopInsidePanel.test.jsx` (cases move).

`values.__code` in existing documents: left in place (harmless data), no migration. The
field simply stops being shown. Say so in the session note.

---

## 4. Test plan

**Unit (vitest, `npm run test:raw`):**
- `insidePreviewKind.test.js`: every `NODE_TYPES` id maps to exactly one kind; tops map to
  `picture`, webcam to `texture`/`window`, cube to `object3d`, lfo to `number`, grid to `none`,
  unbuilt to `unbuilt`.
- `insideReading.test.js`: for every implemented type, each inspector field has a row, wired
  rows are disabled and carry `fromNode`, doors marked, the operation row is first.
- `nodeReading.test.js`: `feeds` lists every outgoing edge with the target port label; a
  cycle still reads undefined.
- `scripts/nodeAnatomy.test.js`: every `top.*` has `computes`; every panel-2d implemented type
  has a `component.file` that exists; every source slice equals the file lines by range.
- `nodeInspectorSections.test.js`: no section with `__code` for any type (flip the two tests
  at `:97-117`, `:189-195`).
- `useNodeGraphScope.test.js`: `goToNode` builds the ancestor stack for depth 0, 1, 3.
- `InsideView.test.jsx` (jsdom): renders HEAD/IN/OUT/MADE OF for a Cube, an LFO, a Webcam, a
  Level, a Geo; scrubbing a Cube size field dispatches `updateNode` with the value; a feeds
  link calls `goToNode`; shader Apply with bad GLSL does not patch.
- Phase 2 `nodeScripts.test.js`: off when `scripts:null`; runs once per pass for 4 ports;
  throw falls back to builtin and reports; `input` is lazy (a loop through an unread port is
  not poisoned); non-finite output reads undefined.
- Bundle: a build assertion that the main entry chunk does not contain `computeNodeOutput`
  source text, and that `virtual:node-source` is a separate chunk under 20 kB gz.

**Walk (headless Playwright, real DPR 2, 1440x900 and 390x844, the local tier as the owner
uses it):**
1. Place Cube. Enter. First screen shows the turning cube, Size/Colour scrub fields, the
   Geometry output, and computes/draws tabs. Drag Size: the cube grows in SEE (pixel diff).
2. LFO → Cube Y. Enter LFO: four traces move (pixel diff over 1 s); feeds shows "Cube ·
   Position ›"; click it: back outside, Cube selected.
3. Camera In (fake device): picture live, Mirror toggle visible and flips the picture, shader
   edit applies, script blocked message when the machine lacks `DI_DESK_SCRIPTS`.
4. Webcam panel node: enter, the camera window is in SEE, not a blank grid.
5. Geo with two children: sub-graph centre, rails open/close, Geo position scrub moves SEE
   shape.
6. Phone: sticky SEE while scrolling IN; segments reachable with one thumb; back works via the
   hardware back (existing `popstate`).
7. Every URL visited returns 200; no console errors.

---

## 5. One focused pass vs later

**Pass 1 (buildable together, one PR):** frame + IN/OUT/SEE (all kinds except orbit) +
MADE OF read-only with the new virtual module + top shader/script/camera moved in + feeds +
`goToNode` + deletions (Code section, anatomy window, TopInsidePanel). SEE `object3d` in pass
1 uses a **static 3/4 view at frame size** through the dedicated canvas; orbit controls are a
10-line follow-up once the canvas is proven on the 2012-laptop class.

**Wait:**
- **Phase 2, script hook for number/signal/colour/geometry.** It changes the pure runtime that
  the room, `/out`, previews and the reading all share, and it widens where desk code runs.
  Own PR, own review, walked on asuz + aylmo with `DI_DESK_SCRIPTS` on one and off on the
  other.
- Scripts in card previews.
- Worker trial run of a new script (a timeout check before saving).
- "Enter ›" chain walking from feeds rows.
- `geom.model`/`media.video` previews (need `assetMap` in SEE; `previewTypes.js:112-125`
  reasons still hold).
- An editable built-in, i.e. forking a built-in node's code into a script as a starting
  point: nice, but it is a product decision.

---

## 6. Risks

1. **A script can freeze every window that runs the desk.** Synchronous JS in
   `computeNodeOutput` has no timeout. An infinite loop in one Number node hangs the editor
   and the projector's `/out`, 60 times a second. `DI_DESK_SCRIPTS` limits *where*, not *what*.
   Code saved by anyone with edit rights runs on every opted-in machine that opens the space.
   Mitigations: phase 2 only, gate everywhere the context is built, failed-set fallback, a
   Worker trial run before Apply, and the machine name shown on the script tab.
2. **Runtime purity and cache semantics.** `evaluateNodeOutput` relies on per-pass
   `outputCache`, `cyclePoison` and injected `now`. A hook that evaluates inputs eagerly,
   runs per port, or keeps state outside `frameMemory` gives the room, the sheet and the card
   different answers (the Constructor A/B bug documented at `nodeGraphRuntime.js:131-145`). The
   hook must be lazy, once-per-pass and memory-scoped. `nodeReading`'s substitution probes must
   run with scripts off, or "its own window" detection breaks.
3. **Removing the empty-grid inside changes muscle memory and one real ability.** A spatial
   code node *can* hold children today ("What you place here becomes part of it",
   `RawEditor.jsx:1015-1024`). If the frame replaces the grid for spatial make nodes, placing
   children inside a Cube loses its surface. Decide: either keep a "children" tab showing the
   sub-graph when a spatial node has or accepts children, or confirm with the owner that only
   containers hold nodes. **Needs his yes before building.**
4. **Two live copies / GPU cost.** SEE renders a panel's window (a second `<video>` consumer,
   a second keeper component), a second WebGL context for 3D, and full-rate top video
   (`setInspectedTop`). Panel components with side effects (mic capture, MIDI access, DMX
   sending, keeper network calls) must never mount twice. The frame must render *the* window
   (the floating one is already unmounted inside, `windowLayout.js:65`), and a test must
   assert only one instance of each exists. Scope sampling at 60 Hz while a clock node exists
   adds a second evaluation pass per frame; cap to the node's own outputs.
5. **Source text and stale facts.** Slices come from build-time line ranges. In dev, a
   HMR-patched `RawViewport.jsx` without plugin invalidation shows wrong lines (the
   `configureServer` watcher must invalidate both virtual ids). The panel-component resolution
   is new parsing (JSX element name → import) and can silently point at a wrapper instead of
   the real component; the file-exists test catches missing, not wrong. Also: quoting
   `DmxOutPanelWindow.jsx` or the agent panels ships their text to any viewer who opens Made
   of. Check none of the quoted files embed hosts, tokens or rig IPs before exposing them on a
   public space.
