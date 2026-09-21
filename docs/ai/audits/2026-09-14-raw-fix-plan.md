## 2026-09-14 — Raw fix wave: the plan every workstream works from

Audits (read the one for your workstream first, cite rows):
`docs/ai/audits/2026-09-14-raw-nodes.md` (95 node types, truth table),
`docs/ai/audits/2026-09-14-raw-design.md` (design + accessibility, 20 ranked fixes),
`docs/ai/audits/2026-09-14-raw-inside.md` (unified inside view design).

### The owner's words (theatre director, TouchDesigner user)

- "It feels so unfinished … do the deep audit and fix all gaps … make it minimal,
  don't waste space, a smart design that makes everything simple for everyone,
  maximum pure and accessible, where you can change and see everything."
- "Like pure materials with a Game Boy when you can see all details; if needed go
  inside and change something, or from outside change the parameters."
- "When I'm inside the Cube it's not the same as in Camera In and the nodes."
- "We need to flex — if someone in the work process wants to modify … nodes inside
  can post to the Cube and connect, so create a custom cube in process."
- "Create examples with all the nodes, showing usage per individual — so we
  understand it all works, and in future AI will easily create something."

### Agreed shape

1. **One inside for every node** — a workshop, not a sheet. Middle: the node's own
   canvas where you place nodes that wire INTO this node's inputs (custom Cube = Cube
   + a Noise inside wired to its Size). Around it: SEE (live view by output type),
   IN rail (settings + inputs: scrub fields, live value, "from X", a socket inner
   nodes can wire to), OUT rail (live values, where each output goes, click to go),
   MADE OF drawer (real code read-only; shader + script editable). Replaces
   TopInsidePanel, NodeAnatomyPanel window, and the "Code — stored, not run" section.
   Phone 390: one column, SEE sticky.
2. **Cards show themselves** — TouchDesigner viewers on every card: number value /
   sparkline, colour swatch, signal scope, text, device status, live 3D preview
   using the real clock + liveOutputs; unwired inputs fold to "+N"; no family word
   in the header; one tab stop, a real accessible name.
3. **Inspector truth** — wired field shows the incoming value "from <node>";
   outputs with live values; human labels + one-line description per type (no
   `geom.cube` in the UI); min/max/step and menus where the audit lists them;
   selection is per viewer, never saved into the shared document.
4. **Graph truth** — picture operators and the rest of the graph pass pictures
   both ways (Webcam/Video → Blur; Blend → Monitor / Plane texture); live feeds
   (Webcam, Mic, MIDI, Keyboard, Button, DMX, keeper) run regardless of window /
   fullscreen / scope; number→boolean and signal→boolean wires allowed with a
   threshold; `any` inputs coerce by what is wired; ignored wired inputs read
   (Keyboard key, Kiosk showChrome, Video volume/muted); /out and public surfaces
   get live data.
5. **Design + access** — the design audit's 20 fixes: phone topbar, contrast ≥4.5:1,
   text ≥12px, light window bars, ⋯ menu (Escape, "Editor" not "Studio"), "where am
   I" said once, canvas chrome never over overlays, palette opening, windows never
   auto-pile; raw.css carries no colour literals (styles/spine.test.js — tokens in
   base.css).
6. **Examples for every node** — one small working patch per palette node type,
   data in `src/project/graph/examples/nodes/`, each wired to show its USE; a test
   that builds every example and checks its outputs evaluate; a generated AI
   reference `docs/nodes/README.md` (+ one file per family) from registry +
   examples; a one-command way to put all examples into a local space; fix the
   all-nodes example's dropped and duplicate wires.
7. **Scripts in every node, safely** — `compute({ input, time, values, memory })`
   per node, executed in a Web Worker so a loop can never freeze the editor or a
   projector; results cached per frame and read by the graph; timeout → the node
   shows the error and falls back to its built-in output; gated per machine like
   DI_DESK_SCRIPTS; picture operators' existing frame()/open() scripts keep working.

### Rules for every workstream

- Your own git worktree and branch, created from `origin/feat/raw-picture-operators`:
  `git -C /home/dob/work/di.iiii-asuz worktree add -b fix/raw-<name> /home/dob/work/di.iiii-w-<name> origin/feat/raw-picture-operators`
  then `npm ci` and `npm --prefix serverXR ci` in it. Work ONLY there.
- Commit on your branch (end messages with the attribution lines already used on
  this branch) and `git push -u origin fix/raw-<name>`. Do not open a PR, do not
  touch other branches, never `git add -A`, never stash.
- Stay inside your file ownership below; if you must touch another workstream's
  file, keep the change minimal and say so in your report.
- Every bug fixed gets a regression test and a row in docs/ai/known-fixes.md;
  every visible change gets its line in src/wiki/wikiContent.js (one article per
  workstream, append).
- Validate: your nearest vitest files, `npm run test:raw`, eslint 0 errors on
  changed files. A SpaceHub.test.jsx timeout is a known flake.
- Look at what you changed: Playwright headless Chromium, DPR 2, 1440×900 and
  390×844, against a local build of YOUR worktree: `npm run build`, then serve
  `dist/` through a throwaway `node serverXR/src/index.js` with
  `CLIENT_DIR=$PWD/dist DATA_ROOT=$(mktemp -d) PORT=<free port> DI_LOCAL=1`
  (never the owner's install at local.thedi.studio, never port 4000/443), and
  kill it when done. READ every screenshot. One browser at a time (the machine is
  a laptop with a GPU that has crashed under load today).

### File ownership (to keep merges small)

| # | Owns |
|---|---|
| 1 inside | new `src/raw/components/inside/*`, `src/project/graph/insideReading.js`, `useNodeGraphScope.js`, `nodeReading.js`, `scripts/node-anatomy-lib.mjs`, vite node-source module; deletes `topInside/*`, `NodeAnatomyPanel.jsx`; the inside mount in RawEditor.jsx |
| 2 cards | `RawGraphSurface.jsx` (card body/header), `cardGeometry.js`, `cardPreview/*`, new `src/raw/components/cardViewers/*` |
| 3 inspector | `PropertyInspector.jsx`, `nodeInspectorSections.js`, registry METADATA only (`summary`, min/max/step, options), selection-per-viewer in RawEditor.jsx |
| 4 graph | `nodeGraphRuntime.js`, `src/project/nodes/*`, `src/project/tops/topRuntime.js`, `useTopNetwork.js`, `topEngine.js` (exports only), feeds + `windowLayout.js`, `RawOutSurface.jsx`, `PublicGraphSurface.jsx`, registry port compatibility |
| 5 design | `src/raw/styles/*.css`, `src/styles/base.css` tokens, `DesktopWindow.jsx`, `NodePalette.jsx`, RawEditor.jsx topbar + ⋯ menu |
| 6 examples | new `src/project/graph/examples/nodes/*`, `allNodesExample.js`, `docs/nodes/*`, a `scripts/` generator |
| 7 scripts | new `src/project/graph/nodeScripts*.js` (+ worker), the hook in `nodeGraphRuntime.js` (coordinate: one insertion point), `topScripts.js` |
