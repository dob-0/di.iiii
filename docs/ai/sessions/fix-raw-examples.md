## 2026-09-14 — one worked example per node type, generated docs, a fixed all-nodes preset

- Built `src/project/graph/examples/nodes/` — one small (2-6 node), honest, tested
  example per palette node type (95 types, 8 family files + shared helpers.js). Each
  entry carries a plain-language `story`, a `build()` graph, and `expect` assertions
  checked without a browser (`nodeGraphRuntime.js`'s `evaluateNodeOutput` for pure/
  wired outputs, at more than one clock time for anything time-driven; liveOutputs
  injection for anything that only speaks through a real device/browser feed —
  Webcam, Mic, MIDI, DMX, the agent nodes, Analyze).
- `nodeExamples.test.js`: one example per palette type (fails if a new type ships
  without one), every wire lands on a real, compatible, single-owner port, no card
  overlaps another in its own scope, and every `expect` holds. 501 tests, all green.
- Generated AI reference: `scripts/generate-node-reference.mjs` → `docs/nodes/README.md`
  + one file per family, from the registry + the examples. `npm run docs:nodes`
  regenerates it; `npm run docs:nodes:check` (new) fails if it has drifted — same shape
  as `docs:ai:sync`/`docs:ai:check`.
- `scripts/push-node-examples.mjs --base <url> --space <id>` puts the examples into a
  real space, one project per family, via the same APIs the app uses
  (`POST /api/spaces/:space/projects`, `POST /api/projects/:project/ops`). Not run from
  this session — documented in `docs/nodes/README.md` for the lead to run.
- Fixed the all-nodes example (`allNodesExample.js`, item 12 of the 2026-09-14 audit):
  6 wires named a key ('light', 'desk') the file never made and were silently dropped;
  Hold.sample and Text.content each carried two wires into the same input; Cube.size
  was wired to a position vector with x/z both 0 (a 0.001-thin sliver); and — found
  while fixing the above — `port.in`/`port.out` were declared BEFORE the Geo they were
  supposed to live inside, so `insideKey: 'geo'` silently fell back to root scope, and
  six pairs of cards (not just the two the audit named) shared the exact same
  (col, row). `wire()` now throws on an unresolved key instead of returning null.
  `allNodesExample.test.js` gained "no duplicate input wires", "no two cards at the
  exact same spot", and a real card-geometry check on the two named overlaps.
- Known-fixes row added for the all-nodes example bugs; one wiki article appended
  ("A worked example for every node", For developers) pointing at the per-node
  examples and the generated reference.
- Validated: `npx vitest run src/project/graph` (698 tests), `npm run test:raw` (147
  files / 2102 tests), `npm run docs:nodes:check`, `npm run docs:wiki:check`, eslint 0
  errors on every changed file.
- Real defects the individual node examples exposed (beyond item 12, gold for the
  other workstreams — see the PR/branch report for the full list with file:line):
  `math.mix`'s `a`/`b` ports are `any`-typed free text in the inspector and hard-switch
  at t=0.5 instead of lerping when a person types a value directly (wired ports lerp
  correctly, which the example demonstrates honestly); `value.random` never varies
  over time despite the name (confirmed, not a new finding, but now has a test proving
  the SAME Variant always answers the SAME number); Picture Out's `out` genuinely
  never carries a value in the graph (architectural, not a device gap — every
  picture-family example documents this instead of asserting a fake pass).
