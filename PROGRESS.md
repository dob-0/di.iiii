# di.iiii Progress Log

Developer work journal. One entry per session, newest at top.
Read this before starting work. Update it before stopping.

---

# feat/raw-geo-connect — geos connect, and the demo stops trespassing

Owner, 2026-08-20: "its still conflict with backdrop display and geo, i can't
add multigeos and connect and make multiply geometries … create geometry
inside geometry". Reproduced live: placing several Geos, a stray double-click
hit a door (silent scope change) and another hit "Make me a scene" — which
injected the six-node demo INTO the fresh Geo, stacking a demo World window
over the backdrop. That stack was the "conflict". And Geos had no output, so
nothing could connect them.

## What changed

- `geom.geo` gains a **Geometry output**: everything spatial standing in it,
  as one group in the Geo's own transform (nodeGraphRuntime case). A Geo
  inside a Geo answers recursively; a Light/Camera standing there is not a
  shape and is skipped; an EMPTY Geo answers undefined (the Merge rule —
  an empty place is not an invisible shape). Listed in PASS_THROUGH_PORTS
  with a containment-based proving fixture.
- "Make me a scene" only offers itself on a truly blank desk at the top
  level (`currentScopeId === null && nodes.length === 0`); the ⋯ menu still
  offers it anywhere, deliberately.
- Runtime tests: empty geo, collected group + transform, recursive nesting,
  Geo→Merge composition. RawEditor tests for the demo scoping. Wiki + manual.

## Verify

Seeded doc, read at DPR 2: Geo A (cube + inner Geo with sphere) and Geo B
(plane) wired through Merge into a Constructor's door — the Constructor
visibly wears the union of both scenes; Geometry sockets visible on the Geo
cards.

## Still open (the visual conflict)

Cards still land over their own 3D objects and the 3D labels float detached —
the layering fight is the next cut, tracked in the desk audit memory.

# feat/raw-monitor — the desk's viewer

Phase 1 of the show spine, part three: the View operator the owner asked for
("we need to view operator"). TouchDesigner's answer is the viewer on every
tile; the browser's honest version is one window you place where you want it.

## What changed

- `stream.monitor` implemented — it existed since 2026-07-30 as a gated shell
  named "Program Monitor" whose window fell through to the text-panel
  placeholder. Ungated, relabelled 'Monitor' (one word, one meaning), and its
  position/width/height ports removed (dead-port rule: no runtime carried
  them; a window has its own frame).
- `MonitorPanelWindow.jsx`: wire any texture into Source and watch it live;
  no wire → a quiet, honest empty state ("Wire a texture into Source"), not
  the generic placeholder.
- `LiveTextureView` extracted from ImagePanelWindow into its own module,
  shared by Image and Monitor (a DOM video element cannot mount twice, so
  frames are copied to a canvas — same code, one home).
- allNodesExample: monitor wired from the webcam's Frame. RawEditor dispatch
  case + empty-state test. Wiki bullet + USER_MANUAL section.

## Verify

Seeded webcam→monitor doc, fake media stream: the Monitor window shows the
live feed (unmirrored — program out), the webcam panel its selfie view; with
nothing wired the Monitor says so. Screenshot read at DPR 2.

# fix/ci-playwright-bound2 — the bound was tighter than a cold install, and the retry tripped over its own corpse

## What changed

Two lessons from #184's first version, both learned on live runs:

1. **150s per attempt was tighter than an honest install.** `--with-deps`
   apt-installs on the fresh runner and a cold cache downloads ~160MB — the
   bound failed the very deploy it was protecting (run 32305518130). Now 300s
   per attempt, `timeout-minutes: 11` on the step.
2. **Killing npx orphans the apt-get underneath it**, which keeps holding
   `/var/lib/dpkg/lock-frontend`, so a naive retry dies instantly on the lock
   (run 32306276793: "held by process 2863 (apt-get)"). The retry now buries
   the orphan first: `pkill` apt/dpkg, wait for the lock to clear,
   `dpkg --configure -a`, then reinstall.

A true stall still self-heals once or goes red in eleven minutes; slow honest
installs finish.

# feat/raw-out — the projector cable

Phase 1 of the show spine, part two: /out — a URL that renders just-the-room,
read-only, zero chrome, for a projector or any second display. The audit's
finding was blunt: no route rendered the room alone; the fullscreen Room was
unaddressable component state behind an editor, and a show could not run
clean.

## What changed

- Routing (`rawRouting.js`): `RAW_PAGE_OUT` + `buildRawOutPath`. Shapes:
  `/{space}/raw/projects/{id}/out` (project — rides the op-log sync, live
  across machines, works signed-out on public spaces) and `/{space}/raw/out`
  (the space's local canvas — lives in that browser). `?scope=<nodeId>` aims
  it at a container's room; parsed into `scopeId`.
- `RawOutSurface.jsx`: RawViewport with NO handlers passed — read-only by
  absence, not by guard. No graph, no topbar, no cursors, no selection.
  Project documents ride `useProjectDocumentSync`; a local canvas follows the
  desk live across windows via storage events (the desk already writes
  localStorage on every change — the event is the free channel). Screen Wake
  Lock requested and re-acquired on visibility. The ●-marked Camera of the
  scope frames the shot for free (RawViewport honours it).
- Known limits, documented in the manual: capture feeds (webcam/mic/MIDI)
  live in the window that owns them; Time-driven motion runs per-window
  clocks. Both named in USER_MANUAL's "Putting it on a projector".

## Verify

Two windows, one browser: desk on /open/raw places a cube; /open/raw/out
shows the cube alone (0 cards, 0 topbar); desk adds a sphere → out follows
live; a click in /out selects nothing. Screenshots read at DPR 2.

## Note to the next session

An `output.display` node (the projector as a patchable card: scope + camera
+ enable) and a read-only output key for private spaces are the designed
next steps — see the TD-operators audit in auto-memory.

# fix/ci-playwright-stall — the hang becomes a hiccup

The "Install Playwright Chromium" step stalls forever some days (the known
failure in reference_dii_ci_playwright_hang / CURRENT.md's deploy notes).
2026-08-20 alone it hung four runs past 12 minutes; each needed a manual
cancel + rerun.

## What changed

One change, one file: the step gets `timeout-minutes: 6` and two bounded
attempts (`timeout 150 npx playwright install …` with one retry). A stall now
self-heals in ~2.5 minutes or goes honestly red in six — no more zombie
deploys. browser-checks.yml is the single home of the step (reused by PR CI
and the deploy), so this covers both.

# feat/raw-camera — the authored eye

Phase 1 of the show spine (owner: "go", 2026-08-20, after the TD operator
audit): a Camera node, so where the audience looks is authored, not wherever
orbit was left.

## What changed

- `world.camera` in the registry: Position / Look At / FOV inputs (all
  wireable — a Time→Sin→Position wire is a camera move), spatial-3d, family
  "the room". Defaults are byte-identical to the room's built-in view.
- Activation is EXPLICIT-ONLY via the card's ● toggle
  (`pickAuthoredCameraNode` in RawViewport) — deliberately unlike
  Light/Background/Grid's first-created fallback: the palette drops nodes at
  the click point, and auto-activation cut the room to an accidental
  floor-level close-up the moment the card landed (seen in browser before the
  fix). Placing a Camera never steals the view.
- Marked: the room is seen through it (useFrame drives position/fov/lookAt
  every frame), OrbitControls unmounts (the two would fight over the eye),
  and its body disappears. Unmarked: a small housing marker with a lens cone
  aimed at Look At; unmarking releases the view in place, orbit remounts.
- A camera counts as no room content in `scopeHasRoomContent` — the eye is
  not something to look at; a camera alone must not summon an empty room.
- allNodesExample: camera standing inside the example Geo. Wiki bullet +
  USER_MANUAL section. Registry tests (spatial, defaults byte-identical),
  viewport tests (never steals / owns view when marked / scope-local).

## Verify

Place cube + camera → view unchanged, housing visible. Click ● → the room is
the camera's shot, housing gone; type Position in the inspector → view moves
live. Unmark → orbit again. Screenshots read at DPR 2.

# feat/raw-clear-desk — the room earns its place

Owner, after the desk audit (2026-08-20): "yes its clear till you add geo".
The always-on backdrop posed a clear desk as an empty stage whose floor
rejected every click; prod's flat-paper desk was the honest look.

## What changed

- `src/raw/utils/roomContent.js` — `scopeHasRoomContent(nodes, scopeId)`:
  something spatial stands at this level. An unparented Light does not count
  (it draws nothing — it is the scope's light rig); a Scene card does not
  count (the backdrop deliberately does not see through it, so it would pose
  an empty room as the scene).
- `RawEditor.jsx` — the world overlay mounts, and the shell wears
  `is-world-overlay`, only when the current scope's room has content. Without
  the class the graph surface's own 36px grid returns (the CSS was already
  there, permanently shadowed until now).
- Tests: `roomContent.test.js` (the predicate, per scope) and a
  "room backdrop gating" describe in `RawEditor.test.jsx`; the old
  "room in EVERY scope" test rewritten to the new contract (spatial doc →
  room at root and inside; pure-code doc → flat everywhere).
- Wiki raw-lane bullet + USER_MANUAL: replaced the retired "three surfaces"
  section with the desk-and-room model.

## Verify

Fresh /open/raw → flat grid, no canvas. Add a Geo → room appears behind the
cards. Enter the empty Geo → flat again until the first child. Screenshots
read at DPR 2.

## 2026-08-19 — the Geo: a clear place to collect a scene

The owner, after the desk trilogy: "still mess — when add geo its empty geo,
nothing in it, not even grid; it's a clear geo you can enter and in it collect
what you need — object, light… and so on." Two facts made that true: no
container was simply a PLACE (the desk draws a shell box, the constructor only
wears primitive descriptors, a world hides its children), and a Light could
not be collected at all — `world.light` was a settings card with no body.

- **`geom.geo`, label Geo** — TouchDesigner's Geometry COMP by name, the
  plainest container there is: spatial, a container, renders its children
  through the childMap like any spatial parent, adds NOTHING of its own. Empty
  it shows a faint cyan floor tile (2×2 grid + a near-invisible pickable
  plate), because an empty place reading as void was the exact report.
- **`world.light` is standable**: render spatial-3d, new `color`/`intensity`/
  `position` inputs; placed INSIDE any container it renders a real
  `pointLight` plus a small emissive marker. Unparented at root it draws
  nothing — every existing document keeps exactly the look it had, and the
  ambient/directional per-scope settings job is untouched. Guarded both ways
  in RawViewport.test.
- Anatomy manifest resynced (its gate caught the new cases, again);
  PLACEABLE_CONTAINER_LABELS and all container hints pick Geo up automatically.

### Verified

Driven end-to-end at 1440×900 and screenshot-read: place Geo (footprint tile
visible on the empty desk) → enter (`inside Geo ?`, grid there) → collect a
Cube and a Light by double-click (both appear behind the cards as they land,
the Light as a glowing orb) → walk out: the Geo card reads `2 ›` and the cube
and light stand IN the geo in the room. No console errors.

### Left deliberately

- A Light inside a Geo lights the scene it renders in (one three.js tree), but
  per-scope ambient settings still come from the CURRENT scope's active Light
  only — TD's render-scoping (Light Masks) is its own feature.
- The container zoo (Desk/Stage/Constructor) is untouched; the Geo is the
  recommended default and the wiki says so. Retiring or folding the others is
  an owner decision.

## 2026-08-19 — the cut list: a minimal desk

Third of the three audit answers ("you're shitting the UI with useless infos —
keep UI clean and minimalistic"). Every cut is one the audit counted; the
result was measured the same way it measured the problem: **first visit
71 → 18 visible words** (desktop; 15 on a phone; TouchDesigner shows ~50),
**one placed cube 95 → 27**, with a screenshot read at each state.

- **The starter seed is gone.** First visit is the clean empty room — one
  sentence, one offer. The demo lives behind "Make me a scene", where choosing
  it is the person's act. Its four-node constellation, two open windows and
  phone layout collisions go with it (`starterWorkspace.js` + its test
  deleted; the zen default no longer needs the seeded-flag special case).
- **The dead CODE box is gone from every fresh node** — the audit's one
  systemic clutter generator. `Code — stored, not run` appears exactly where
  it is true: node.null always, anything else only when `values.__code`
  actually carries something. Contract test rewritten truthfully.
- **Window title bars spell three actions with glyphs** (⌖ – ×), words kept in
  the accessible names; Enter › keeps its word — it is the one action a
  first-timer must find.
- **The ◫ "world as background" button is gone** — the permanent backdrop made
  it a synonym for Close. ● live-marking stays (it has a real job with several
  rooms).
- **The scope marker's four-word explainer is a ?** (44px, full sentence in
  title/aria); the empty-canvas "Show me what it's made of" now appears only
  inside CODE-made nodes, where the empty canvas is the question.
- **Topbar**: Size select moved into ⋯ (configuration, not work); Chat hidden
  on a solo local canvas until presence shows anyone; "Blank White Workspace"
  — neither blank, nor white, nor (vocabulary) a workspace — is now
  "Local canvas".
- **The empty-state offer moved to the lower band** — the audit watched a
  double-click land on the centred button and inject a demo into somebody's
  node, because the hint says "double-click" and the centre is where people
  do it.
- **Palette: exact label match outranks every substring match** — typing
  "Out" + Enter used to open an Outliner panel, detonating the documented
  door flow on its own palette. Guard watched red without the sort.
- **New cards step aside until clear** — a Merge used to bury a Cube's whole
  header, and a card over another's door left that door silently unclickable.
- **Help lost the repo path line** (`docs/raw/USER_MANUAL.md` shown to
  visitors); the wordmark no longer renders on phones (it sat on the cards);
  the backdrop no longer honours a topbar zen doesn't show (dead band, seen).
- Wiki updated where it described the seeded desk as fact.

### Verified

First visit, one-cube, and phone states driven and screenshot-read after every
cut; the one-cube screen now shows the cube standing in the room exactly where
the double-click landed, its card beneath it, an inspector with no dead box.
No console errors anywhere.

## 2026-08-19 — the room behind the graph

The owner's verdict on the constructor work: "IT JUST INFO. I NEED FULL USABLE
DESK WHERE I CAN CREATE FULL SCENES." A four-agent UX audit (driving the real
UI as a first-timer) plus a TouchDesigner COMP-model deep-dive found why, and
this change is the first of three answers.

**The diagnosis, measured**: geometry-in-geometry already WORKED in the
renderer — a sphere placed inside a cube renders and travels with it — but the
UI (a) gave no 3D view inside any non-World scope, so every build was blind,
(b) actively taught the wrong belief ("made of code — there is nothing inside
it to see"), and (c) demanded Merge-and-door plumbing before a Constructor
showed anything: sixteen blind actions for a two-part shape. The owner never
found the working feature because the interface denied having it.

**This change** (TouchDesigner's backdrop model — its own answer to "watch the
result while editing the graph", the network floating over the output):

- The current scope's room renders BEHIND the graph, always, in every scope —
  cards float on top, and placing something shows it behind your cards the
  moment it lands. The old opt-in overlay was also broken (it painted OVER the
  graph — a later positioned sibling — and its canvas ate every pointer, so
  cards went unreachable the moment it was on); the backdrop mounts as the
  shell's FIRST child and refuses all pointer events, killing both failure
  modes structurally. `isWorldOverlay` state retired.
- Fullscreen is scope-generic and SURVIVES walking through doors: each door
  swaps which room fills the screen. The topbar button is now "Room"/"← Graph"
  and works in every scope (the old one toggled the root World window's frame —
  a silent no-op anywhere else, measured by the audit). Fullscreen carries its
  own on-surface exit (`.raw-room-exit`), because zen has no topbar and the
  audit measured the old ⤢ as a trap; the zen dead-strip (`top: workspaceTop`
  with no topbar) is gone too.
- The empty-scope sentence for a code-made node no longer teaches the wrong
  belief: a spatial node says "What you place here becomes part of it"; only a
  non-spatial code node says it has no room.
- **The Constructor wears its spatial children automatically when it has no
  doors** — the TD flag model: everything inside contributes, wires carry
  data. A door still means "exactly this, nothing else" and suppresses the
  automatic path. Wiki + manual rewritten around place-not-plumb.

### Verified

Seen at 1440×900: the root room (snowman + violet placeholder) as the canvas
itself with all cards hit-testing reachable; inside the Snowman, the workshop
room behind the wires with a just-placed cube appearing the instant the palette
closed. Phone 390×664 looked at too: cards behind the seeded World window there
— PRE-EXISTING (window-over-cards, unchanged by this diff) and on the Phase C
cut list, where the backdrop makes that window redundant anyway.

### The other two answers, still ahead (audit-ranked)

- **Touch**: click an object in the room to select it (today it never selects),
  drag moves it with the grab offset (today it teleports AND orbits), Shift-drag
  lifts, Ctrl+D duplicates, gizmo for rotate/scale.
- **The cut list**: kill the starter seed (empty canvas first visit), CODE box
  only when code exists, title-bar text buttons → icons, palette exact-match
  first ("Out" summons an Outliner today), collision-free card placement,
  explainers into ⋯. Full inventory in the audit (audit-shots/ + four reports
  in the workflow journal wf_9b0100a1-048).

## 2026-08-19 — touch works in the room

Second of the three audit answers (first: the room behind the graph, PR #174).
Every fix below was REPRODUCED by hand before fixing and RE-MEASURED after —
the numbers are from driving the real UI.

- **Drag moved objects by teleport while orbiting the camera under them.**
  Measured: a 160px drag threw a sphere from [0,1.2,0] to [13.8,1.2,-9.9]. Two
  causes: the raw ground-plane hit was written straight into position (an
  elevated object's grab ray meets y=0 far behind it), and drei's
  OrbitControls listens on the DOM canvas, which R3F stopPropagation never
  reaches. Now: the grab offset is measured on a plane at the OBJECT's height
  (the first fix, on the floor plane, still gave a lever arm — 180px moved it
  4.2 units; at its own height, 2.1, hand-matched) and the controls are
  disabled for the drag's duration via R3F's makeDefault controls state.
- **Click on empty floor never deselected** — the invisible 400×400 drag plane
  catches the ray, so the Canvas-level onPointerMissed (which does clear) never
  fired. The plane now clears selection itself, guarded by R3F's event.delta so
  the click that ends a drag cannot clear what it just dragged.
- **Shift-drag lifts.** Ray intersected with a vertical camera-facing plane
  through the object; anchored to the drag-START position, because a lift that
  began with Shift already held baked a sideways step into its anchor
  (measured: z drifted −1.5 during a pure lift; now [0,1.2,0]→[0,2.27,0]).
- **Ctrl/Cmd+D duplicates** the selected node — the audit found no duplication
  path of any kind. Node alone, not its subtree (a deep clone with
  re-identified interior wiring is its own change), stepped +0.6/+0.6 in the
  room and +48px on the canvas so the copy never lands exactly on the original.
- The fullscreen room's `‹ graph` exit moved bottom-left — the first render
  put it exactly under the scope marker's own ‹ (seen).

### Verified

Driven end-to-end at 1440×900: select → deselect → 1:1 drag with the camera
still → pure vertical lift → duplicate landing beside the original, screenshot
read at each step. No console errors.

Still ahead (third answer): the clutter cut list — starter seed, CODE box,
title-bar text buttons, palette exact-match ("Out" summons an Outliner),
collision-free card placement, explainers into ⋯.

## 2026-08-19 — the Constructor: a node made of nodes

Depth 3 of the owner's "we all have as a constructor", and the last of the three
he asked for. A new container, `geom.constructor` (label **Constructor** — his
word), that WEARS whatever shape the nodes inside it build: enter it, place
shapes, wire them (through Merge if several) into an Out door, walk out — it
stands in the room being that shape. Its inside is its definition; its outside
is the result.

- **Geometry is a value now.** Plain descriptors (`geometryDescriptor.js`:
  box/sphere/plane/group, position/rotation/colour carried along) — not THREE
  objects, so evaluation stays pure and a descriptor asserts in a unit test with
  no WebGL in sight. The `geometry` port type, declared in PORT_TYPES since the
  beginning and carried by nothing, finally carries something.
- Cube, Sphere and Plane gained a `Geometry` output, computed through
  `evaluateNodeInput` so a wired colour colours the descriptor too — the cube
  standing in the room and the cube travelling down a wire cannot be two
  different cubes wearing one name.
- `shape.merge` (two geometry wires in, one out, chained for more). An unwired
  Merge carries NOTHING, deliberately distinct from an empty group that would
  draw as an invisible something — which forced a third category into the
  all-nodes example's liveness model: `PASS_THROUGH_PORTS`, held in both
  directions (dead bare AND provably alive once fed, one proving fixture per
  entry, an entry without a proof fails).
- **The inside is a workshop, not a room**: a constructor's parts are not drawn
  as standing objects in the outer room — only what reaches a door is drawn
  (childMap suppression in RawViewport, same split TouchDesigner draws between
  a COMP's network and its output). Watched red without the rule: four sphere
  renders for a two-sphere snowman, worn AND standing. Standing INSIDE it, the
  parts render as objects again — that is what you are there to arrange.
- No door wired → a violet wireframe placeholder in the geometry port's own
  hue: "shape goes here". No schema change anywhere — doorways, edges and
  containers already carried everything this needed.
- Caps: 256 pieces, 16 levels (`MAX_GEOMETRY_*`), one shared budget across the
  renderer walk so branch-by-branch caps cannot multiply past the total.
- The anatomy manifest resynced through its own day-old gate
  (`docs:anatomy:sync`), all ten semantic assertions holding over the new cases
  — the first proof the gate does what it was built for. `formatPortValue`
  learned to describe a descriptor ("a shape — 3 pieces") after the sheet was
  SEEN calling a snowman "something this sheet cannot read".

### Verified

Seen at 1440×900: a three-part snowman (two spheres + an orange nose cube, two
chained Merges, one door) standing in the room next to the violet placeholder of
an empty Constructor, with the loose parts correctly absent from the room;
inside it, the definition reading as a graph; the sheet answering "It holds 6
nodes. You are standing in them." No console errors. An adversarial review
workflow (four lenses, refute-by-default verification) ran over the full diff
before push; its confirmed findings were fixed in this same change.

### The review's confirmed findings, and what happened to each

Eleven confirmed (four lenses, refute-by-default verification, most proved by
EXECUTION against the real runtime). Fixed in this change: the merge-chain
depth-cap defect (17 hand-placed parts silently dropped the first two — bare
groups now splice instead of nest, guarded by a 20-part chain test); feedback
loops now poisoned whole so every surface answers "wears nothing"
deterministically in every ask order (was: first evaluator won, viewport and
sheet contradicted each other on screen); the wiki's impossible wire (clock →
Size is number → vec3; now clock's Sin → Sphere's Radius); the nesting sentence
(requires standing inside, now says so); the sheet's slot-3 sentence
contradicting slot 2 on a Constructor; the legacy unscoped viewport drawing
parts AND result; the stale "used by nothing" registry comment; and both
PASS_THROUGH gate holes (existence check now covers the list; proofs return the
setup and the test evaluates the claimed port itself).

DEFERRED, deliberately: a part selected inside a container stays selected after
walking out — the Delete FAB stays armed for a node no longer on screen. Real,
but a pre-existing behaviour of every container (a World's children do the
same), not introduced here; fixing it belongs to selection/scope plumbing, not
to this change. REFUTED and left: the StrictMode double-render halving the
piece budget — R3F v8 hardcodes strictness off inside its own reconciler root,
so the mutation cannot double-fire today; a comment at the budget records that
an R3F v9 upgrade flips exactly that switch.

### Still true, and said out loud

- A worn shape carries colour but not textures or files; Model/Video/Sound give
  no Geometry out. Stated in the wiki article's limits paragraph.
- Depth 3 does not retire depth 2: a Cube is still made of code, and its sheet
  still shows that code. The set of code-made things shrinking further —
  built-ins REDEFINED as constructor graphs — is the long-term direction
  `CONTAINER_TYPE_IDS`' comment records, not this change.

## 2026-08-19 — the sheet can show the lines

The second half of "what is it made of": where a node is worked out or drawn, the
sheet now names the file and the exact lines, and "Show the lines" opens them —
real, unedited, fetched lazily, and refused outright rather than ever shown wrong.
This is the owner's original sentence — "it can be what code is the cube" — kept
honest by machinery instead of by promises.

- **The manifest is measured, never written.** `scripts/sync-node-anatomy.mjs`
  parses the three places code lives — `computeNodeOutput`'s switch, `renderNodeBody`'s
  switch, and `renderViewNodeContent`'s if-chain, which no `case`-shaped scan can see —
  with acorn, and emits `src/project/graph/nodeAnatomy.generated.js`: per type, line
  ranges, fall-through groups as structural fact, and which ports each case answers.
  The repo's first generated file under `src/`; same sync/check contract as
  `sync-agent-docs.mjs`, CI-gated by `npm run check:node-anatomy`.
- **AST, not regex, because regex was tried and lied three ways** (measured during
  design): a fall-through case came back as a bare label with no body, a section
  header comment got glued to the wrong node, and the editor's if-chain was invisible
  entirely. `scripts/nodeAnatomy.test.js` holds ten SEMANTIC assertions — no empty
  slice, no trailing comment, no foreign label, full 64-type coverage both ways,
  answers ⊆ declared outputs, fingerprints match disk — because round-trip
  determinism alone would freeze a buggy extractor's wrong output forever.
- **Live-fed agreement, by two independent means.** The text scan of each slice for
  `liveOutputs` must equal the Symbol-substitution probe's verdict on a real node,
  type by type. The day a live case lands without the sheet learning of it, CI goes red.
- **The browser slices by line range only** (`nodeSourceSlices.js`): an explicit
  two-file `?raw` thunk map (runtime 5.0 kB gz + viewport 7.0 kB gz, own lazy chunks,
  paid only on first press), a shared djb2 fingerprint (`sourceFingerprint.js`, one
  function imported by build and browser so they cannot drift — and over the JS
  string, not bytes: the em-dashes in this codebase's comments make byte offsets and
  string offsets disagree silently). Mismatch → a visible refusal, watched red with
  the guard removed. `RawEditor.jsx` is deliberately NOT fetchable — ~23 kB gz for a
  five-line branch — so panel types get a location row without a quote.
- Containers get the doorway lines every one of them shares (the pre-switch block
  that answers a promoted socket before the type is even consulted); the five value
  nodes say "one piece answers for 5 — read it and you have read all 5"; `time`
  carries the single hand-kept extra place (`useGraphClock.js`), itself guarded by a
  test asserting the symbol still lives in the named file.
- `acorn`/`acorn-jsx` promoted from transitive to declared devDependencies — a clean
  `npm ci` would otherwise break the sync script with no warning. Lock updated with
  exactly those two lines (the full `npm install` regeneration also wanted to strip
  `libc` fields — npm-version churn, kept out).

### Verified

Seen at 1440×900 and 390×664: the cube's real five-line runtime case and its real
two-line draw return, quoted verbatim (asserted against the file on disk, not against
DOM presence), scrolling sideways inside their own boxes with no horizontal page
scroll; the container's doorway lines; the unbuilt type showing a banner and no
location rows. The fingerprint refusal exercised against the REAL loader with a
corrupted expectation — nothing mocked anywhere in the new tests.

Branch stacked on feat/raw-node-anatomy (PR #171); rebase onto dev after it lands.

## 2026-08-19 — what a node is made of

Standing inside any node, "what is it made of" opens a reading of that node. It asks
the same four questions of all 64 node types — what it takes and gives, what works
that out, what puts it on screen, what is inside it — and the ONLY structural
difference between a Cube and a container is that the fourth answer is occupied. That
sameness is the point: a container stops being a special kind of thing and becomes a
node whose fourth answer has something in it, which is also the seat depth 3 fills.

This is the second of the three things the owner asked for with "we all have as a
constructor". The first (entering a code-made node says so instead of showing a blank
canvas) shipped in `feat-raw-scene-placement`. The third — a cube that IS a graph —
is still ahead, and slot four is where it lands.

- Two ways in, both only while you are standing inside something: a control on the
  "inside X" marker, and a button on the canvas when that scope is empty. Studio wraps
  `RawGraphSurface` read-only and passes no handler, so no button appears there.
- Every fact comes from the running program. `readNode` (`src/project/graph/nodeReading.js`)
  asks the registry which ports exist, asks the runtime what is on them, and derives
  the rest by substitution. There is no hand-written sentence describing what a node
  DOES anywhere in it — such a sentence is wrong after the next edit and no test can
  catch it. Node labels and port labels are rendered verbatim from the registry, which
  is also why the parallel vocabulary pass cannot break this surface.
- `resolveInputRow` replicates `evaluateNodeInput`'s decision EXACTLY rather than
  asking "is there an edge". Those are different facts: the runtime follows the wire,
  and falls back to the node's own value if the far end resolves to undefined. A row
  that printed "wired from X" while showing the node's own number is the confident
  wrong answer this whole surface exists to remove.
- `isLiveFedOutput` asks the runtime by substitution — evaluate twice, once with an
  empty liveOutputs map and once with a `Symbol` under the port's key — instead of
  keeping a list. A live case written tomorrow classifies itself on the day it lands,
  and it catches the two that a "the value is null" test misses (`device.midi.in`
  coalesces with `?? 0`, `agent.keeper` with `?? ''`).

### Found by looking, not by reading

Five defects, none of which any unit test could have reported:

- Opened inside a Scene, the sheet rendered BEHIND the room's canvas
  (`.raw-world-fullscreen` is z-index 1200, a window frame's default is 20) while its
  button stayed perfectly clickable — a control that looked like it did nothing. Found
  by hit-testing the middle of the sheet with `elementFromPoint`.
- It opened underneath the selection inspector on a desktop and 3px inside the
  selection sheet on a phone. Entering a node selects it, so the inspector is up
  every single time this opens: the collision was the default case.
- It opened level with the "inside X" marker, which is z-index 1400 and printed
  straight over the window's own title.
- Its `aria-label` replaced the visible words rather than containing them, so the
  button answered to a name nobody could see (WCAG 2.5.3).
- The marker control was 120×21 — well under this lane's own 44px floor.

All three window-placement facts are now arithmetic in `windowLayout.js` with the
measurements that produced them, and `getScopeMarkerTop` is shared by the marker's own
style and the frame that must clear it, so the two cannot drift.

### Two things this surface revealed that are NOT fixed here

- **A doorway's declared fallback never reaches the runtime.** `doorwaySocket` sets
  `default: fallback ?? null` specifically so an unwired door does not carry undefined
  — but `getNodeInputDefault` calls `getNodeInputs(node)` with no scope list, so it
  cannot see doorway sockets at all and returns undefined anyway. The comment at
  `nodeRegistry.js` claims the defect is prevented; at runtime it is not. The sheet
  reports what the runtime actually hands out ("nothing wired in", value `nothing`),
  because a nicer sheet describing a room that does not exist is the worse outcome.
  Fixing the runtime is a real behavioural change and wants its own review.
- **The way out of a scope is labelled `‹` with "Leave" only as a title**, so its
  accessible name is the glyph. Left alone deliberately: it is an existing control and
  the parallel vocabulary pass owns its wording.

### Verified

Seen in a browser at 1440×900 (DPR 2) and 390×664 (DPR 3), against a local server, as
an ordinary visitor: inside a Cube, inside a container with a wired In door and an
unwired Out door, and inside a fullscreen Scene. No console errors, every control
reachable at its centre by `elementFromPoint`, nothing under 44px, and the sheet clear
of both the marker and the selection inspector on both surfaces.

Two guards were watched failing before their fix: the provenance rule (an
edge-presence implementation mislabels a wire that carries nothing), and the wiring
(handing the sheet the scoped card list instead of the document renders a raw uuid
where a door's name belongs).

## 2026-08-19 — a second object no longer lands inside the first

- Owner, after the scene example shipped: *"so problem in it that i have create other geometry
  what it will happen so there are still something wrong"*. There was. Two things, both found
  by adding objects in a browser rather than by reading.
- **Everything was placed at the same spot.** A new object took its type's declared default
  position, so the second thing you made stood exactly inside the first and a scene became a
  pile at the origin. New objects now step out to the nearest free place — a widening ring of
  eight, not a row: a row marches off into the distance and is out of shot by the fifth object,
  while a ring keeps the scene in view. Pointing INTO the room still wins over stepping aside.
- **THE BUG BEHIND THE BUG, and the reason to write this down.** The first fix tested
  `values.position === undefined`. It read correctly, it passed seven unit tests, and it did
  **nothing at all in the app** — because the palette hands every type's declared defaults in as
  `params`, so `position` is *always* already set by the time that line runs. Only a browser
  showed it: two spheres, both still at `[0, 0.5, 0]`. The test that mattered was not "is it
  missing" but "did anyone actually CHOOSE this", which compares against the type's own declared
  default. A unit test written against the same wrong assumption as the code confirms the
  assumption, not the behaviour.
- **New cards landed half off-screen.** Double-tapping near an edge placed a card centred on
  that point, so part of it — and the door hanging off its left edge — was outside the canvas
  and unreachable. The creation point is now clamped to the visible band, allowing for half a
  card plus the door.
- **Entering a Cube no longer shows the same blank grid as an empty workspace.** It says: *"A
  cube is made of code, not of other nodes — there is nothing inside it to see."* An empty room
  and a thing that HAS no room are different facts, and one screen for both is what made
  entering a node feel broken. `isNodeMadeOfCode` derives this from the registry rather than
  listing it, so it cannot rot as types are added — and the intention is for that set to
  SHRINK. This is the first of the three things the owner asked for when they said *"we all
  have as a constructor"*; the other two (a node shows what it is made of, and a cube that
  truly IS a graph) are still ahead, and the unused `geometry` port type is where the second
  one was started and abandoned.
- **Seen**: built the scene, added a sphere, a cube and another sphere — four separate objects
  standing apart in the room, each card fully on screen. Went inside a cube and read the new
  sentence. Zero console errors.
- Landed from an isolated clone again: the shared checkout still holds another session's
  in-flight vocabulary pass.
- Verified: lint 0 errors · 2315 tests · build clean.

## 2026-08-19 — "Make me a scene": something to open and copy

- The owner, after six stages of container work all shipping green: *"i still cannot connect and
  understand how work"*, then *"i mean i want to create scene with the objects i mean cube light
  or i want upload mine"*. Every single one of those was already possible. None of it was
  legible. The answer is not another feature.
- **The finding that mattered, and it took a browser to see it: a blank Raw workspace opens in
  ZEN, so there is no topbar at all.** No ⋯ menu, no breadcrumb, nothing to press but the
  canvas. Every example, every command, everything the lane can do was behind a menu that does
  not exist for a first-time visitor. Measured: `topbar: false` on a blank workspace.
- **Shipped**: a "Make me a scene" button in the middle of the blank canvas (and the same entry
  in the ⋯ menu for anyone who has chrome). It builds:
  - a room, open, so the scene is visible the moment it is made
  - a light, so the room is lit rather than flat
  - a cube, with a colour node wired into it — the one wire, chosen because its effect is
    unmissable
  - an empty Model node labelled "Your own model goes here"
  - a note giving four moves in plain words: double-tap to add, drag your own file on, drag dot
    to dot to wire, press › to go inside
- **The Model node is deliberately EMPTY.** That is the state a person meets after placing one,
  so the example meets it too — beside an instruction rather than alone. Seeding a fake asset id
  would draw a broken model and teach the opposite.
- **The note is written to the size of its own window, not the other way round.** Three passes,
  each looked at: 17 lines showed 5 and cut mid-sentence; a taller window put the windows back
  over the cards; widening it so the lines do not WRAP was the fix — wrapping, not line count,
  was what pushed the last line below the fold. Windows are top-docked with a card band below,
  the same lesson the starter workspace had to learn twice.
- **Seen**: from a genuinely blank workspace, pressed the button, watched the scene build, then
  dropped a 7.7MB `scan.glb` onto the canvas and watched it arrive in the room beside the cube.
  Zero console errors.
- **Shared-checkout note.** This landed from an isolated clone at `origin/dev`, not from
  `/home/dob/di.iiii`: another session had 70+ files modified in that tree mid-flight, including
  a vocabulary pass that had already renamed this button and the doorway menu items. Committing
  from the shared tree would have taken their unfinished work with it. The 14 test failures seen
  there were theirs; this change is green on 2304 in a clean copy. Expect a trivial wording
  conflict when their pass lands — their naming wins.
- Verified: lint 0 errors · 2304 tests · build clean.

## 2026-08-19 — the move op: a node can change scope at all

- Stage 3a. `parentId` was written once at `createNode` and **never mutated by any code path** —
  `applyProjectOps`' `updateNode` builds from an explicit allow-list (label, graphX, graphY,
  runtimeId, assetRef, values) that omits it, so a node's scope was fixed for life. This adds
  the op. **The drag gesture is deliberately NOT in this change** (3b): the schema half lands
  cleanly on its own and the gesture has conditions that are not met yet.
- **ONE atomic op, `reparentNode`, not four loose ones.** As separate ops the reducer refuses
  the `parentId` while still applying `graphX`/`graphY` and any edge deletes — and
  `useProjectDocumentSync` resubmits a 409'd batch **verbatim** after catch-up, so a lost race
  left the wires cut, the node not moved, and the node replanted at a coordinate meaningless in
  its scope, with nothing said. Whole or nothing. Tested in both reducers, including that a
  refused move leaves the coordinates untouched.
- **Two guards, both about silent loss rather than errors:**
  - The destination must exist. A `parentId` naming nothing puts the node in no scope's child
    list, reachable from no Enter and visible on no canvas.
  - A node may not become its own ancestor. `deleteNode`'s `collect()` guards against cycles it
    FINDS; this stops one being made. An unguarded cycle is unreachable, undeletable, and
    recurses on every traversal.
- **The inverse restores the scope AND the position.** Without the coordinates, undo returns the
  node to the right room at the drop point's coordinates — which mean nothing in that room.
- **A bug I shipped in stage 5, found by reading the inverse rather than by a failing test.** A
  doorway's exterior wire names the CONTAINER and the door's id, and the container is not among
  the deleted nodes — so the delete sweep removed the wire while `invertSingleOp`'s
  `restoredEdges` filter (which matches on node ids only) would never have restored it. One
  Ctrl+Z would have silently dropped a wire the user still had. Fixed in both copies, guarded by
  a test that deletes a door, undoes, and asserts the edge comes back.
- Mirrored into `shared/projectSchema.cjs` and covered by `schemaSync` fixtures, because that
  suite is fixture-driven: an ESM-only edit passes green until something exercises the path, and
  a client-only reparent is silently dropped by the server reducer until the next full load.
- **DEPLOY ORDER MATTERS for this one: serverXR FIRST, then the static bundle.** Ship the bundle
  first and every move works locally and is silently discarded by the server until a reload. A
  stale open tab drops the `parentId` key with no version conflict to trigger a resync.
- **What 3b (the gesture) must not do, recorded now so it is not rediscovered:**
  - Restrict the drop target to `universe.desk.3d`. Of the four container types only that one is
    `render: 'spatial-3d'`; `studio` and `universe.space` are `hidden` and `universe.world` is
    `panel-2d`, and `RawViewport`'s childMap is built from `filter(isSpatialNode)` — so dropping
    a Cube into a Studio makes it vanish from the viewport and read as deletion.
  - Derive the parent scope as `authoredNodes.find(n => n.id === currentScopeId)?.parentId`,
    never `navStack[length - 2]`: `goToRoot` sets the stack to `[null, nodeId]` unconditionally
    for the RawHub handoff, so a nested container would report the document root and "move out"
    would yank the node through a scope the user never entered.
  - Do NOT cut edges that become cross-scope. `nodeGraphRuntime` has no `parentId` awareness, so
    they keep evaluating correctly — they are undrawable only because of RawEditor's
    both-endpoints filter. Deleting live user data to work around a client-side render filter
    replicates to every peer and is invisible to the collaborator who did not drag.
  - The undo truth: the drag commits `graphX`/`graphY` every animation frame and those coalesce
    into their own history entry, so ONE Ctrl+Z takes the node out of the box but leaves it at
    the drop point. Do not claim "one batch, one undo step".
  - `selectedNodeId` will still name a node no longer on the canvas after a drop, and a panel-2d
    card dragged into a container silently unmounts its floating window (`windowLayout` scopes
    mounted panels by `parentId`).
- Verified: lint 0 errors · 2293 tests · schema parity green · build clean.

## 2026-08-19 — expose a port on the container

- Stage 6, the last of the container work. Doorways (stage 5) work but had to be placed and
  wired by hand. Now: stand inside a container, hold a port dot for half a second — or
  right-click it — and choose **Expose on the container**. The doorway node and its wire are
  created in ONE op batch, so a single undo takes both and there is no intermediate state
  where a door sits wired to nothing.
- **Reported honestly: this does not solve discovery.** A long press advertises itself to
  nobody. It is a shortcut for the gesture someone already knows, not the way anyone finds out
  doorways exist — placing an In/Out node from the palette by hand remains that. The port dot's
  tooltip carries the hint, which is the most a dot can do.
- **The socket it makes is one scope up and off-screen**, so the gesture would otherwise look
  like it did nothing. A notice says *"Desk now has a Color socket"* with a **Go and see**
  button that navigates to the container's own scope and selects it.
- **Corrections applied, each one a real failure mode:**
  - The long press registers `pointerup`/`pointercancel`/`pointermove` on the WINDOW, not the
    dot. `handleOutputPointerDown` releases pointer capture for every non-mouse pointer, so on
    touch the pointerup goes to whatever is under the finger — element-level handlers would
    leave the timer armed and pop the menu half a second later over whatever was tapped next.
  - Opening the menu clears `pendingWireRef`, `pendingWire` and `draggingNodeId`. A press on an
    output dot has already armed a wire; left armed, the next release anywhere on the canvas
    snaps within 36 screen pixels and creates a plausible-looking edge nobody asked for. Tested.
  - **Go and see** navigates by the container's own parent id, never `navStack.length - 2`. At
    the root that index is -1, which truncates the stack to empty and takes the trail, the
    Escape exit and the scope marker with it.
  - `.raw-graph-port-menu` is excluded from BOTH `shouldStartPan` and
    `handleSectionDoubleClick`, or tapping an item pans the canvas and a double-tap opens the
    create palette behind it. It renders outside `.raw-graph-stage`, which carries the pan/zoom
    transform — `position: fixed` inside a transformed ancestor resolves against that ancestor,
    so the menu would shrink with the graph and land in the wrong place. z-index 1250, under
    `.raw-topbar`'s band.
  - **One label field, not two.** The promote writes only `values.label` — the socket's name,
    and exactly what the inspector edits. The card keeps the type's own name ("In"/"Out").
    Writing both would let a rename diverge them permanently, and the socket would end up named
    by whichever happened to be read.
  - The port type is inherited from the port it came from, so the type picker is usually
    untouched.
  - The exterior-wire sweep needed no work here: it lives in the reducer's `deleteNode`
    (stage 5), so it already covers the Delete key, the delete FAB and any future route.
- **Seen, not assumed**: went inside a Desk holding a Cube, right-clicked the Cube's Color
  input, chose Expose — an `In` node appeared already wired (`port.in.value → geom.cube.color`,
  both inside the desk, no scope crossed), the notice read *"Desk now has a Color socket"*, and
  **Go and see** took me up to the root where the Desk card showed **Color (color)** after its
  five declared inputs. Zero console errors.
- Verified: lint 0 errors · 2286 tests · build clean.

## 2026-08-19 — doorways: a hole in a container's wall

- Stage 5, and the thing the owner actually asked for: *"how it in touchdesigner where you
  can put the geometry and inside it objects"*. Place an **In** or **Out** node inside a
  container and a socket with that name appears on the container's outer face. One interior
  node, one exterior port — the mechanism TouchDesigner (In/Out operators), Blender (Group
  Input/Output), Max (inlet/outlet), Unreal (tunnel nodes) and Houdini (subnet inputs) all
  arrived at independently.
- **The property that makes it safe: no edge ever crosses a scope boundary.** The wire
  outside joins two siblings in the parent scope; the wire inside joins two siblings within
  the container. RawEditor's both-endpoints-in-scope filter stays exactly as written, and the
  runtime needs no notion of scope at all. Demonstrated live, not argued:
  `sky.out → desk.door [root/root]` and `door.value → cube.color [desk/desk]`.
- **The socket's identity is the doorway node's own id, never its label.** One choice, three
  defects removed: renaming a door cannot break its wire, two people adding doors at once
  cannot collide on a name, and deleting a door then adding another cannot resurrect the old
  wire onto new plumbing. Order is DOCUMENT order, never `graphX` — dragging a card commits
  an op per animation frame, so position-ordering would re-index a container's face while
  someone drags an unrelated node inside it, detaching every wire outside it in a scope nobody
  is looking at.
- **The delete sweep, in both reducers.** A doorway's wire names the CONTAINER and a port id,
  so deleting the door leaves an edge whose endpoints both still exist. `createEdge` validates
  endpoint nodes only and `normalizeEdgesList` drops edges by missing node id, never by missing
  port — it would be a permanent orphan no reload, normalisation or gesture could clear, parked
  at a card's corner by `inputPortCenter`'s `idx<0` branch. Swept in `src/shared/projectSchema.js`
  AND hand-mirrored into `shared/projectSchema.cjs`: with the client copy alone, the wire
  vanishes locally and the server's replay resurrects it on the next sync. Both copies are
  covered by fixtures, because the parity suite is fixture-driven and an ESM-only edit passes
  green until something exercises the path.
- **Eight call sites.** A container's ports are DERIVED, so `getNodeInputs`/`getNodeOutputs`
  take an optional trailing node list and `cardHeight`/`inputPortCenter`/`outputPortCenter`
  thread it too. Miss one and the container grows a socket the card does not draw, or draws one
  the wires do not land on. `portScopeNodes` is the FULL node list, never `graphCardNodes`: a
  container's doorways live inside it, a different scope from its own card, so the scoped list
  would find none of them and the feature would fail in total silence with every unit test
  still green.
- **Defaults are load-bearing.** Both doorway types carry a real default; without one a freshly
  placed door hands its container a socket that draws, persists, survives a reload and carries
  `undefined`, and the consumer downstream quietly falls back to its own local value — which
  looks *exactly* like a door that works.
- **Known limits, stated rather than discovered:**
  - `node.null` cannot grow doors: its dynamic `portDefs` branch returns before the promotion
    merge. Every node in production today is a `node.null`. Tested as a limit, not a bug.
  - Studio's read-only flat surface shows a promoted port twice — once as a socket on the
    container, once as a separate In/Out card in the same plane — with no line joining them.
  - Document order is server-sequence order after reconciliation, so a door created
    optimistically can change row on sync. Identity is stable; row is not.
  - Deliberately NOT done: dropping edges whose ports cannot be resolved from the wire memo.
    It would also silence every edge into a legacy or removed type, and "my wires disappeared"
    on an old document is a worse failure than the one it fixes. The delete sweep covers the
    doorway case at its source instead.
- **Seen, not assumed**: seeded a desk holding a cube and an In door, dragged a wire from an
  orange colour node into the desk's new **Tint** socket, and watched the cube inside the desk
  turn orange. The Desk card shows its five declared inputs plus Tint, and its three outputs.
  Zero console errors.
- Verified: lint 0 errors · 2282 tests · schema parity green · build clean.

## 2026-08-19 — a wire can start from a container

- Stage 4 of the container work, and the first half of the owner's second
  complaint: *"cant connect"*. It was literally true. **Every container type
  declared zero outputs** — World 2 in/0 out, Space 1/0, 3D Desk 5/0, Studio 1/1
  — so `nearestOutputPort` had an empty list to iterate, the press fell through to
  the card-drag branch, and pressing-and-pulling on a World **silently moved the
  card**. Not a UX gap: a data-layer one.
- **The rule this change commits to, in one line: A CONTAINER OUTPUTS ITS OWN
  SETTINGS, NEVER ITS CONTENTS.** Reaching inside is port promotion — sentinel
  nodes placed in the container, one per exterior port — and is deliberately a
  separate stage. Research across TouchDesigner, Houdini, Max/MSP, LabVIEW and
  ComfyUI found that assuming wires pass through a container automatically is the
  single most repeated user complaint about containers *in every one of them*, so
  the boundary is drawn hard and said out loud in the code.
- **Shipped**: `universe.world` → Title (string), Sky (color). `universe.desk.3d`
  → Position, Rotation, Scale (vec3), so something OUTSIDE the desk can follow the
  desk; things inside already move with it through the scene graph. `studio` →
  Title.
- **Rejected, with the reason recorded in place rather than deferred vaguely**:
  - `universe.space` keeps zero outputs. Its one setting is showChrome, and no
    input anywhere in the registry could consume a chrome boolean to a visible
    result — the exact dead-wire disease.
  - World bounds/size: not honestly computable. `geom.cube.bounds` comes from its
    own `size` input; a World has no size and nothing in `src/` measures a
    subtree's extent.
  - World `live`: computable, but the codebase holds two conflicting definitions
    of live (RawEditor's strict marked-check vs `resolveScopeWorldNode`'s
    first-created fallback), and shipping a port would bless one and make the
    other read as a bug. No consumer either — boolean→string is incompatible.
  - Desk gridVisible/bgColor echoes: no observable consumer.
- **Every output ships with its `computeNodeOutput` case in the same commit.**
  Without one, the fallthrough returns the node's own stored value and silently
  ignores any wire into the matching input — a port that draws, persists, survives
  a reload and lies, which is strictly worse than the undefined it replaces. 34 of
  the registry's 70 existing outputs are already in that state; this adds none.
- **A footgun made real, then made true.** `arePortsCompatible` has always allowed
  `color → vec3` and the input dot lights up as compatible, but `asVec3` returned
  its fallback for any non-array — so the wire drew and quietly produced
  `[0,0,0]`. Nothing reached it because no container had a colour OUTPUT. The
  World's Sky makes it reachable, so `asVec3` now reads hex, normalised 0..1
  (0..255 would put a red sky 255 units off-stage).
- **A tested behaviour deliberately reversed**: `studioNode.test.js` asserted
  `outputs` must be `[]`, on the grounds that the runtime could not compute one.
  True then — and the answer was to add the case, not to leave the card unwireable
  forever. The test now asserts the rule that actually matters, against the real
  runtime: every declared output must produce something, AND must carry the
  **wired** value rather than the stored one. The second half is load-bearing; a
  "did something come out" check passes against the very fallthrough it should
  catch.
- **Card geometry did not move.** Outputs are at or under the input count on every
  container (2/2, 5/3, 1/0, 1/1), so `Math.max(inputs, outputs, 1)` is unchanged
  and no port centre shifted. A third output on `universe.world` would grow every
  World card by a row and visibly detach every wire on every saved document — it
  would read as a rendering glitch, not a bug. Guarded by a test.
- **Seen, not assumed**: in a real browser, dragged from a World's Title output —
  a dot that did not exist before — onto a text panel's Content, and watched the
  panel read *"The rehearsal room"*. Edge persisted as `world.title → note.content`,
  zero console errors.
- Honest scope note for the PR: that demo works with the panel standing **beside**
  the World. Cross-scope edges are still unauthorable, so "the panel in the room
  names the room" is not yet what ships.
- Verified: lint 0 errors · 2267 tests · build clean.

## 2026-08-19 — a door you can see, and something that says where you are

- Stage 2 of the container work. Stage 1 fixed "can't put the geometry in"; this fixes the
  other half of "can't go inside" — which turned out not to be blocked at all. You could
  always go inside. Nothing ever told you that you had.
- **What entering a World looked like before**: a chromeless fullscreen empty grid with one
  20px icon in a corner. No name, no breadcrumb, no visible exit, every card gone from view.
  A person doing that does not think "I am inside the World"; they think they have destroyed
  their workspace. Screenshotted before touching anything.
- **Why**: the breadcrumb EXISTS. `chromeVisible` starts with `if (zen) return false` and a
  fresh workspace opens in zen, so the whole topbar is hidden; and `handleEnterNode` sets
  `isWorldFullscreen(true)` for `universe.world`, stripping what was left. Machinery present,
  never on screen.
- **What shipped**
  1. A scope marker — `‹ inside <name>` with a real exit — rendered whenever `navStack.length
     > 1`, deliberately OUTSIDE the chromeVisible gate so zen and fullscreen cannot hide it.
     34px controls, because leaving is the one thing a lost person needs and a phone has no
     Escape key.
  2. Cards say what they hold. `childCounts` (optional, defaulted — Studio wraps this
     component read-only and passes nothing) puts a count badge on a card with contents and
     brightens its chevron. Before, `math.add` and `studio` wore the identical mark.
  3. The enter control is no longer gated at `CARD_CONTROL_MIN_ZOOM` (0.5) for a card that
     holds something. The auto-fit lands an oversized graph at `FIT_MIN_USEFUL_ZOOM` (0.34),
     so the way into a container vanished exactly when the "showing N of M" notice appeared.
  4. Chevron contrast raised from rgba(244,247,251,0.2) — about 1.6:1, under the 3:1 floor
     for a non-text control.
- **The measured phone bug, and the assumption that hid it.** `starterWorkspace.js` says in
  its own comment that both windows must finish in the top half and "the test asserts it" —
  asserted at viewportHeight 844. A real iPhone 13 hands the page **664** once browser chrome
  is taken. Measured with `elementFromPoint` on three devices:
  - iPhone 13 (390x664): 1 of 4 cards reachable — Studio, the card the welcome text tells you
    to tap, sat under the welcome window
  - iPhone SE (320x568): 1 of 4
  - Pixel 7 (412x839): 4 of 4
  The seed's own `2y + h <= vh` invariant HOLDS at 664 — it is necessary, not sufficient. What
  separates the working sizes from the broken ones is absolute pixels below the windows
  (318/314 vs 250/198), not a fraction: a card's height does not scale with the phone. So
  `CARD_BAND_MIN = 300`, below which the welcome note opens as a header only — still there,
  still one tap from expanding, and no longer sitting on the instruction it gives.
  After: iPhone 13 3/4, iPhone SE 2/4, Pixel 7 4/4, and **Studio reachable on all three**. The
  one still covered is Sky, a colour value with nothing inside it, whose door means nothing.
- Two wrong rules were tried and discarded by measurement before this one: "finishes in the
  top half" (minimised the note on roomy phones too) and the file's own `2y+h` invariant
  (left iPhone 13 at 1 of 4). Neither was shipped.
- **The first version of this stage was wrong, and adversarial review caught it.** Three
  defects, each verified against the running app before being fixed:
  1. The door stayed in the card header, inside the graph's own transform. **Measured 7x7
     SCREEN PIXELS** at the zoom the fit lands on — present in the DOM, unusable in the
     browser, and a pixel-perfect scripted click on its exact centre did nothing. The test
     asserted DOM presence and passed the whole time. That is the trap: *a DOM-presence test
     for a defect whose signature is a wrong number of screen pixels.*
  2. It also sat inside `nearestOutputPort`'s 28-SCREEN-pixel grab radius, which covers the
     card's right-hand end once zoomed out — the very collision the old zoom gate existed to
     prevent, reintroduced by removing the gate.
  3. The scope marker was fixed at `top: 12px` — **inside `.raw-topbar`**, which is 49px tall
     and full-width, whenever chrome was on; and on `.raw-graph-fit-notice` (also top:12px) in
     zen. Verified only in zen the first time, which is why it looked fine.
  Rebuilt: the door hangs off the card's LEFT edge on a **counter-scaled** anchor
  (`scale(1/zoom)`), so it is a constant size on screen — **28x22 desktop, 44x44 on touch** —
  at every zoom, and is structurally clear of the output-port grab zone. Never gated on having
  contents: the same control reopens a closed panel window, and an un-enterable empty container
  is a box that can never be filled. The marker moved below the topbar (`collidesWithTopbar:
  false`, measured), and its controls went 34px -> 44px, the lane's own floor. The fit now
  reserves the door's width so it is not clipped: **0 of 41 doors clipped** after a fit-all,
  where the leftmost was half off-screen before.
- **Seen**: desktop, iPhone 13, iPhone SE, Pixel 7. Entered Studio, saw `‹ inside Studio`,
  left, got the cards back. Entered a World on the phone — the case that used to blank the
  screen — and the marker is there over the fullscreen grid, 44x44, reachable.
- **Accepted, named, not hidden**: the bottom-most card's door can land under the zoom cluster
  (`.raw-graph-zoom-controls`, bottom-left, opaque). Pixel 7 went 4/4 -> 3/4 on that alone. The
  surface's own doctrine is that a corner occlusion must not push the whole graph up — only a
  bottom-anchored band does — and the same trade already exists for the delete FAB at
  bottom-right. `pointer-events: none` would be worse: the door would be invisible AND
  clickable. The card is still enterable by double-click; only its door is covered, and only
  in that one corner.
- Verified: lint 0 errors · 2246 tests · build clean.
- Still open, and unchanged by this: every container declares zero outputs, so a wire cannot
  start from one. That is the In/Out doorway work.

## 2026-08-19 — "I want to build world but can't connect or go inside": the map and the stage were showing two different rooms

- Owner, on Raw vs TouchDesigner: *"i want to build world but cant connect or go inside how it in
  touchdesigner where you can put the geometry and inside it objects"*. Two complaints, both
  reproduced first-hand before touching anything, and the cause of the first was NOT what the
  first look suggested.
- **The mechanism.** The graph canvas filters cards on `currentScopeId` and the palette creates
  with `parentId: currentScopeId`, while every 3D viewport was handed `scopeId={worldNode?.id}`
  — the inside of the live World. At root those are different rooms, so a cube placed at root
  landed somewhere perfectly real and the stage never drew it. One word's disagreement between
  two filters, not a missing feature. Found by a design workflow reading the code, after my own
  first pass wrongly concluded "you must enter the World first".
- **What shipped (stage 1 of six).**
  1. All three viewport mounts now take `scopeId={currentScopeId}` — the room you are standing
     in. `worldNode` is still passed, for sky and lighting. The docked World panel included: a
     World is `render:'panel-2d'` and its live-marker is keyed by its PARENT scope, so it is a
     window onto the room it stands in, not a box things go inside.
  2. `RawViewport` builds a `childMap` by `parentId` and `NodeVisual` recurses, so a container's
     children render INSIDE its own `<group>`. Move, turn or scale a desk and everything standing
     on it travels with it — the geo-COMP behaviour the owner described. Shape copied from
     `StudioViewport.jsx:520-530`, already proven twice in this repo for entities.
  3. Descent stops at a nested `universe.world`: a World is its own stage, and seeing through one
     into another would change what existing spaces show.
  4. `resolveScopeWorldNode` walks up to the nearest ancestor World, so standing in a Desk or a
     Studio no longer gates the 3D off entirely. Cycle-guarded rather than trusting the data.
  5. `StudioWorldSurface` moved to the world's own scope too, or the identical document rendered
     as two different rooms depending on which lane opened it.
- **Four guards, in the same commit, each one a way this silently corrupts work if omitted** —
  every one named by an adversarial pass before it was written, not found afterwards:
  - values resolved for the WHOLE rendered subtree, not just the top row. `NodeVisual` reads
    `node.values` directly, so a nested node wired to a Time node would have frozen the moment it
    went inside something — the "can't connect" complaint, newly caused by fixing the other one.
  - no drag handler below the top level. The drag writes a world-space raycast point into
    `values.position`, which is read as parent-LOCAL; nested drag would teleport a node by its
    parent's transform with no error. `StudioViewport.jsx:542` refuses the same move for the same
    reason. Nested position stays editable in the inspector until there is a gizmo.
  - `nodeScale` (the workspace zoom) folded in at the roots only, passed down as 1, or it
    compounds with depth.
  - a container with no body of its own keeps its `<group>`. The old `if (!body) return null`
    would have swallowed everything standing inside it.
  - the 3D Desk shell stops raycasting, or its skin swallows every pointer aimed at its contents.
- **Seen, not assumed.** Placed a cube at root and watched it appear in the room — it did not
  before. Seeded a desk with a cube standing on it, then moved the desk right and scaled it 1.6×:
  the cube travelled with it and grew in proportion, still on the desk's top face. Opened Studio's
  Open Jam locally afterwards: renders as before, zero console errors.
- **A documented behaviour was deliberately changed**, not worked around:
  `resolveScopeWorldNode` used to return null for a scope with no World of its own, and a test
  asserted it. That null gated the whole 3D surface off. The test now encodes the new intent and
  says why, plus ancestor-preference, no-world-anywhere, and parentId-cycle cases.
- **The other complaint is NOT fixed by this.** Every container type still declares ZERO outputs
  (World 2 in/0 out, Space 1/0, 3D Desk 5/0, Studio 1/0), so a wire cannot start from one, and
  nothing inside a container can be reached from outside. That is stages 4-6: real outputs each
  paired with a runtime case, then TouchDesigner-style In/Out nodes placed inside a container to
  give it ports, then the gesture that promotes an interior port to the surface. Research across
  TouchDesigner, Houdini, Max, Blender, Cables.gl, vvvv and Unreal found one unanimous mechanism
  for this — a container's outer ports exist because sentinel nodes sit inside it — and found that
  the single most repeated user complaint about containers, in every one of those tools, is this
  exact sentence.
- Risk audit, before any of it: production holds 13 nodes across 8 spaces, every one `node.null`,
  zero nested, zero spatial; br_id_ge's four live documents have `nodes: []`; and
  `LiveProjectScene.jsx` never reads `doc.nodes`. This work cannot reach an exhibition visitor.
- Verified: lint 0 errors · 2243 tests · build clean.

## 2026-08-18 — Raw could not open a file. Model / Video / Sound, and a door to put them through

- Owner: "if want to add models there it still not working full — analyze TouchDesigner and
  other similars and rebuild all." The first half is a fact, checked before touching
  anything: Raw's registry had **no model node, no video node, no audio node**. A live guest
  test on staging searched the palette for *model, glb, gltf, mesh, import, file, video,
  asset, audio* and every single term returned "no match"; a real `.glb` dropped on the
  canvas did nothing at all — no node, no error, no request. Meanwhile Studio, one URL over,
  uploaded and rendered a 7.7MB photogrammetry scan for the same guest with no login.
- **The capability was already finished and simply not wired to Raw.** `ModelObject.jsx` is a
  serious loader (GLB + Draco/Meshopt/KTX2, OBJ+MTL, STL, FBX, skeletal animation, explicit
  GPU disposal); `EntityContent.jsx` renders fifteen object kinds including model/video/audio.
  Raw's node lane had its own hardcoded four-shape switch in `renderNodeBody` and never met
  any of it. `document.assets` and `buildAssetMap` were already in Raw's viewport.
- **What shipped**
  1. `geom.model`, `media.video`, `media.audio` in `nodeRegistry.js`, family `bring-in` — a
     file from your disk is a door into the graph, like the webcam, not something Raw makes.
     Each carries `keywords` so the nine words that returned "no match" now land; there is a
     test asserting exactly those words.
  2. `renderNodeBody(node, values, assetMap)` — it previously had **no access to the asset
     map at all**, so a node could not resolve a file even in principle. Threaded from
     `SceneContent` through `NodeVisual`. Node visuals are now wrapped in
     `SceneEntityErrorBoundary` like entities: a node can now load an arbitrary file, and a
     corrupt mesh must cost that node, not the scene.
  3. Drag-and-drop on the workspace (`dropAsset.js` + handlers in `RawEditor`). Server-backed
     projects upload through `uploadProjectAsset`; local workspaces store the bytes in
     IndexedDB, which is where `useAssetUrl`/`ModelObject` already look first — so both
     render identically. Unsupported files are NAMED back to the person; a silent drop is the
     failure this whole change exists to remove.
  4. Dropping **onto a room** puts the node in that room (`data-world-scope-id` +
     `resolveDropScopeId`). Without it a drop at root makes a node the World window will
     never show, because the World renders its own scope — verified: a Cube placed from the
     root World surface is invisible there too, which is existing behaviour, not a regression.
  5. A ＋ beside the inspector's asset picker, because drag-and-drop does not exist on a
     phone and the picker alone only offers files that are already here.
- **Seen, not assumed.** Headless Chromium at DPR 2 against a local dev server: dropped the
  real 7.7MB `scan.glb` and **watched it render textured in the room**; dropped a 673KB mp4
  and a 265KB wav and watched the video plane play and the sound's marker appear. Zero
  console errors throughout. On an iPhone 13 viewport the ＋ measured 46×46 and — first
  attempt — `reachable: false`: the floating scope button sits exactly on top of it at 390px.
  Moved the button to the left of the picker and re-measured to `reachable: true`, then drove
  the real file chooser and confirmed `scan.glb` stored (7,726,720 B) and the port filled.
- **What was researched and NOT built.** TouchDesigner, Houdini, Blender, Cables.gl, vvvv and
  Max all type wires by the *shape of the data*, not the artist's intent, and refuse an
  incompatible connection outright; Notch's "anything to anything" is the cautionary tale —
  its failures show as grey nodes after render. Raw's seven verb families are a good menu and
  a poor type system. `PORT_TYPES` even declares a `geometry` type that **zero ports use** —
  designed, never built. The recommended second axis (geometry / texture / material /
  transform / audio / trigger, colour-coded, refusing bad drops) is deliberately left for its
  own change: it touches every node's ports, and this one had to make files work first.
- Verified: lint 0 errors · 2234 tests · build clean.

## 2026-08-18 — "there are no in/out connectors": the fit centred cards under a window

- Owner report with a screenshot at ~1050px: too much overlap, and World had no visible
  connectors at all. Reproduced exactly: at that width the World window sat on top of the
  card column and its output dot was covered by `raw-window-header` — not a rendering
  glitch, the port was genuinely unclickable.
- **Root cause**: `RawGraphSurface`'s auto-fit centres the card cluster on the viewport's
  own centre, with zero awareness of the two floating windows the starter seed opens. A
  corridor between the windows can be technically wide enough for the cards and still bury
  them if it isn't centred — which is exactly what happened: world+text left a 281px gap
  that ran 304..585, while the centred 202px card lane ran 424..626.
- **Fix, in three parts**:
  1. `getWindowLayout.getGraphEdgeInsets` (new, pure) turns docked window frames into
     left/right/top/bottom insets, charging each window to the edge it hugs. Reports the
     TRUE footprint — an earlier draft scaled insets down to cap them, which understated a
     window's real size and let cards spill into it anyway (caught before shipping, at
     800x950 in the phone-narrow stacked layout). Only gives up on an axis when there is
     truly no room (an absolute floor, not a fraction of the viewport — a fractional floor
     wrongly disabled dodging on a real phone where two edge windows leave ~17% free).
  2. `RawGraphSurface` accepts `contentInsets` and folds them into `visibleBox()`, so the
     fit centres on the free band, not the whole container. Windows mount a beat after the
     graph does, so a second effect re-fits when the insets change — but ONLY while the
     view is still exactly where the first fit left it, so a person who has already panned
     is never yanked.
  3. `starterWorkspace.js`: `math.mix`-unrelated — the seed's own window sizing is capped
     so the two edge windows can never eat more than half the width minus the card lane's
     half-width and a gutter, and the narrow-layout card gap widened from 88 to 112 (it was
     smaller than World's own 98px card height, so cards overlapped EACH OTHER).
- Verified with a pixel-measuring Playwright harness across 700–1920px: **zero overlaps,
  5/5 ports reachable at every desktop width**, including the exact ~1050px from the
  report. Did a real interactive test at that width too: placed a fresh `value.string` node
  from empty canvas and dragged a new wire onto World's Title port — it connected.
- New tests: `getGraphEdgeInsets` unit coverage (edge-charging, the historical bug's exact
  numbers, the truthful-vs-scaled-inset regression, the give-up floor) in
  `windowLayout.test.js`; a numeric corridor-straddles-centreline check against the real
  seed builder across 11 widths in `starterWorkspace.test.js`.
- Verified: lint 0 errors · 2188 tests · build clean.
- **Not fully closed**: a real 390×844 phone still shows one self-overlap — the seeded
  `welcome` window sits over its own card's `content` port when the graph is small enough
  to hit `FIT_MIN_USEFUL_ZOOM`'s neighbourhood-fit fallback, which centres on the seed
  node's position rather than the whole cluster's centroid, so a card near the cluster's
  edge can still poke past a docked window. Pre-existing (baseline was 3/5 reachable before
  today, worse than this); now 4/5. Left as a named follow-up rather than touched blind —
  fixing it means changing how EVERY graph centres on a phone, not just the seed.

## 2026-08-18 — the example graph was lying in the other direction

- Follow-up to the node families work: I went back for the audit's parked PARTIAL items and
  found the bigger thing first. `allNodesExample.js` — the graph Raw's ⋯ menu opens as the
  portrait of the whole registry — declared `time.beat`, `geom.cube.bounds` and
  `view.image.src` **unwirable**, with a header saying no geometry/texture/signal output
  ever produces a value and "an edge out of one is decoration". Every word of that had
  become false. The 2026-08-06 audit caught NODE_BACKLOG overclaiming; this file was
  underclaiming just as hard, and it is the file a curious person actually opens.
- **Why it rotted:** its staleness test only asserted the named ports still EXISTED, never
  that the claim was still true. So the runtime grew cases (time.beat, geom.cube.bounds)
  and webcam started publishing a live texture, and the list stayed green while
  misinforming every reader.
- **Evaluated every declared output of every placeable type against the runtime: none are
  dead.** One exception found and fixed — `math.mix` returned undefined at rest because its
  `a`/`b` inputs had no defaults, the only placeable output in the registry producing
  nothing unwired; defaults of 0 make it behave like every sibling math node.
- **The guard now derives liveness from the runtime, both directions** — a port that is
  dead but undocumented fails, and a port documented as unwirable that actually returns a
  value fails. Watched it go red on the exact historical drift (re-adding the old
  `time.beat` claim) before going green, per the repo rule about guards never seen red.
- **`view.image` now renders a wired live texture** (audit PARTIAL closed): a DOM element
  can't be mounted twice, so the frame is copied to a canvas per rAF. Verified in a real
  browser — dragged webcam `Frame` → image `Source`, read the canvas back: 640x480, 100%
  non-black, and the panel's timecode advances independently of the webcam panel's. The
  example graph now wires that edge, plus `cube.bounds → desk.scale`, so it demonstrates
  what it used to deny.
- Verified: lint 0 errors · 2177 tests · build clean · looked at.
- Still parked from the audit: `universe.desk.3d` renders a marker box rather than its
  child scope (its card claims more than it draws), and `view.director`'s placement
  affordance dangles without a mounted canvas.

## 2026-08-18 — the node truth audit, and families for a palette that felt messy

- "Raw feels not real" — audited every one of the 39 placeable types: 8-agent code-truth
  pass (per family + palette/wiring plumbing) plus a real-browser pass placing each node
  one by one, screenshots looked at. Verdict: 33 REAL end to end, 6 PARTIAL, 0 true
  shells. The unreal FEELING was presentation: a flat 39-row palette in code-declaration
  order, families invisible (NODE_CATEGORIES' "used for palette grouping" comment was
  never implemented), wires that draw in full colour into anything, a "Code / Body"
  inspector box that stores-but-never-runs with no caveat, a complete timeline editor
  nothing could reach, and universe.space wearing an authoringOnly tag its working
  showChrome disproves.
- **Families.** Seven artist-facing families by task (bring in / make / numbers / the room
  / watch / send out / agents) — NODE_FAMILIES + FAMILY_BY_TYPE in the registry, additive,
  categories untouched underneath, coverage enforced both directions by test. The palette
  browse groups under sticky headers with counts and a family colour bar per row; any
  typed character dissolves to the flat ranked list; keyboard highlight skips headers;
  commands stay pinned first. Cards and the outliner dot wear the same family colour and
  label — a studio card no longer says "universe".
- **Honesty.** "authoring only" tag → "shell" (dimmed row); work.status/work.agent carry a
  registry devLocalOnly flag and a "local dev" tag; the inspector CODE section is labeled
  "Code — stored, not run"; wire-drag now lights every input that can take the wire and
  quiets every one that cannot (colour↔vec3 interchange included) — an incompatible drop
  used to be pure silence.
- **Quick reals from the audit:** timeline gets an add-clip button (the whole built editor
  — drag/trim/razor/ripple/retime — was unreachable: no way to create a clip existed);
  math.mix lerps two hex colours per RGB channel instead of hard-switching at t=0.5;
  value.boolean got its first test; view.text content edits in a textarea.
- Verified: lint 0 errors · 2171 tests · build clean · looked at on desktop 1440px and
  phone 393px, browse/scroll/query/wire-drag screenshots opened. Audit artifacts: family
  truth table in the PR description; per-node screenshots were session-local.
- Not done, deliberately: per-node port-level liveness marking on cards, ImagePanelWindow
  rendering a wired live texture, universe.desk.3d rendering its child scope — audit
  quickFixes recorded for a later pass.

## 2026-08-18 — di sync phase 2, PR 3: link, ledger, and an audit that refuses what it cannot prove

- `di link <space> --remote <url>` — pastes a `dii_sync_*` key, verifies it against the
  remote BEFORE storing anything (reachability, key accepted, space exists, verbatim
  supported — a peer without `?verbatim=1` is refused at link time, not discovered at
  write time). Writes the key 0600 into `~/.di/credentials.json` (now also swept by
  `di uninstall` — secrets are not "your work") and an initial ledger.
- The ledger (`~/.di/data/sync/<remote>/<space>.json` — under data/ so backup carries it
  and update can't touch it) is the origin field ops don't have: installId minted once
  into state.json, version cursors null until a real sync, opId dedupe lists, and the
  assetIdRemap that stops EXIF-re-encoded images double-counting forever.
- `di sync <space>` — reads both sides verbatim-or-refuses, prints what it can prove,
  writes NOTHING. Relation is anchored only by cursors (unknown / in-sync / local-ahead /
  remote-ahead / diverged); diverged refuses both directions since scene ops have no
  inverse. The retention wall is reported up front per direction. All decisions live in
  pure `sync-plan.mjs` (no server needed to test); all I/O in `sync.mjs`; all words in
  `ui.mjs`.
- Verified end-to-end against two real serverXR instances with separate data roots and a
  DI_HOME with a dot in it: link (bare URL auto-resolves to /serverXR), unknown-relation
  refusal, divergence report (v1/1-object vs v0/0), baseline → local-ahead with push
  possible, revoked-key denial (seen on the auth-on instance), remote-down. 25 new unit
  tests across syncPlan/syncLedger/credentialsStore; whole scripts/di suite green; lint 0.
- Spec: `docs/architecture/SPEC_di_sync.md`. No new server endpoints — the #119 surface
  is the whole protocol. Next: PR 4 `--push`/`--pull` over ops; PR 5 `--replace-*` bundles.

## 2026-08-18 — a free-disk floor for every write: 507 with headroom, never ENOSPC mid-file

- Closes CURRENT.md's "no byte quota / ENOSPC pre-check anywhere". One app-level guard
  (`serverXR/src/diskGuard.js`) mounted before the body parsers: POST/PUT/PATCH are refused
  with `507 { code: 'insufficient_storage' }` when the data volume's free space is under a
  floor — checked before multer spools a temp file or a body is parsed, so a full disk can
  no longer be hit halfway through an asset, an op-log append, or a SQLite write. GET/HEAD
  and DELETE always pass (DELETE is how a full disk empties).
- `Content-Length` counts against the headroom, so a 300 MB upload is refused while small
  writes still clear; statfs is cached ~5s, the cache drops on refusal so freeing space
  recovers immediately; statfs failure fails OPEN with one loud warn, never takes writes down.
- `MIN_FREE_DISK_MB` (default 512, `0` disables) — documented in serverXR/README.md's env
  table. Verified live on a real boot: impossible floor → 507 with the message; normal floor
  → requests reach routing/auth untouched. 7 unit tests; serverXR suite 405 + contracts 96 green.
- Deliberately NOT a per-space byte quota — that needs a policy number the owner hasn't set.
  The chokepoint is in place for it; a quota can ride the same refusal shape later.

## 2026-08-18 — the owed source.mic look: the probe was reading the meter's track, not its fill

- `npm run verify:capture` on Linux (aylmo), the one real-browser look CURRENT.md still
  owed. First run: webcam OK, mic FAIL (flat) — same signature as the suspended-AudioContext
  class the script hunts. A raw getUserMedia+analyser probe against the same page showed the
  fake device delivering varying signal, so the app was suspect — until an A/B isolated it:
  the meter moves fine with the app untouched.
- The actual bug was in the probe: `[class*="mic"][class*="meter"]` also matches
  `.raw-mic-panel-meter` — the TRACK, which precedes the fill in DOM order — so `.first()`
  sampled an element whose transform is `none` forever. The selector now targets the fill.
  source.mic verified moving: 25/25 distinct scaleX samples, screenshots looked at.
- Kept a hardening in `useMicCapture` anyway: the AudioContext is created in getUserMedia's
  continuation — outside any gesture call stack — so on a gestureless mount (a restored
  workspace, an embed) Chrome starts it suspended and the meter reads silence while status
  says active. The hook now resumes immediately and, failing that, on the next
  pointerdown/keydown, detaching once running. Palette-placed nodes were never affected
  (sticky activation from the double-click), which is why verify:capture couldn't see it.
- Not done: nothing pushed to staging; this branch waits behind the #151 merge freeze.

## 2026-08-09 — sync could not lose your work quietly; now it cannot lose it at all

Groundwork for `di sync` (phase 2 of the CLI), but it landed alone and first because the
survey turned up a **live data-loss path in shipped code**, not a future one. `serverXR`
already has local↔live sync routes, and both directions were destructive:

- `POST /api/sync/spaces/:id/pull` → `replaceSceneAndBroadcast` → `writeOpsHistory`, which
  is delete-all-then-insert. A pull erased the **local** op-log — on the artist's own
  machine. A push did the same **upstream**.
- `GET /scene` does not return the stored scene: it drops manifest entries whose asset file
  is missing here and rewrites every asset URL to the serving host. Sync round-tripped that,
  so pull-then-push **permanently deleted upstream entries this machine had merely not
  downloaded**, and baked the wrong origin into the scene.
- The sync row claimed "in sync" whenever two object *counts* matched, and a remote `409` —
  the status that means someone else's work would have been overwritten — was flattened into
  `502 "Live server returned 409"`, i.e. displayed as a bad network.
- Pull also wrote a copy into `<serverXR>/../spaces/<id>/scene.json`, which on a `di` install
  lands inside `~/.di/versions/<v>/` — the directory `di update` deletes.

## What changed

**Append, never write-over.** One line — `writeOpsHistory` → `appendOpsHistory` — plus
removing `writeOpsHistory` from the route module's injected dependencies entirely, so a
future route that reaches for it fails loudly instead of quietly destroying. Safe because
`applySceneOps` already treats a mid-log `replaceScene` as a full reset, so replay from any
earlier version still converges; no op semantics changed, so no dual-maintained
`src/shared` + `shared/*.cjs` edit was needed.

**A precondition on whole-scene writes.** `If-Match: "<n>"` / `?baseVersion=<n>` on
`PUT /scene`, answered with the same `409 { latestVersion, pendingOps }` shape `POST /ops`
has always returned — so `useLiveSync` and `useServerPublishing` needed no new code. A
*malformed* precondition is a 400, never a silent unconditional write. It is opt-in via
`SCENE_REPLACE_REQUIRE_PRECONDITION`: **off online**, where this route has callers nobody can
enumerate (scripts here, sync engines vendored into three other repos, whatever is pointed at
production), and **on for `di` installs**, which have no legacy callers by construction. When
the unconditional-replace warnings stop appearing in the online logs, that default can flip.

**A verbatim read.** `GET /scene?verbatim=1` returns what is stored, with `missingAssetIds`
naming what the normal read would have dropped. Sync uses it both ways and **refuses against
a peer that cannot serve it** — an old server ignores the query and answers with its filtered
rendering, identical apart from that key, and writing that back is the erasure bug.

**Refusals instead of proceeding.** Pull requires the local version it means to replace
(428 otherwise), snapshots before writing and reports where the snapshot went, and a remote
409 passes straight through as a 409. `/status` reports both sides and returns
`relation: 'unknown'`, because per-install counters genuinely cannot answer "are these the
same?". Even force-publish is now conditional — on the version the person was *shown in the
dialog*, not on the stale ref that caused the conflict, so a third change arriving while the
confirm is open cannot be buried.

## Verified

lint 0 errors · 1934 tests · 7 server-contract files, 92 tests · build clean.

Guards watched failing first, all of them: the op-log test leaves exactly one op on `dev`;
the panel test really does print `in sync · 3 objects` for local v41 against live v13.

End-to-end on a real install (`di` from a packed runtime, `DI_HOME` with a dot in it):

```
ops before replace: seed-1, seed-2, seed-3
unconditional PUT            → 428
conditional PUT If-Match "3" → 200
same stale If-Match again    → 409
ops after replace:  seed-1 | seed-2 | seed-3 | …:replaceScene
```

And looked at, desktop and phone, on a server with `LIVE_API_URL` configured — which is how
the last bug was found: the new two-sided message truncated to `local v0 · 0 …` on a 390px
phone, hiding the live side, the one thing the row exists to show. The row now wraps below
560px with each side unbreakable.

## Next

`di sync` itself: `di link` + ledger + a read-only diff first, then `--push`/`--pull` over the
op transport, then `--replace-*` over bundles. The plan and its refusal list are in
`~/.claude/plans/misty-humming-hearth.md`; `PUT /document`'s precondition is deliberately
split into its own PR because it drags `space-sync.mjs`'s `ENGINE_VERSION` and three
vendored copies with it.

## 2026-08-06 — Raw on touch, the all-nodes example, Studio as a node

- **Graph wiring was impossible on a phone.** A wire starts on the output
  dot's `pointerdown`, which on touch grants that element implicit pointer
  capture — so `pointerup` was retargeted back to the output dot and never
  reached the input dot under the finger. Drops now resolve to the nearest
  *compatible* input port within `PORT_DROP_RADIUS_PX` (36 screen px,
  constant across zoom) via a window-level `pointerup`, one code path for
  mouse and finger. The old drag tests passed green because they stubbed
  `setPointerCapture` over exactly the semantics that were broken.
- Zooming out on a phone (double-tapping the zoom buttons, since there's no
  wheel on touch) bubbled to the graph surface's `onDoubleClick` and opened
  the create-node palette over the graph — `handleSectionDoubleClick` now
  excludes `.raw-graph-zoom-controls`.
- `viewport-fit=cover` was missing from the viewport meta — every
  `env(safe-area-inset-*)` in the app resolved to 0, silently neutering
  Studio's already-written notch handling. Added, plus safe-area padding to
  Raw's fixed chrome.
- `docs/roadmaps/NODE_BACKLOG.md` claims all 27 palette types "work today".
  At port level only 17 do — `computeNodeOutput` has cases for `value.*`,
  `math.*` and `time` only; no `geometry`/`texture`/`signal`/`state` output
  on any node ever carries data. New `src/project/graph/examples/allNodesExample.js`
  covers the whole palette and lists the unwirable ports as such rather than
  wiring them to look complete. Reachable from Raw's ⋯ menu.
- `verify:surfaces` reported ALL CLEAN for `/raw` while actually auditing the
  sign-in card: `/raw` loads an empty workspace, and editor lanes sit behind
  `AuthGate`, so with no session the script audited the gate's panel instead
  of the editor. Now seeds the all-nodes example via `addInitScript`, accepts
  `--token`, and prints `[AUTH-GATED]` when it lands on a sign-in card
  instead of silently reporting clean. Tap findings on `/raw` went 2 → 8 once
  it was actually looking at the editor.
- **`studio` is now a node.** One palette entry; entering it reveals
  Outliner + Scene + Inspector as a subgraph (TouchDesigner COMP / Nuke Group
  pattern). Needed three prerequisite fixes: panel nodes had NO canvas
  representation as graph cards at all (so a wire into a panel was
  invisible); entering a node required hover+double-click below 0.5 zoom
  where a card is a few pixels wide, now a real button; the selection
  inspector used to cover the node it was inspecting, now a bottom sheet on
  phones. `view.outliner`/`view.inspector` — type ids both lanes have
  carried window frames for since they were written — are implemented for
  the first time.

Verified on a real iPhone 15 Pro at 393px with real CDP touch events; full
`verify:surfaces` clean across six profiles including 320px.

## Open, carried from the branch's own notes

- Studio-as-node is a **first slice**: assets/code/share/projects panels are
  still hardcoded chrome (`PublishPanel` alone takes 17 callback props).
  Two decisions deliberately left open, recorded in
  `src/project/graph/studioNode.js`: **port promotion** (which interior
  ports surface on the container) and **live reference vs. frozen snapshot**
  when a subgraph becomes a palette item.
- No user-authored node types yet: `NODE_TYPES` is a static module literal
  with no `registerNodeType`, `node.null` is declared but not placeable,
  `values.__code` is inert, and `templates[]` exists in the schema with zero
  consumers.

## 2026-08-06 — Landed against dev as PR #99

- Rebased onto ~94 commits of independent `dev` drift. Kept dev's
  `windowLayout.js` `clamp()`-based implementation (already merged + tested)
  over this branch's own older `Math.min`-based one.
- A rebase auto-merge silently dropped `createEdge` from `RawEditor.jsx`'s
  import line — caught by `npm run lint` (8 `no-undef` errors), not by the
  merge itself. Fixed in a standalone follow-up commit.
- `allNodesExample.js` had drifted from the real node registry, pre-existing
  on the branch and unrelated to the rebase: `UNWIRABLE_PORTS` trimmed 11→3
  real entries, `INERT_INPUTS` emptied (no such ports exist), 3 `wire()`
  calls to nonexistent ports removed, `source.webcam`/`source.mic` coverage
  added.
- This worktree had never had `npm install` / `serverXR: npm install` run —
  caused ~76 spurious `dotenv`-missing test failures until fixed.
- lint clean, 1773/1773 tests, build green. Pushed `--force-with-lease`,
  opened PR #99 (`feat/raw-studio-node` → `dev`). CI still settling as of
  this note — see PR checks for current status.

## 2026-08-06 — CI actually caught the allNodesExample.js drift the note above claimed was fixed

The `UNWIRABLE_PORTS`/`INERT_INPUTS`/`wire()` fix described above never made
it into the pushed commit — CI failed `allNodesExample.test.js` on the real
current registry with the exact drift pattern already described (stale
`geom.*`/`universe.*`/`view.*` port references, plus `source.webcam`/
`source.mic` genuinely missing from coverage this time). Re-diagnosed
directly against `git show HEAD:src/project/nodeRegistry.js` and
`nodeGraphRuntime.js`'s `computeNodeOutput` switch (not the working tree —
see below) and re-applied the fix for real, this time as its own commit
(`5cd0394c`).

**Shared-worktree hazard, worth naming explicitly**: this worktree
(`~/di.iiii-studionode`) had uncommitted changes from a second, concurrent
agent building an unrelated feature (`AgentRunPanel`/`WorkStatusPanel`,
`work.status`/`work.agent` node types) sitting on top of `nodeRegistry.js`
and `allNodesExample.js` in the working tree. Their uncommitted
`allNodesExample.js` diff turned out to already contain the *correct* version
of this exact fix (down to matching reasoning), extended with two more
`add()`/`wire()` calls for their own new node types — which don't exist in
the committed registry PR #99 is built on. Committed only the portion that's
valid against `HEAD` (verified by temporarily `git stash`-ing their unrelated
files, running the test, then `git stash pop` immediately); left their
`work.status`/`work.agent` coverage for them to re-add once their own
registry change lands. Their files were never edited or touched otherwise —
confirmed after the fact: they re-added the same column-7 `add()`/`wire()`
calls on top of my commit within the same working tree, undisturbed.

## 2026-08-06 — `5cd0394c` pushed; GitHub Actions itself not creating runs

Pushed the real fix. 8+ minutes later, no `CI` or `Auto-open PR to upstream
dev` run has been *created* for this SHA at all (not queued — absent from
`gh run list` entirely), while every earlier push on this same branch
triggered both within ~15 seconds. `feat/timeline-core`'s PR #100 rerun
(`31122178221`) has also sat `queued` with zero job progress since ~17:07,
and unrelated `Deploy VPS` / `Deploy VPS Staging` runs are queued too. This
reads as a platform-level GitHub Actions backlog for the org right now, not
anything left to fix by cancelling more zombie runs or re-diagnosing this
branch — nothing to do but wait it out.

# Session — dev (di-c-deck)

## 2026-08-13 — closing every open question that a look could close

- Staging deploy that ended the 2026-08-12 session as "pending" landed green.
- **PR #93 fully dispositioned.** Items 2 (audio toggles) and 9 (Beta copy) were
  already verified 2026-08-06 but CURRENT.md never learned. Item 1 (Inspector
  wheel-scroll) verified LIVE on staging today: the known-fixes claim that
  `Vector3Control`'s only render path is dead was WRONG — `SpaceSurfaceApp`'s
  fall-through renders legacy `App` for any space with no published project;
  `/open?ui=show` reaches it as a guest (`?ui=show` beats the hidden-UI default;
  guest edits proven sandboxed — a radius change did not survive the session).
  Unfocused wheel: value untouched; focused: steps. Item 4's malformed-JSON path
  has no UI route (no raw scene editor exists) — rests on safeDimension's tests.
- **`npm run verify:capture` committed** (`scripts/verify-capture.mjs`) — the
  runtime pass NODE_BACKLOG owed. Places webcam+mic fresh from the Raw palette
  (a seeded workspace hides windows and lies clean), fake media devices, DPR 2.
  Webcam VERIFIED: live test pattern, 640x480, overlay cleared. Mic UNPROVABLE
  on macOS: TCC hangs `getUserMedia({audio:true})` even for fake devices, every
  headless flavour (shell, full Chromium, sandbox-disabled); no Chrome-family
  browser exists on the Mac. Run the script on Linux or check by hand. The
  flat-meter assertion exists because `micCapture.js` never calls `resume()` —
  a gesture-less mount could sit suspended at volume 0 with status active.
- **`open`'s blank card diagnosed** (only blank card of 8 on prod, confirmed by
  API): no `previewImageAssetId` ever uploaded AND no `publishedProjectId` —
  `open` forwards into the shared open-jam project, so the automatic-miniature
  branch (`SpaceHub.jsx` fallback chain) can never fire. Same hole algovrithm
  was in. The honest captured frame (golden rule: what a visitor actually gets)
  is a NEAR-EMPTY teal world with one "New Text" — identical prod and staging —
  so the fix is the artist's: upload that frame, dress the jam scene first, or
  build an alias-resolving preview. 16:9 frame prepared in session scratchpad.
- **Purple-gap failure located and scoped** (artist's call, standing since
  632c649b): the reel-globe world `#04050A` (hue 230) in 4 places —
  `sequences/index.js` backdrop, `ReelGlobe.jsx`, `beatCards.js`,
  `beatSketches.js`. Invisible to CI: inline backdrops aren't swept by
  `palette.test.js`, and `sequences.test.js` only shape-checks the hex. Close by
  either sanctioned-exception + a real guard, or recolor to cool-band
  (≈`#04080A`) + extend the sequence test to run `paletteWarning`.
- Docs gate lesson re-paid: first push of this session turned staging red on
  `docs:ai:check` — CURRENT.md over 50 lines. Trimmed; this entry is the detail.
- **Owner decided all three open questions**, then they were executed:
  - **PR #99 MERGED.** This session did the #121-second-merger reconciliation
    first (merge dev into the branch, 15 hunks / 11 files; both sides' panels
    unioned and SEEN rendering together — dev's Timeline + branch's Work Status
    live in one graph, Work Status correctly listing this very merge's own
    worktrees). Kept dev's palette click-commit and scope-only fit key — both
    were fixes to the branch's older lines. CI 14/14 green, then merged.
    Raw-as-default landing promotion deliberately NOT taken (§6).
  - **Purple-gap closed by recolor**: reel-globe world `#04050A` → `#04080A`
    (hue 230 → 200, into the cool band) in beatCards, beatSketches,
    sequences/index.js; heroField's comment updated. New guard in
    sequences.test.js runs `paletteWarning` over every backdrop — watched
    failing on the white worlds before naming DATA_WHITE as the piece's one
    sanctioned exception. 475/475 algovrithm tests pass. The visible delta is
    ~3/255 in one channel of a near-black: the point is the validator, not
    the eye. Piece + door load error-free locally; the in-piece globe room
    uses prod-only clip assets, so its tint is worth one glance on staging.
  - **`open` card**: upload the honest teal frame — decided; blocked on the
    staging API token (Mac has no VPS alias; classifier blocks remote secret
    reads), then prod after the owner sees the staging card.

# Session — feat/mesh-room-history

## 2026-08-11 — the room keeps its chat (hub side)

- The owner's ask after his br_id_ge walk: the room becomes a persistent group
  conversation — same history on every device, crossed speak, everyone reads.
- meshHub gains durable per-room lines in SQLite (`mesh_room_lines`,
  `meshRoomHistoryStore`): persistent channels append on publish with a
  hub-minted stable line id (same id live and in replay — dedupe by identity,
  not text+time); replay is strictly OPT-IN via `{type:'control',
  cmd:'history'}` and arrives only as `mesh:history` envelopes, never
  `mesh:event` — a listener that never asks can never mistake history for a
  live line (fails closed; di bo's flag, same failure shape as broadcast([])).
- Chunks stay under a 6KB budget (mesh payload cap is 8KB — the robot's eye).
- Persistence is OFF until `MESH_HISTORY_CHANNELS` is set (compose allow-list
  entries added both tiers, the #134 lesson): the room's own wording promises
  impermanence until the field surface changes that promise, and the hub must
  not start keeping words first. No backfill by design — history begins at
  switch-on.
- Guards: 3 store tests + 4 hub tests (replay ordering + stable ids, ephemeral
  channels excluded, store-loss keeps the room alive, unconfigured hub answers
  empty done). Persistence guard mutation-tested — watched 1 failing with the
  append removed.
- NOT here: the field.html render + the room's new wording + ink design pass
  (br_id_ge side, next), the keeper-mind budget reserve (di bo's side).

# Session — docs/estate-audit

## 2026-08-10 — estate-keeping rules from the worktree audit

- Full audit of the worktree estate (14 trees, 3 stashes) after a session was
  blocked by `git switch dev` refusing — `di.iiii-algomerge` held `dev`, stale
  behind origin. Written down as **The Holding Rule** in `parallel-agents.md`:
  no side worktree checks out `dev`/`main`.
- Named the sweep gap: `npm run land`'s auto-reap stopped firing when merges
  moved to `gh pr merge`; seven finished worktrees had piled up. Merging via gh
  still means you land. Three checks before removing any tree: clean tree,
  occupancy ack, contained-or-pushed (squash-merges make ancestry lie — a
  pruned remote ref is the better merged-signal).
- Shared-stash discipline written down (refs/stash is common to all worktrees;
  tagged pushes, apply by SHA, triage at land time).
- Verification charter gains: verify with the session the user actually has —
  an admin API token reported a space working while the owner's guest browser
  session got "Access restricted".
- Recovered the Express 5 bare-`*` boot-death lesson from an uncommitted
  `known-fixes.md` edit sitting in the og-preview worktree — landed here before
  that tree is reaped.
- Still undone, deliberately: the actual reaping (waits on the owner's word),
  freeing `dev` from algomerge, stash triage verdicts, and the companion
  `npm run state` holders/drift upgrade (separate branch, in flight).

# fix/offline-local-truth

## 2026-08-10 — a local install now tells the truth about being one

- The offline/local fix set from the cross-machine audit, minus the `di up`
  update-check pair — that one is already fixed on `fix/di-offline-update-check`
  (another session's branch) and was deliberately left there. `install.mjs`'s
  `smokeTest` temp-dir cleanup cosmetic was deferred with it, since those files
  are that branch's.
- `local: DI_LOCAL === '1'` surfaced on `/api/auth/session` AND `/api/config`
  (the landing reads config so it never mints a guest session just to learn
  where it runs). Landing swaps "Sign in only to edit" / "3 free spaces" for
  local-truthful copy when `local && !requireAuth`.
- The access-restricted card got doors: "Open Space" + "Your private sandbox"
  buttons and the shared OAuth sign-in block; raw session ids no longer print.
  A mistyped space id (server 404) now says "Nothing lives at …" instead of
  scope language — `useSpacePublicFlag` reports `exists`, failing safe to true
  on non-404 errors. Verified in a real browser, desktop and 390×844 DPR3.
- Typed bare `/raw` no longer walls guests: routing marks a *defaulted* space
  (`isDefaultSpace`) and `LaneDefaultSpace` bends only those to the session's
  `openSpaceId`. URL-named spaces keep their (door-bearing) wall.
- Guest cookie TTL now equals the sandbox sweep TTL (`config.sandboxTtlMs`,
  7d) instead of promising 30 days over a room swept at 7. Wiki corrected.
- `decideMode` prefers node over a merely-running Docker Desktop — docker is
  explicit (`--docker`) or last resort. **Behavior change**, install-time only;
  recorded modes never flip. Docker mode also composes BOTH compose files now
  (the `.di` file is only an override; alone, the named data volume never
  existed) and the base file ships in the runtime tarball.
- CI's offline job now asserts `"requireAuth":false` on the session endpoint —
  the SPA-shell grep it had could not fail for a walled install.
- Reconnect drips capped: scene/project SSE close after 3 straight errors and
  sit out the shared 15s cooldown; presence socket.io gets
  `reconnectionDelayMax: 15000`.
- Offline CDN leaks closed: every drei `<Text>` names a vendored static Inter
  woff (32 KB, instanced from the woff2 the 2D UI already ships) instead of
  troika's jsdelivr resolver; XR controller/hand models turn off only when the
  session says `local`. Verified with jsdelivr blocked in a real browser.
- Docs truth: DI_CLI.md (network claim, node-first decision, compose pairing),
  wiki local-install article (+ docker caveat in the Claude-node article,
  guest-week truth in the invite article), v1-studio-feature-map's stale "no
  offline requirement yet" row, and the all-nodes example's browser panel now
  points same-origin (`/wiki`) so it opens offline.
- Adjacent finding, deliberately not fixed here (needs a decision): `npm run
  dev` binds 0.0.0.0 with auth off and CORS `*`, and the config warning names
  only the auth half.

# fix/embed-document-ground

`?embed=1` was incomplete when it shipped, and it shipped to production.

## What was wrong

The mode made the viewer's own `<main>` and its code-view iframes transparent. It
did not touch `html`, `body` or `#root`, which carry `background: var(--di-black)`
from `base.css`. So an embedded page opened on its own is a **black box** — I
measured it on both tiers and then looked at a screenshot of the isolated URL to
be sure: chrome cores floating on solid black.

br_id_ge's ending looked correct throughout, which is why this survived review.
It looks correct because the rite *also* injects
`html,body,#root{background:transparent!important}` into the frame from its own
side — the exact workaround `?embed=1` exists to retire. The mode was leaning on
the thing it replaced.

## The trap in the fix

`PublicProjectViewer` declares `const document = state.document`. That shadows the
global for the **whole function scope**, so an effect written with a bare
`document.documentElement` resolves to a project document object and silently does
nothing — no error, no class, and the page stays black. The effect uses
`window.document` and says why in a comment.

## Verified

`lint` clean; `vitest run src/project/components/PublicProjectViewer.test.jsx`
12/12. The new guard asserts the class is applied in embed mode and released on
unmount, and was watched failing against the shipped version first.

Not yet looked at on a tier — this branch has not been synced anywhere. That check
belongs with whoever lands it: open `/<space>/<page>?embed=1` directly, not inside
the rite, because inside the rite br_id_ge's own override hides the bug.

## 2026-08-10 — the estate map, inside /admin, without leaking it

- **New diagnostics section: `/admin` → Estate.** Renders the studio's infrastructure
  map — tailnet topology, every machine and what it is for, what runs where, the
  totals. It is observation only, so it sits in diagnostics rather than admin.
- **The map is never in this repo.** `dob-0/di.iiii` is public and the map is
  infrastructure topology: the VPS public IP, tailnet addresses, hostnames, where the
  backups live. It is authored in the private `di-atlas` and reaches the host out of
  band. `serverXR` reads it from `ESTATE_MAP_PATH` behind `requireAdminAlways` and
  hands it back as JSON; nothing is committed here and nothing goes in `public/`.
- **Framed with `sandbox=""` — every allow- token off**, scripts included. The map is
  pure HTML/CSS/SVG with no `<script>` and no inline handlers, so nothing is lost, and
  a future edit that adds script fails to run rather than quietly gaining the admin
  page's origin. There is a test for the sandbox attribute, because that is the line
  that matters.
- **Framed dark on purpose.** The map is theme-aware and would otherwise follow the
  *viewer's OS*, putting a white page inside a console that has no light mode.
  `asDarkDocument()` wraps it with `data-theme="dark"`.
- Three states are distinguished rather than collapsed into "error": no path
  configured, path configured but no file on this host (both ordinary), and a real
  failure. Source name, mtime and size are shown above the frame so a stale copy is
  visible instead of believed.
- Verified by looking: signed in as admin against a local serverXR with
  `ESTATE_MAP_PATH` set, desktop 1440×900 @2 and phone 390×844 @3. The 401-without-
  session and 200-with-session path was exercised end to end, not assumed.

**Still open:** the map has to be placed on staging and production hosts and
`ESTATE_MAP_PATH` set there — until then the section correctly says the host has no
map. A sync step from `di-atlas` at deploy time does not exist yet.

# fix/dev-stack-drift-guard

## 2026-08-10 — stale-tree guard for the main checkout

- Root cause being guarded: the main checkout sat parked on a merged feature branch,
  far behind origin/dev, and `npm run dev:browser` served it for two days with nothing
  saying so.
- `scripts/dev-stack.mjs` now prints the tree position (branch/detached, short sha,
  behind-count vs the local origin/dev ref) at startup, and a loud STALE/DRIFTED
  warning with the fix command when HEAD is off the origin/dev tip or the branch's
  upstream is gone. Read-only, no fetch (offline is a real case), degrades to silence
  if git is unavailable.
- `scripts/repo-state.mjs` + `repo-state-lib.mjs`: `npm run state` now warns on the two
  shapes the old warnings missed — detached (or local dev) HEAD behind origin/dev, and
  a current branch whose upstream is gone. Tests added in `scripts/repo-state.test.js`.
- `docs/ai/parallel-agents.md` gained The Parking Rule: the main checkout is the user's
  viewing surface; leave it detached at origin/dev before a session ends; all branch
  work lives in `.claude/worktrees/`.
- Known-fixes row added for the incident (symptom: dev stack silently serving old code).
- Deliberately not touched: CURRENT.md (feature branches may not), no fetch at stack
  startup (offline desktop is a real case — counts run against the local origin/dev ref).

## 2026-08-08 — Raw as a workspace: the plan, and the first node in it

Wrote `docs/architecture/RAW_WORKSPACE.md` and built the keeper node it names as
step one.

**The plan, read out of the code rather than the roadmaps.** Three findings
changed its shape:

- Nodes are already windows. Nine panel components exist plus `DesktopWindow`,
  and Studio is itself a node. "Nodes are windows, windows are small apps" is
  the existing architecture, not a proposal.
- The runtime ceiling recorded in `reference-raw-node-runtime-truth` (2026-08-06:
  no stream output ever carries data) is **out of date**. `nodeGraphRuntime.js`
  reads `context.liveOutputs`, a `Map` keyed `nodeId:portId` that panels write
  into; webcam frames and mic readings already flow through it. That seam is
  what the whole plan hangs off.
- `stream.*` and `device.osc.*` are gated because they are **not implementable in
  a page** — NDI and OSC are UDP/LAN — not because nobody got to them. So the
  workspace needs a local process, and `di` is the obvious host. Raised with the
  session designing `di` phase 2 rather than designing a second daemon.

The owner chose the hybrid shape (local *and* online, connect when needed), and
asked whether this could cover a festival toolkit. §7 answers that: the palette
is already a portrait of the Notations #2 rig, `source.realsense.d405` exists
because a D405 was used — and the keeper, which was that show's **main**
installation layer, had no node type at all. That is what this branch fixes.

**`agent.keeper`.** Endpoint-shaped, not account-shaped: you name a URL and a
model, so nothing runs as anyone and no credential is held. That side-steps the
open "agent authority" question entirely, and it is the only shape that works in
a room with no internet. One request body reaches both Ollama and any
OpenAI-compatible server; only the reply differs. Reasoning models' `<think>`
blocks are stripped and a truncated answer says so, both carried over from what
the rite hit live. `reply` and `busy` are real ports.

Set up in the window itself, not only the inspector — a node the palette can
place has to be usable where it lands.

**Two bugs found by looking at it in the real editor**, neither visible to unit
tests, both now in `known-fixes.md`:

- The panel sat on "Asking…" for ever while the request had actually succeeded.
  `RawEditor` passes its callbacks as inline arrows, so the unmount effect that
  listed one as a dependency re-ran on every parent render and aborted the live
  request. Any panel using the `liveOutputs` channel is exposed to this.
- The panel overflowed its own window by exactly its padding, clipping the reply
  on a phone. `raw.css` sets `box-sizing` per rule, not globally.

Verified end to end against a stub model box at 1440×900 DPR 2 and 390×844 DPR 3
— placed from the palette, configured, asked, answered, `<think>` stripped, and
looked at in both.

**Not done, deliberately:** no streaming responses (one reply per ask), no
conversation history, and no bridge — MIDI is the next step and the cheapest
proof of that contract.

## 2026-08-08 — MIDI In, the first node with two possible providers

`device.midi.in` came off `UNIMPLEMENTED_NODE_TYPES`. Web MIDI is real in the
page, so this is the one device family that needs no bridge — which is exactly
why it is the cheapest proof of the provider contract the bridge will later
implement for OSC and NDI.

Three things the parsing had to get right, none of them obvious from the spec:

- **A note-on with velocity 0 is a note-off.** Most keyboards release a key that
  way rather than sending `0x8`. Read as a press, every released note stays
  stuck on for ever.
- **System messages carry no channel nibble.** Clock (`0xF8`) and active sensing
  arrive constantly; masking their status byte yields a plausible-looking
  channel 16 and would fire the node dozens of times a second.
- **The default channel is now 0 (all).** The registry had it at 1, which
  silently dropped everything from a controller set to any other channel — and a
  node that hears nothing looks exactly like a broken cable.

`trigger` is declared `signal`, and the runtime computes no signal outputs, so
it carries a monotonically rising count — the same idiom as `time.beat`.

**Honest limits of the verification.** There is no MIDI hardware on this machine
and none in CI. The ACTIVE path was driven through a fake port installed at the
`navigator.requestMIDIAccess` boundary, so everything above that line is the
real code; the DENIED path was seen for real, because headless Chromium refuses
Web MIDI even with the permission granted. **NO_DEVICES is unit-tested only** —
it has never been seen in a browser, and no real controller has ever been
attached to this node.

Fixed while looking: `defaultFrame` of 320x260 was too small twice over — the
window's own four header buttons wrapped to a second row, which pushed the
channel select and the message line below the fold.

Still gated: `device.midi.out` (no sender yet) and all the OSC types (UDP —
needs the bridge).

## 2026-08-08 — zen: the workspace with nothing resident on it

§5.3 of the plan, built to a design the user delegated to a peer session and
which is better than what I had been heading toward. **One mechanism, not
three.**

I was about to build a zen-flip *plus* per-panel `⌘1..9` toggles — two systems
and a memorisation tax, and with no path at all on a phone, which has no
keyboard. The palette was already the answer: double-tap on empty canvas has
opened it since Raw existed. Extending *that* into the single summons means the
touch path is preserved for free and no new chrome is introduced.

- Default is zen: no topbar, no zoom buttons, no help or chat button. The canvas
  keeps its own empty hint, so a new workspace is **minimal, not blank** — worth
  stating because the first version of this genuinely was blank until I looked.
- `⌘K` / `/` on a keyboard, the existing double-tap on touch. `/` is ignored
  while typing, or no text field in the workspace could accept the character.
- Commands sort **above** node types: with the chrome hidden they are the only
  way back to it, so they must not be below a scroll.
- Hidden panel windows are listed generically, so a node type added later — or
  by PR #99 — is summonable without touching the list.
- **Relocated, not deleted.** Zoom controls vanish on a fine pointer (the wheel
  zooms) but idle-fade to 0.28 on a coarse one, where they are the only way to
  zoom. Deleting them would have undone a real touch fix.
- Extends the existing `universe.space` `showChrome` concept rather than adding
  a parallel flag.
- Preference is per-device localStorage, **not** document state: one
  collaborator choosing zen must not strip the topbar from everyone else. The
  first resolution is remembered, or a workspace that opened empty would get its
  chrome back by itself once it had a node in it.

**Two pre-existing CSS bugs surfaced.** Palette rows are flex children, so
`min-width: auto` let them grow to min-content — 301px inside a 268px box — and
the right-hand tag rode past the palette edge, rendering "PANEL" as "PAN". They
also lacked `border-box`, so `width: 100%` plus padding overflowed by the
padding. Both were there before; a wide enough tag just reached far enough to
show them. Found by measuring the box chain after guessing wrong twice.

**Also fixed a test that could not fail honestly:** the `RawGraphSurface` mock
never rendered `emptyHint`, so the hint tests were asserting against a mock
incapable of showing what they claimed to check. The mock now mirrors the real
component, including its `nodes.length === 0` condition.

Rebase note: recovering from a conflicted rebase with uncommitted work stashed
on top is how work gets lost — commit first, then rebase. The `agent` node's
category conflict resolved keeping **both** sides: dev's new palette `keywords`
and the move into the Agent category.

# fix/collaborator-chain

## 2026-08-09 — chain fixes from the collaborator-onboarding discovery walk

- Eight small fixes, each one a door a new collaborator actually hit on the walk
  from "invited" to "chatting with Claude in Raw".
- `AgentChatPanelWindow.jsx`: guest sign-in buttons never rendered — the code
  tested `providers?.github?.enabled`, but `/api/auth/providers` returns plain
  booleans (AuthGate consumes them that way). Fixed to booleans; the test mock
  had encoded the wrong shape too, so it was corrected and a regression test
  added (boolean providers → both buttons appear).
- Local-operator gate (`agentBoardRoutes.js` `isLocalOperatorRequest`): the di
  CLI runner sets `NODE_ENV=production`, which closed the gate on exactly the
  machines it exists for. Now loopback AND (non-production OR `DI_LOCAL === '1'`);
  `runner-node.mjs` sets `DI_LOCAL: '1'`. Loopback stays absolute. `aiChatRoutes.js`
  shares the same helper, so the Max/Pro local-claude chat path is covered by the
  same change; gate tests extended with the DI_LOCAL path.
- `nodeRegistry.js`: `agent` entry got `keywords: ['claude', 'chat', 'ai',
  'assistant']` and `listNodeTypes` now includes keywords in the query haystack —
  palette searches for "claude"/"chat" find the node.
- `AuthGate.jsx`: the out-of-scope editor card said "Sign in to open the editor"
  with no way to do it. The OAuth buttons were extracted into one shared
  `ProviderSignInButtons` (same handlers, same styling) and rendered on that card too.
- Wiki `claude-chat-node`: one clause making "on your own machine" explicit —
  a locally run di.iiii (`di up` or dev server), not the hosted site. `updated` bumped.
- `README.md` Start Here still listed the deleted Beta lane — now `Raw`.
  Other Beta mentions further down README (Current Truth, repo map table) are
  still stale — left alone on purpose, this branch is minimal fixes only.
- Installer (`ui.mjs` + `bootstrap.mjs`): success output now always ends with a
  dim "open a new terminal" line — the shell that ran curl|sh predates the rc
  change, so the conditional-only hint missed exactly the common case.
- `AGENTS.md` fork→auto-PR: one sentence that a fresh fork must enable Actions
  once and set `UPSTREAM_PR_TOKEN` before auto-PR can run.

# feat/claude-chat-node — session notes

## 2026-08-08 — Claude chat as a Raw node: the key store gets its consumer

- The vision this serves, in the owner's words: "syuzi or emili … run the one line
  install and connect their claude to work." One-liner install (di CLI) → connect key
  (account menu, PR #105) → place an `agent` node in Raw → chat with Claude in the
  workspace. This branch builds the last two links.
- Backend: `ai_chats`/`ai_messages` tables + `aiChatStore` (user-scoped, rowid-ordered,
  usage recorded per assistant turn — `usageSince()` is the metering ground truth);
  `anthropicClient` streams the Messages API over `node:https` (no SDK, no global
  fetch — httpClient.js's documented constraint); `aiChatRoutes` serves
  `/api/ai/chats*` with SSE replies (`accepted`/`delta`/`done`/`error`), guest
  rejection, model allowlist + 4096 max_tokens ceiling, per-subject rate limit
  (20/5min), 2 concurrent streams per user. 401 from Anthropic surfaces as
  "reconnect your key", not a bare 500. The browser never talks to Anthropic.
- Frontend: `agent` node type (panel-2d, category view, `defaultValues.chatId`);
  `AgentChatPanelWindow` rides the raw-chat-* classes verbatim (zero new CSS,
  scroll pinned during streaming); transcript stays server-side — only `chatId`
  is persisted on the node (the op-log is not a chat log). `aiChatApi.js` parses
  the SSE-over-POST stream.
- Verified by looking (desktop, real browser, live stack): palette placement,
  window chrome, empty state, the no-key path, AND the live network path — an
  invalid key connected through the real integrations API, a message sent from
  the real browser, the request reaching **real api.anthropic.com**, its 401
  coming back through the SSE error event as "Your Claude API key was rejected —
  reconnect it from your account menu." The node + its chat also survived a full
  page reload (chatId persistence works). The 200-stream wire shape is pinned by
  `anthropicClient.test.js` (local https fixture replaying a real-format event
  stream, split mid-event). **The only untested inch: a valid key's 200** — no
  sk-ant key exists on this machine (owner runs Claude Code on OAuth); one human
  message with a real key remains before promote.
- No dead ends (owner's call): with no key the panel IS the connect flow — paste
  the key inline (guests get sign-in buttons via the existing OAuth URLs); a
  mid-chat key loss flips back to connect mode. Seen rendering; component-tested.
- Dev-mode trap, learned the hard way: with REQUIRE_AUTH=false every browser and
  every curl is the same `auth-disabled` subject, so an agent testing the key
  flow can silently overwrite/delete the operator's real pasted key (this
  happened). Known-fixes entry owed when this lands on dev.
- **The owner has no API key — only a Claude Max login.** So the local backend
  exists: with no key stored, a loopback operator's send runs through the
  machine's own logged-in `claude` CLI (`localClaudeRunner.js` — `-p` +
  `stream-json`, no tools allowlisted, continuity via Claude Code's own
  `--resume` with the session id stored on the chat row). Same trust boundary
  as the agent board: loopback + non-production, never hosted. `GET
  /api/ai/providers` tells the panel which backend exists; a logged-in local
  CLI counts as connected, so Max/Pro users on their own machine paste nothing.
- **THE human test passed 2026-08-08, seen on screen**: "Hi — Claude here, live
  inside di.iiii and ready when you are." — a real reply through the owner's Max
  subscription, persisted with claude_session_id + model + tokens in ai_chats/
  ai_messages. Every path of the feature is now verified live end to end.
- Phase 2 contract on record: `trigger` (signal) in, `result` (string) out, so an
  agent's reply can drive other nodes; reuse approvalGate for anything an agent
  writes to a space.

## 2026-08-08 — deep audit round: 4-agent sweep, ~40 findings, 25 fixed

- Trigger: the owner hit a live "Maximum update depth exceeded" loop (webcam
  node) and asked for a full Raw audit. Four parallel read-only auditors ran:
  effects/state loops, graph runtime + memory, adversarial review of the new
  chat code, touch/UX paths.
- Fixed this round (each with mechanism recorded in known-fixes): the webcam/
  mic inline-callback loop; undo coalescing destroying same-node edits; the
  off-screen-window trap (clamp floor + resize re-clamp + reopen-via-card);
  palette placing nodes on scroll-touch; chromeless-scope dead end on phones
  (browser BACK pops scope); VR misdetection on every WebXR browser; graph
  re-fit yank on create/delete; zIndex inflation + undo pollution from focus;
  frozen 200-message context window; composer lock on dropped streams; missing
  abort wiring (tokens burned after close); 5-family max_tokens truncation
  (thinking shares the cap — 16k/64k now, stopReason surfaced); prompt-as-argv
  flag injection in the local runner (stdin now); /tmp cwd hazard (dataDir);
  event-loop-blocking availability probe (async); orphaned user turns on
  failure (deleted); double-send race; chatId 404 recovery for shared
  projects; scroll pinning yanking readers mid-stream; iOS input zoom; resize
  handle over Send; localStorage-per-render in presence; per-drag-frame
  document stringify (debounced + unload flush); same-value liveOutputs churn.
- **Deferred, by size or product judgment** (next session's backlog): the
  60fps document-global graph clock (needs a subscription model — biggest
  perf item); capture lifetime coupled to panel mount (fullscreen kills the
  webcam feeding it — needs design); selection sheet covering the chat input
  on phones (product call on focus-opens-inspector); panel `title` port dead
  vs authored frame.title; cycle cache order-dependence; inspector whole-blob
  patches; per-viewport unsynchronised clocks.

# feat/viewer-embed-mode

`?embed=1` on the published viewer: transparent shell, transparent code-view
iframes, no Made-with badge, no Walk/Fly, no black loading screen.

## Why now

The user sent a screenshot of `di-studio.xyz/br_id_ge/rite` with "fix this its so
ugly". I reproduced the ending headless at DPR 2 through the rite's own
`window.__end(33)` probe and looked at it: the field, which the rite opens
*inside* its own ending, arrived as an opaque rectangle. Its bottom edge cut a
hard line straight across the page, and behind it sat the two things the whole
rite exists to hand over — the shared body made of everyone's words, and the mark
the visitor had just drawn. Both were covered.

`field.html` already carried the diagnosis in a comment, and named the fix it was
waiting for:

> Paper, not transparent — measured on the live site, not assumed. The embedded
> field arrives wrapped in a second di.iiii viewer whose iframe is sandboxed
> WITHOUT allow-same-origin, so the rite cannot reach in and quiet the wrapper's
> dark shell; "transparent" therefore renders as a black box. […] The day the
> viewer grows a real ?embed=1 mode this can return to transparent.

The rite has been appending `&embed=1` for months. Nothing on this side read it.
So this is not a new feature so much as the answer to a request already being
made — which is why it belongs in the viewer and not in another workaround on
br_id_ge's side.

## What changed

`PublicProjectViewer` gains `isEmbed`, read from `?embed=1` exactly the way
`isPreview` reads `?preview=1`. It gates five things: the `<main>` background,
both code-view iframe backgrounds, the badge, Walk/Fly, and the LoadingScreen —
that last one because it is deliberately black and full-bleed, so inside a window
it would flash the very box this removes on every open.

Guards in `PublicProjectViewer.test.jsx`: a scene page, a code page (the case
that matters — br_id_ge's field is HTML, so the srcdoc iframe was the opaque
surface), and the un-embedded default keeping its dark shell and badge. All three
watched failing against the unconditional background before the fix.

## `window.diiPageOrigin`, added for the same reason

Verifying the fix meant looking at it on staging — and staging could not show
it, because `fieldHref()` hardcodes `https://di-studio.xyz`. It has to: a srcdoc
page has no URL, so `location.origin` is opaque and `location.hostname` is empty.
(`field.html`'s `location.hostname.endsWith('di-studio.xyz')` check had therefore
never once taken its relative branch.) The rite on staging embedded PRODUCTION's
field and read production's crossings.

That is the same gap `diiPageQuery` was added to close, so it is closed the same
way: the bootstrap now hands down `window.diiPageOrigin`. Both br_id_ge call
sites read it and keep their literals as the fallback.

## Not done here, and it must come second

`field.html`'s `html.embed,html.embed body{background:var(--paper)}` can now
return to transparent — but only AFTER this ships to prod. Flip it first and the
field goes transparent over a viewer still painting `#05070a`: a black box, which
is worse than the seam. Order is di.iiii → prod, then br_id_ge.

## Verified

`lint` `build` clean; `vitest run src/project` 274/274; `docs:wiki:check` passes.

The visual claim is verified by **looking at it**, not by the tests — they assert
a style attribute, not that a page reads. A local dev client carrying this branch
was proxied at staging's API and driven through the rite's own `window.__end`
probe at 1440×900 DPR2 and 390×844 DPR3: the seam is gone, the shared body's
letters read as a ring of everyone's words, and the visitor's mark is whole
instead of sliced by the box's top edge.

Also looked at, and worth recording because it is the failure this ordering
exists to prevent: br_id_ge's half was pushed to staging BEFORE this branch
existed there, and the ending came back a **black box** — transparent field over
a viewer still painting `#05070a`. Staging was rolled back to the paper build the
same minute. The comment in `field.html` was right.

## 2026-08-08 — a tag published nothing, because a legacy path could veto the release

`v0.3.0` was tagged so the `di` one-liner would have an artifact to download. The release
workflow ran lint and tests green and then died at `Stage cPanel release` with
`Missing VITE_API_TOKEN for cPanel release build`, publishing no release at all. `v0.2.1`
had died at the same step earlier, which is why this repo has never had a GitHub Release
and why `gh release list` comes back empty.

Two separate faults, one on top of the other:

- The step was **never passed `VITE_API_TOKEN`** — `release.yml` sets `VITE_API_BASE_URL`
  and nothing else, so it could only ever throw.
- **Ordering.** `Pack the di runtime` came after it, so a legacy fallback the repo moved off
  on 2026-07-15 was able to stop the only artifact anyone actually installs.

Fixed by inverting the priority rather than by chasing the secret: the runtime is packed
first, the three cPanel steps are conditional on a probe for the secret (and are handed it
when it exists), and `fail_on_unmatched_files: false` keeps skipped legacy zips from failing
the upload. The cPanel bundles still build for anyone who sets the secret.

Guard: `scripts/di/releaseWorkflow.test.js` — pack-before-cPanel, the tag-derived artifact
name (`--version=${GITHUB_REF_NAME#v}`, so the filename always matches what the installer
resolves from the feed), the conditionals, and the upload patterns. Watched failing against
the old workflow on all four counts.

**Still open:** `v0.3.0` is a tag with no release behind it. The next tag is the real test —
this cannot be verified by re-running anything, only by tagging again.

## 2026-08-05 — Shared frame-exact timeline core + Raw Timeline node

`src/project/timeline/timelineCore.js`: frame-exact clip maths (move, trim,
razor, ripple, retime 0.1x–4x, gap detection) shared between a new Raw
`view.timeline` node (`TimelinePanelWindow.jsx`) and algovrithm's director.
Gaps draw as red hatching, cross-fades in amber, so an accidental hole in a
cut is visible rather than silent.

## 2026-08-05 — algovrithm's director: moved into Raw, then generalised

Two commits, reconciled here against ~94 commits of independent `dev` drift
(see below):

- **The director physically moved** out of `src/algoVrithm/` into
  `src/raw/algovrithm-director/` (later renamed `src/raw/director/`), and a
  new `view.director` Raw node (`DirectorPanelWindow.jsx`) hosts it.
- **Generalised the same day**: the panel no longer imports algovrithm
  directly — everything piece-specific (baseline edit list, asset library,
  `AssetClip` renderer, palette) arrives through a descriptor in the new
  `pieces.js`. Adding a second piece is a registration, not a fork. The save
  endpoint now takes a piece id from the browser and resolves it against a
  server-side allow-list (`hasOwnProperty`-guarded against `__proto__`)
  instead of trusting a path from the request.

### Reconciled against dev, not just rebased

`dev` had independently built **`StudioCodeSpaceDirector.jsx`** — a real,
shipped Studio page that mounts `AlgoVrithmExperience` with
`embedded`/`director` props to render the *full* original in-piece director
(panel, gizmo, orbit camera, split layout) inside Studio's own chrome. This
branch's own refactor commit deletes exactly that machinery from
`AlgoVrithmExperience.jsx`, on the premise that the director's only home is
now Raw. Applying it as-written would have silently broken a real, currently
working feature this branch's author never saw.

Both are kept: `AlgoVrithmExperience.jsx` still hosts the embedded director
when `director`/`embedded` are set (what Studio's page needs), and Raw's
`view.director` node is a second, independent way to reach the *same*
`DirectorPanel` component — both now take a `piece` prop. `docs/ai/roles/
xr-creator.md` and the wiki's `algovrithm`/`raw-lane` articles were corrected
to describe both paths rather than the refactor's original "no editor left in
the piece" framing.

`dev` had also independently shipped `useSavedTiming.js` (space-settings-
backed timing, so the piece can be retimed from di-studio.xyz without a dev
server) — this postdates the branch's own commits, so neither of its
`DirectorPanelWindow.jsx` versions used it, starting every session from the
raw file and (once `onSaveTiming` is wired) silently discarding the current
space's saved timing on the first save. Wired `useSavedTiming` into
`DirectorPanelWindow.jsx` too, gated on `piece.id === 'algovrithm'` since the
space-settings fallback isn't generalized to other pieces yet — a future
piece gets its own raw baseline, not silently algovrithm's timing.

One real merge bug, self-caught: a context-based auto-merge silently dropped
`createEdge` from an import line in an earlier commit of this same branch —
caught by `npm run lint`, not by the merge itself. Fixed in a follow-up commit
on `feat/raw-studio-node` (PR #99), same root cause.

Left open, per the branch's own commit message: 3D placement in
`DirectorPanelWindow` — the gizmo/orbit/standpoint components moved into Raw
but need the piece's own Canvas mounted inside the window before they can
attach to anything; `onPlace` currently only selects the row.

- 2026-08-08 review follow-up: stripped `view.timeline`'s declared ports
  (`playhead`/`fps` inputs, `frame`/`clip` outputs) in
  `src/project/nodeRegistry.js` — no runtime carried them (dead-port rule);
  the node stays panel-only like `view.director`, and the ports can be wired
  later via `nodeGraphRuntime` when the data is real. The panel's local
  playhead state is untouched.

# chore/deck-forks-record

Follow-up to `chore/deck-privacy`. No code changed here — this note exists because
three lines in CURRENT.md's **Open** section are now false, and a stale Open line is
worse than a missing one: an agent reads it and redoes finished work.

## Corrections to CURRENT.md → Open (verified today, not assumed)

- **"8 prod spaces still ownerless"** — they are all owned. Queried prod with
  `PROD_API_TOKEN`: `main`, `open`, `azd`, `algovrithm`, `br-id-ge`,
  `platform-recordar` → `33d8ad04-…` (Gevorg, GitHub account); `wcc`, `beyond-form`
  → `f2d566f6-…` (Emilya). Matches what the user chose. The second half of that
  line still stands: releasing ownership does **not** revoke the scope grant it
  created, which is deliberate — losing a space shouldn't lock you out of it.
- **"Mesh gate INERT in prod"** — armed and verified on both tiers by a parallel
  session today. The robot's own client secret is still unset, so the keeper half
  is not finished; the gate itself is.
- **"leaked GitHub PAT + staging Google OAuth secret still live"** — the classic PAT
  is inferred-closed (its prefix matches nothing stored on any machine, and the only
  classic tokens GitHub still listed were two expired ones, since deleted). The
  staging Google OAuth secret is the one item genuinely still owed, and the user
  explicitly parked it today.

## The deck exposure — where it actually stands

The public repo is clean on **both** `dev` and `main`, verified against what GitHub
serves rather than against the working tree: 16.6 MB CV-free build, zero hits for
date-of-birth / cell phone / gmail in the extracted text.

What is **not** clean, and is the part worth carrying forward:

> A fork is a separate repository, and the file sits on **every branch** of it.

`emilyanikoghosyan/di.iiii` serves the original 68 MB deck on all ten of its
branches; `normal22194/di.iiii` on both of its. Nothing done upstream — including a
history rewrite — reaches either. This is why "clean the fork instead of deleting
it" is advice nobody should follow, and why the rewrite stays queued behind fork
cleanup rather than in front of it.

Order of operations, unchanged: both forks cleaned → quiet window in branch traffic
→ GitHub Support with the blob SHAs, because a force-push does not purge their
cached views. Doing the rewrite first achieves nothing and invalidates every open
PR and remote branch in flight.

## Owed to people, not to code

Emilya has been approached (she owns a fork, so the thread had a reason to exist).
**Syuzanna, Taron and Yeva have not been told** their date of birth, personal
mobile, personal email and photograph were publicly downloadable for about seven
weeks. They own no repo, so no cleanup task will ever surface them — they have to
be raised deliberately or they get skipped.

Record of what was sent and to whom: `di.iiii-ops/deck/fork-owner-messages.md`.

## 2026-08-06 — Verified PR #93's 4 unseen fixes in a real browser

- Audio autoplay/loop toggles: imported a fresh WAV into a Studio guest sandbox with
  nothing set — both toggles showed On, matching the fix's claimed default.
- Beta Help copy: checked Start Here/World tabs and their All Controls panels, no
  leftover "node 0" wording anywhere.
- Primitive-shape clamping: typed a negative sphere radius — the Inspector input
  rejected the negative sign outright and settled on a small positive value; the
  sphere stayed valid the whole time, no crash or invisible/inverted geometry. Couldn't
  reach the deeper "malformed authored JSON" path (no raw scene-JSON editor in Studio's
  UI) — that half still relies on the passing unit tests, not a fresh eyeball.
- Inspector wheel-scroll guard (`Vector3Control`): traced its only render path and it's
  dead code — `App.jsx` → `SpaceSurfaceApp`'s `isLocalRootWorkspace` branch is the sole
  route in, but `RootApp.jsx` always resolves the no-`spaceId` case to the marketing
  landing page first, so no live URL renders it. The fix is real and unit-tested; there's
  just no current stage to see it on. Not a gap in this session's testing.
- `docs/ai/known-fixes.md` rows for all four updated with these findings in place of
  the stale "not yet eyeballed" notes.
- Also this session: promoted `dev` to `main` (fast-forward, deployed, verified live),
  and merged the session-hygiene PR (#94) — `npm run state`, the CURRENT.md derived-fact
  ban, and the push-gate wiring this branch's own note-based workflow builds on.
- Opened as PR #98 against `dev`. First commit (`84409f2a`) got a green CI run after
  one rerun (transient runner-queue failure, unrelated to this change). The follow-up
  sync commit (`f883c8f9`) never got a CI run dispatched at all — confirmed via the
  GitHub API (`check-runs` and `actions/runs?head_sha=...` both empty, not a display
  lag) while `dev`'s own staging deploy was queuing/cancelling repeatedly from heavy
  concurrent push traffic on other branches at the same time. No `workflow_dispatch`
  trigger exists on `ci.yml` to force it (`pull_request` only, deliberately no `push`
  trigger — see the workflow's own comment). Left waiting rather than forcing an empty
  commit or a close/reopen, since the cause reads as GitHub-side congestion, not this
  branch's problem. **Not yet merged** — merge, and any retrigger, is the user's call.

# feat/admin-minimal — session notes

## 2026-08-08 — Ops Graph minimal pass: 10 sections → 6, contextual header

- Owner's call ("admin is messy, make minimal"): diagnostics collapsed from seven
  sections to three — Overview stays, **Inspect** absorbs Topology + Objects +
  Session, **System** absorbs Console + Controls + the old System. Admin group
  unchanged (Manage, Open Call, Agents). Nothing was removed — every module still
  renders, just grouped.
- Contextual topbar: on admin sections the scene-editor telemetry (Objects/Visible/
  Selected/Hidden, Copy Snapshot/Log/Links, XR Debug) disappears; instead Manage and
  Open Call show Spaces/Users counts, Agents shows Live/Sessions counts, both fed
  upward via tiny `onStats`/`onBoardStats` callbacks — no fetch lifting. Diagnostics
  sections keep the full telemetry header.
- Overview's "Open Console" jump retargeted from the removed `console` key to
  `system` — grep for `setActiveSection('` if sections are ever renamed again.
- No new CSS, no restyling; PreferencesPage.test.jsx navigation updated to the new
  section names in the same change.

## 2026-08-08 — per-user "connect your AI key", v1

- First slice of a bigger goal (multi-account collaboration, pluggable AI/Telegram tool
  connections): a signed-in user can now store their own Claude API key against their
  account, from the existing account-menu popover (`AccountButton.jsx`). Modeled on the
  Google Drive per-user OAuth pattern (`integrationRoutes.js`/`driveTokenStore.js`) — new
  `user_ai_connections` table, `aiConnectionStore.js` (AES-256-GCM at rest, own key
  domain), new `routes/aiConnectionRoutes.js` (status/connect/disconnect, `claude`
  provider only for now). The raw key never returns to the client — status is
  `{connected, last4}` only.
- Verified live in a real browser (headless): connect → encrypted row confirmed in
  SQLite (not plaintext) → full page reload → still connected → disconnect → row gone.
  lint/build/1798 tests green, server contracts green.
- Wiki entry added (`ai-connection`) under Spaces & access.
- Review follow-up (same branch): merged current `dev` in (kept both sides of the
  adjacent-append collisions with the admin work in `serverXR/src/index.js` /
  `src/services/apiClient.js`); connect/disconnect now explicitly reject `guest:` subjects
  (403) so the route matches what the UI and wiki already claim; apiKey capped at 512
  chars; added `aiConnectionStore.test.js` (encrypt round-trip, at-rest, upsert, delete,
  tampered blob → '') and `routes/aiConnectionRoutes.test.js` (401/403/400 + happy path).
- Deliberately stopped here: no Telegram-linking (di-bo is currently hardcoded to one
  owner Telegram ID — generalizing it to "any linked di.iiii user" is real, separate
  work), no other AI providers, no shared/free-credit pool (needs per-user metering
  before it's safe to offer), and nothing inside di.iiii yet reads the stored key to do
  anything — this is the storage/account layer only, for future work to build on.

# feat/approval-gate — session notes

## 2026-08-08 — human-approval gate for admin-level writes (+ review fixes)

- New `serverXR/src/approvalGate.js`: gated routes call `gateOrApply` instead of
  their store function directly. Gate disabled (default) → executes immediately,
  behavior unchanged. Enabled → the intent is stored as a `pending_actions` row,
  route answers 202, and nothing runs until di-bo returns a matching decision
  (intent hash echoed back, authorization re-derived at execution time). Fails
  closed: bot unreachable → expires denied; enabled-but-unconfigured → 503.
- Deploy wiring: `APPROVAL_GATE_ENABLED` / `APPROVAL_BOT_URL` /
  `APPROVAL_SHARED_SECRET` pass through compose.
- Review fixes (PR #102): the fail-loud net was inert — mounted via
  `router.use('/api', …)` Express stripped the prefix, so the registry's
  `^/api/…` patterns never matched. Now mounted bare (router-relative path) and
  the net evaluates `bodyTest`, so ordinary space PATCHes don't trip it; the
  registry + `SENSITIVE_SPACE_PATCH_FIELDS` moved into `approvalGate.js` (one
  source, imported by `index.js` and `routes/spaceRoutes.js`). The blocked-path
  response was also rebuilt on end/write interception — the old writeHead hook
  called `res.end` from inside an end call (ERR_INTERNAL_ASSERTION). Regression:
  `serverXR/src/approvalGate.test.js` mounts the router exactly as production
  does and pins gated-match / body-gated / fail-loud behavior.
- Still genuinely undone: di-bo side of the decision flow ships separately (the
  bot must echo `intentHash` and sign with the shared secret); gate stays
  disabled everywhere until that lands.

## 2026-08-08 — `di`: one line installs di.iiii on your own machine, offline

The ask was a CLI that installs di.iiii locally on any system from one pasted line, keeps
working without a network, and can later sync with the online instance. This branch is
phase 1 of that: install, run, offline. Sync, LAN/venue mode and the VJ output lane are
deliberately not here.

- **`di` CLI** (`scripts/di/`) — `up · down · status · open · logs · doctor · where ·
  backup · restore · update · uninstall`. `detect.mjs` is pure (probe results in, plan out)
  so all 22 of its branch tests run without touching the machine; `probe.mjs` holds the I/O;
  `ui.mjs` holds every artist-facing string, in the brand guide's voice.
- **Runtime artifact, not the repo** (`scripts/pack-runtime.mjs`) — dist + serverXR + shared
  + the CLI. 32 MB packed, ~100 MB installed, against 877 MB of `node_modules` for a
  checkout, and no Vite on the artist's machine. `npm run selfhost` is untouched and remains
  the developer path.
- **serverXR serves the app** when `CLIENT_DIR` is set, so a local install is one process on
  one port. Unset — the deployed topology — nothing changes and it stays a pure API behind
  nginx. New `HOST` (default `0.0.0.0`) lets a local install bind loopback.
- **`install.sh` / `install.ps1`**, published as `/get` and `/get.ps1` by a vite plugin plus
  exact-match nginx blocks before the SPA catch-all.
- **Fonts**: Inter and JetBrains Mono were named in the tokens and loaded from nowhere — the
  app rendered in system fallbacks and only looked right on machines that happened to have
  Inter. Now self-hosted (88 KB, variable, latin). That exposed a second thing: the landing
  has no ThemeProvider, so MUI put Roboto on every Typography and beat the Inter `.lp-root`
  already declared. Both fixed.

Four bugs that unit tests could not see, each found by installing onto a real bare machine:

- `res.sendFile(absolutePath)` 404s every SPA route when any path segment is hidden — `send`
  applies `dotfiles:'ignore'` to the whole absolute path, and the install lives in `~/.di`.
  The API and static assets kept working, so it read as a routing bug. The contract fixture
  now lives under a hidden directory; three tests fail without the fix.
- A vendored node has no `npm` beside it on PATH, and that machine may have no npm at all.
- nodejs.org publishes **no musl build** — Alpine 404'd. It now uses
  unofficial-builds.nodejs.org, and when that binary's `libstdc++`/`libgcc` are missing the
  installer prints the `apk add` line (tested, not guessed) rather than failing in riddles.
- Staging in `/tmp` then renaming into `$HOME` fails with EXDEV; staging is now
  `<versions>/<v>.partial`, on one volume.

Verified on four clean machines via podman — debian:12, alpine:3.20 (busybox ash + musl),
fedora:40, node:20-bookworm — each: install exits 0, `di` resolves in a fresh login shell,
`di up` serves `/main` and `/studio`, `di down` frees the port, `di uninstall` keeps
`~/.di/data`. Also run inside a network namespace with only loopback, and the page requests
zero external origins, so offline-first is measured rather than claimed. `nginx.conf` checked
against a real nginx: `/get` returns the script as `text/plain`, `/main` still returns the app.
`.github/workflows/install-matrix.yml` encodes all of that.

**algovrithm's media, fixed rather than worked around.** The 31 reels were 720x1280 at
~3.4 Mbps — 189 MB, bundled into every build, 205 MB of a 232 MB `dist` that di-studio.xyz
serves too. Both the assets README ("compress video before adding it") and `reelPlayers.js`
("compressing the source to something like 540p would make the whole question go away — the
reels are shown at about 1.4m wide on a 7m shell") had already said what to do. Done:
189 MB → 65 MB, `dist` 232 → 114 MB, the artifact 103 MB complete. Frame counts identical on
all 31, audio copied (the reels unmute on first gesture, so it is part of the piece), and the
before/after compared by eye — at the size the piece shows a reel they are indistinguishable
and the datamosh artefacts survive. The packer therefore no longer drops video by default;
`--lean` still does, for a 32 MB artifact, and names the cost. The recipe is in the assets
README so the next clip added matches.

**macOS verified on real hardware** (`di-mac`, M1, macOS 26.5.1 arm64, no node installed) —
the arm64 + darwin + vendored-node path end to end, `di` resolving in a real zsh login shell,
`/main`, `/studio` and a reel all 200, uninstall keeping the data. It found two PATH bugs that
no Linux container could:

- The installer read `process.env.PATH` to decide whether `~/.local/bin` was usable. Its own
  environment is a curl pipe / ssh / CI, not the artist's terminal — on the Mac `~/.local/bin`
  existed but was NOT on the login PATH, so the shim went somewhere useless and the install
  reported success. It now asks the login shell (`$SHELL -lc 'printf %s "$PATH"'`).
- The rc fallback picked the first existing file out of a list, which on macOS is `.zshrc` —
  and a LOGIN zsh never reads `.zshrc`. `di` was missing from exactly the shell someone opens
  next. The rc file is now chosen from `$SHELL`: `.zshenv` for zsh, `.bash_profile` before
  `.bashrc` on macOS. Debian and Alpine re-verified after the change.

The Mac was left exactly as found — uninstalled, `.zshenv` block removed, `~/.local/bin` and
`/tmp` cleaned.

**The update path is now guarded, and Windows is guarded with it.** `di update` promises one
thing — it never touches your work — so there is now an `update` CI job on **ubuntu-latest and
windows-latest** that installs a version, writes a canary space, updates, diffs the canary byte
for byte, rolls back, diffs again, and finally asserts `current` is still a *link* whose target
is whole. Windows is in that matrix specifically so it cannot drift while nobody is running it:
its update path has a failure mode unix does not, and one of them was real —
`fs.rm(junction, { recursive: true })` deletes **what the junction points at**, i.e. the
installed version. All link removal now goes through `unlinkLink()` (lstat, unlink a link,
rmdir only an empty directory, refuse anything else).

Also fixed while here: `ui.updateAvailable` was a string nothing ever printed. `di up` now
mentions a newer version in one dim line — after the app is already up, failing silently, and
at most once a day, so offline never waits on it. And `stageVersion` accepts a `file://` URL,
which is how CI exercises the real update code without publishing a release (and how a venue
with no network could update from a USB stick).

Run by hand on Linux, not just in CI: install → canary → update → rollback, canary identical
at every step, `current` still a symlink, both versions kept, data intact. Plus the failure
path — a build that installs but cannot boot is refused by the scratch-port health check and
leaves the artist on the working version, still serving.

**Still open:** **the GHCR packages are private**, so the CLI's docker branch self-skips (it
probes rather than assumes, and will light up with no new release once they are public).
Windows is written and covered by CI but has not been run by a human on real Windows.

## What CI found on Windows — four bugs, one per run

Everything above was verified on real Linux and macOS machines. Windows was written
blind and covered only by `install-matrix.yml`, and every round it found exactly one
more thing. All six Linux images were green throughout.

- **Two tars.** Windows ships bsdtar at `System32\tar.exe`, which understands `C:\...`;
  Git for Windows ships GNU tar, usually first on PATH, which reads a leading `C:` as a
  **remote host** — `tar (child): Cannot connect to C: resolve failed`, naming neither
  tar nor the drive letter. `tarCommand()` prefers bsdtar, else `--force-local`.
- **`di up` never returned the prompt.** `detached` and `unref` were both guarded by
  `!isWindows`, so the parent Node kept a handle on the child and its event loop never
  emptied. The server was up and the terminal was dead — including the terminal you would
  run `di down` from. Now detached + unref'd everywhere, `windowsHide` so no console
  window appears. It surfaced as a job that ran for **six hours and reported nothing**, so
  both Windows jobs now carry `timeout-minutes: 25`: a hang has to read as a failure.
- **A batch file needs CRLF.** cmd.exe re-seeks a `.cmd` by the byte length it believes
  each line had, so a missing CR costs one byte per line, cumulatively — later lines run
  with their heads eaten (`setlocal` → `etlocal`), ending in `di.iiii is not installed
  here ()` with an empty `%DI_HOME%`. **The same file worked one run earlier; two added
  comment lines pushed it over.** `.gitattributes` pins `*.cmd`/`*.bat` to `eol=crlf`,
  and `scripts/di/shim.test.js` holds that plus pure-ASCII (a batch file is read in the
  console code page) and the mirror rule for the sh shim.
- **The shim is `di.cmd` on Windows.** The CI harness hardcoded the unix name and failed
  with `No such file or directory` after a perfectly good install.

Also fixed here: the installer already falls back to `dii` when a foreign `di` owns the
name — that worked — but every message still said `di`, including `stop it with: di down`,
which points at the other binary. The shims now export their own basename (`$0` / `%~n0`)
and `ui.mjs` prints it.

**A conflicting PR runs no CI at all.** GitHub cannot build the merge ref, so every
`pull_request` workflow is skipped and the PR page shows nothing red. Two Windows fixes sat
untested behind that for a round. Check `mergeable` before reading green as green.

## Where it stands

- **PR #104** into `dev`, MERGEABLE/CLEAN. `install matrix` **12/12 green** (debian, ubuntu,
  fedora, alpine/musl, node 20 refused, node 22, offline, docker-mode, windows, both
  update-and-rollback jobs, pack) and `CI` green on the same commit.
- Merged `origin/dev` on the way: `bc22acb6` had run the repo's own `compress-reels.mjs
  --replace` over the same 31 algoVrithm reels this branch had re-encoded by hand. **Took
  dev's** — 81 MB / 360x640, the documented tool, verified beat by beat there — over this
  branch's 65 MB / 540x960 ad-hoc ffmpeg pass. The artifact is ~16 MB larger for it; tuning
  that script is the honest way to get it back, not overriding shared binaries in a merge.
- Nothing ships until a `v*` tag: that is what publishes the artifact the one-liner downloads.
- Blocked on the user: `gh auth refresh -s read:packages,write:packages`, then the GHCR
  packages can be made public and the docker branch stops self-skipping.
- Blocked on hardware: **real Windows**. CI is a clean runner with pwsh 7 and Git already
  present, which is not what a person's machine looks like — expect execution policy,
  antivirus on a freshly downloaded `node.exe`, and a username with a space in it.
- Phases 2-4 untouched: `di sync`, `di venue` (LAN + QR), the VJ output nodes. Sync's hard
  part is not transport — `PUT /scene` replaces a space wholesale and wipes its op-log, and
  `PUT /document` is last-write-wins with no version check.

# feat/ops-agents-map — session notes

## 2026-08-08 — Ops Graph → Agents: a live map of the machine's Claude sessions

- New admin section `agents` in the Ops Graph, composed entirely from the
  preferences-* design system — `ArchitectureCanvas` map of live sessions linked to
  the checkout each one holds, a Directory (live first, then recent) master-detail,
  and per-session detail: subagent tree, background-job state, conversation tail.
- Backend: `serverXR/src/agentBoardStore.js` reads the operator's local `~/.claude`
  (bounded head+tail scans — ~99 sessions indexed in ~130ms without parsing 700MB of
  transcripts; `sessions/*.json` + `process.kill(pid,0)` for the live overlay; no
  subprocesses). Routes `GET /api/agent-board` + `/api/agent-board/session/:id` are
  refused with 404 unless BOTH non-production AND loopback — transcripts can contain
  secrets and must never be served off-machine. Deployed environments show a plain
  "operator mode only" card.
- Design decision on record: this is the operator/diagnostics half (Framing C) of the
  larger agents-as-nodes direction. The product half — an `agent` node type joining
  `feat/ai-connections`' per-user encrypted keys (PR #105) to `feat/raw-studio-node`'s
  runner (PR #99) with a serverXR-side Anthropic proxy — is designed but NOT built;
  the analysis lives in this branch's PR discussion and the owner's session of
  2026-08-08. Do not reinvent: reuse approvalGate (PR #102) for agent writes, SSE for
  streaming, checkpoints-not-transcripts into the op-log.
- Verified by looking: desktop 1440×900 DPR1 + phone 390×844 DPR3 via headless
  Playwright against the real local data — map, selection, inspector, subagent tree,
  conversation tail all seen rendering. Known quirks found and fixed along the way:
  long titles blow the sidebar grid column open (grid min-width:auto) → JS-truncated;
  conversation tail needs a 4MB window because one pasted screenshot line can exceed
  256KB.
- Still undone, deliberately: lifecycle actions (close/archive a session, rescue
  job tmp/ artifacts) — the #1 want per the estate session's triage experience —
  and any resume/dispatch capability. Both need a write path and a permission story.

## 2026-08-07 — five people's personal details come out of the public deck

- `docs/deck/di.ii XR studio_network .pdf` was tracked here, on `main` and `dev`, and
  downloadable from `raw.githubusercontent.com` (verified, HTTP 200). Its pages 85–89
  are CV pages for **five named people** — Gevorg, Emilya, Syuzanna, Taron, Yeva —
  each carrying a **date of birth, a personal mobile number, a personal email address
  and a photograph**. Found while reading the deck to identify a di.iiii admin account
  nobody had written down.
- No scan would ever have caught it. The repo has no tracked credentials and the
  secret scan looks for secrets; this is not a secret, it is somebody's phone number.
  A deck is a document you hand to a specific person, and four of the five did not
  choose to publish theirs.
- **What changed here:** the public copy is now the same deck with pages 85–89 removed
  — 90 pages instead of 95. The complete file moved to the private `di.iiii-ops`
  (`deck/`), whose README carries the regeneration command and the verification.
  `docs/deck/README.md` says which build this is and adds "anyone's personal data" to
  the do-not-put-here list, because portfolio material arrives with contact details
  baked in and this folder is world-readable under AGPL.
- Verified by **text, not page count**: `gs -sDEVICE=txtwrite` over the new build finds
  zero hits for all five phone numbers, all five emails, all five dates of birth and
  the string "Date of birth" — and the same search over the original finds them, so the
  check can actually fail. The seam (page 84 divider → 85 network list) was looked at.
- **This does NOT undo the disclosure, and nobody should read it as if it does.**
  `git rm` removes a file from `HEAD` and from nothing else. The full deck remains in
  this repo's history, and — the part that makes a history rewrite insufficient on its
  own — **in two public forks**, `emilyanikoghosyan/di.iiii` and `normal22194/di.iiii`,
  both of which served the PDF when checked. Forks are separate repositories; a
  force-push here reaches neither.
- **Still to do, deliberately not done here:** tell the four people whose details these
  are; ask the two fork owners to clean or delete their forks; then, and only then,
  consider a history rewrite with GitHub Support in the loop (their cached blob views
  survive a force-push and need a support request quoting the SHAs). A rewrite today
  would also invalidate 10 open PRs and 25 remote branches with several sessions
  actively pushing — real disruption, and the data would still be at two URLs.
- A full mirror backup of the public repo was taken first:
  `/home/nooo/di-backups/di.iiii-mirror-20260807.git` — 1204 commits, 145 refs, 450 MB,
  deck confirmed present in it.

# Session notes — fix/hide-public-project-switcher

## 2026-08-07 — public project pages drop the floating project switcher

- Owner call (from the staging screenshot of `/br_id_ge/rite`): the `br_id_ge ▾`
  chip and its dropdown clashed with the published page's design. The switcher is
  right in Studio, where you're working — not floating over a public face.
- `SpaceSurfaceApp` no longer passes `showProjectSwitcher` to `PublicProjectViewer`,
  so direct project links (`/:space/p/:id` and vanity `/:space/:slug`) render
  chrome-free like the live route. `ProjectSwitcher` itself is kept (unreachable
  from public routes) for a possible future edit-context surface; Studio's
  Projects window still covers project hopping.
- Regression guard in `SpaceSurfaceApp.test.jsx`: the viewer mock now surfaces the
  prop and a test asserts direct links stay switcher-free. Wiki `publishing` entry
  updated to match. This also resolves the open "`br_id_ge ▾` chip covers the
  letter-row" call in CURRENT.md — the chip is gone from public pages entirely.
- Verified by looking: local vite (port 5473, proxied to the staging API) rendered
  `/br_id_ge/rite` desktop + iPhone-13 viewport and `/br_id_ge/p/landing` — no chip
  on any of them. Lint 0 errors, build green, full suite 1798/1798.

## 2026-08-06 — Open inscriptions can carry the drawing that was made for them

A crossing of br_id_ge left a name and a word, and the form it wore in the field
was a torus knot picked by a hash of its own id — unique, permanent, and nobody's.
Nothing a visitor actually authored survived.

- The rite now quantizes the line a hand drew into an opaque `m1.<base64url>`
  token (~1KB) and sends it with the crossing. `POST /inscriptions` takes an
  optional `mark`; `PUT /inscriptions/:id/mark` replaces it afterwards with the
  same one-time proof that unmakes a crossing — needed because the ending is a
  page you can draw on again, long after the crossing was posted.
- The server validates by shape and never parses it: a malformed or oversized
  mark is dropped and the crossing still succeeds, because a drawing is not
  worth failing a crossing over.
- Added the new route to `PUBLIC_CORS_ROUTES` beside its DELETE sibling,
  verified with a real preflight from a foreign origin (a rite running on a
  mirror or an installation laptop is cross-origin to the field).
- The wiki entry still said "update and delete are impossible on this path",
  which the proof-gated DELETE had already made untrue — corrected alongside
  documenting the new mark field.
- `.env.example` never mentioned `MESH_ROOM_SECRET`/`MESH_PROTECTED_NODE_PREFIXES`
  even though both compose files have passed them since the mesh identity gate
  landed — the only way to learn the keeper could be protected was reading
  `meshHub.js`. Found because it stayed unprotected on prod: `node=keeper-anything`
  was able to join the live relay on 2026-08-06. Documented what an empty value
  means, since empty is the dangerous state and looks identical from outside
  until someone claims the id.

## 2026-08-05 — Audit backlog closed, two real gaps fixed

Re-verified the standing audit backlog: 17/17 previously-reported findings were
already fixed on `dev`; `CURRENT.md` had been carrying it as open. Two gaps were
real and are fixed here.

- **A failing scene write was invisible.** `useLiveSync` set `sceneFlushError`
  correctly, but the value died at `useAppState`'s explicit destructure (it
  listed `sceneStreamState`/`sceneStreamError` and simply omitted the flush
  field) — every hop in between is a spread, so a grep for the identifier found
  almost nothing. The Studio status panel read "Scene stream connected" the
  whole time a write was actually failing. Threaded through `useAppState` →
  `useAppContextValues` → `EditorLayoutContainer` → `useStatusItems`, given its
  own status row rather than folded into the stream row (a healthy stream is
  exactly what was masking it). Two new tests in `useStatusItems.test.js`.
- **A portal in embed mode rendered blank tiles** for older imported projects.
  `EmbeddedScene` called `buildAssetMap(doc)` with no `fallbackProjectId` — the
  fallback that rescues assets written without a `url` by the legacy import
  gap — and an embedded document has no `projectMeta.id` of its own to fall
  back on. Passed the `projectId` the component already had in scope.
- Checked by diffing the test suite's failing-file *set* before/after
  `origin/dev`: identical (raw totals read 68 vs 67 — flake in uncollectable-
  file counting, so the set is the check, not the count).

Left deliberately open (not this branch's to fix): `StudioEditor` has no
`[projectId]` reset on switch — fixing it means deciding which editor state is
per-project vs per-session, and a wrong guess silently discards work.

## 2026-08-06 — Raw on touch, the all-nodes example, Studio as a node

- **Graph wiring was impossible on a phone.** A wire starts on the output
  dot's `pointerdown`, which on touch grants that element implicit pointer
  capture — so `pointerup` was retargeted back to the output dot and never
  reached the input dot under the finger. Drops now resolve to the nearest
  *compatible* input port within `PORT_DROP_RADIUS_PX` (36 screen px,
  constant across zoom) via a window-level `pointerup`, one code path for
  mouse and finger. The old drag tests passed green because they stubbed
  `setPointerCapture` over exactly the semantics that were broken.
- Zooming out on a phone (double-tapping the zoom buttons, since there's no
  wheel on touch) bubbled to the graph surface's `onDoubleClick` and opened
  the create-node palette over the graph — `handleSectionDoubleClick` now
  excludes `.raw-graph-zoom-controls`.
- `viewport-fit=cover` was missing from the viewport meta — every
  `env(safe-area-inset-*)` in the app resolved to 0, silently neutering
  Studio's already-written notch handling. Added, plus safe-area padding to
  Raw's fixed chrome.
- `docs/roadmaps/NODE_BACKLOG.md` claims all 27 palette types "work today".
  At port level only 17 do — `computeNodeOutput` has cases for `value.*`,
  `math.*` and `time` only; no `geometry`/`texture`/`signal`/`state` output
  on any node ever carries data. New `src/project/graph/examples/allNodesExample.js`
  covers the whole palette and lists the unwirable ports as such rather than
  wiring them to look complete. Reachable from Raw's ⋯ menu.
- `verify:surfaces` reported ALL CLEAN for `/raw` while actually auditing the
  sign-in card: `/raw` loads an empty workspace, and editor lanes sit behind
  `AuthGate`, so with no session the script audited the gate's panel instead
  of the editor. Now seeds the all-nodes example via `addInitScript`, accepts
  `--token`, and prints `[AUTH-GATED]` when it lands on a sign-in card
  instead of silently reporting clean. Tap findings on `/raw` went 2 → 8 once
  it was actually looking at the editor.
- **`studio` is now a node.** One palette entry; entering it reveals
  Outliner + Scene + Inspector as a subgraph (TouchDesigner COMP / Nuke Group
  pattern). Needed three prerequisite fixes: panel nodes had NO canvas
  representation as graph cards at all (so a wire into a panel was
  invisible); entering a node required hover+double-click below 0.5 zoom
  where a card is a few pixels wide, now a real button; the selection
  inspector used to cover the node it was inspecting, now a bottom sheet on
  phones. `view.outliner`/`view.inspector` — type ids both lanes have
  carried window frames for since they were written — are implemented for
  the first time.

Verified on a real iPhone 15 Pro at 393px with real CDP touch events; full
`verify:surfaces` clean across six profiles including 320px.

## Open, carried from the branch's own notes

- Studio-as-node is a **first slice**: assets/code/share/projects panels are
  still hardcoded chrome (`PublishPanel` alone takes 17 callback props).
  Two decisions deliberately left open, recorded in
  `src/project/graph/studioNode.js`: **port promotion** (which interior
  ports surface on the container) and **live reference vs. frozen snapshot**
  when a subgraph becomes a palette item.
- No user-authored node types yet: `NODE_TYPES` is a static module literal
  with no `registerNodeType`, `node.null` is declared but not placeable,
  `values.__code` is inert, and `templates[]` exists in the schema with zero
  consumers.

## 2026-08-06 — Sync-safety pass: rescue, seal, and the structural fix

Full plan at `~/.claude/plans/humming-wiggling-wozniak.md` (not tracked in-repo). Built
on PR #94's `repo-state.mjs` tooling rather than duplicating it.

- Recovered three sessions' `CURRENT.md` notes that a concurrent rewrite had silently
  destroyed before their branch merged (found via `git fsck --dangling`) — folded into
  `PROGRESS.md`. Re-opened one still-genuinely-undone TODO that was lost with them (the
  Open Space scene zip, never imported).
- Rescued 263 uncommitted lines sitting in a `/tmp` worktree with no backup → pushed as
  `fix/inscription-mark-server`. Pushed two branches that existed only on this disk
  (`feat/timeline-core` had no upstream at all; `feat/raw-studio-node` was mistargeting
  `origin/dev`, so a bare push from it would have landed straight on `dev`).
- Built and verified a guard (`checkSafeSource` in `space-sync-vendor.mjs`) against the
  8-copies-of-the-vendoring-tool hazard — confirmed live, not theoretical: triggered the
  real downgrade once while testing the unguarded old copy, fixed it, then verified the
  guarded version refuses the same operation. Added `--release` (write + bump
  `minEngine` + commit + push per linked repo in one command) — not run for real yet,
  waiting on this branch merging so a real `dev` checkout can run it.
- Worktrees 21 → 10 (removed 8 confirmed merged/stale, one of which turned out to hide
  a third lost session), local branches 55 → 17 (deleted 38 confirmed fully-merged or
  patch-equivalent — 2 looked like garbage by branch name but had real unmerged work,
  caught by checking each individually rather than trusting the heuristic).
- This session-notes protocol itself (`docs/ai/sessions/`, `docs:ai:check` enforcement,
  the `active_branch: dev` literal check) is the structural fix for the one *confirmed*
  loss mechanism — everything above was rescue/cleanup around the edges of it.

## 2026-08-06 — `npm run land`, `repo-state.mjs` live-process detection

- `repo-state.mjs`/`repo-state-lib.mjs` (extends PR #94, doesn't duplicate it):
  `classifyWorktree` (LIVE > UNPUSHED > UNMERGED > STALE > GONE, via `/proc` scan +
  `git cherry` for squash-merge-aware merge detection), `--brief`/`--sweep`/`--json`.
  Real bug caught building this: the first live-process pattern matched `vitest run`
  (one-shot), so a test run in progress got misidentified as a live dev server —
  happened for real, not hypothetical, fixed and regression-tested.
- `session-land.mjs`/`session-land-lib.mjs` (`npm run land`): folds `docs/ai/sessions/`
  notes into `PROGRESS.md`, rewrites `CURRENT.md`'s Last-session to a title list
  pointing there (full prose never goes in CURRENT.md — the only way to guarantee the
  50-line budget regardless of how much landed in one batch), deletes the notes, runs
  the worktree sweep, commits (not pushes). Verified end-to-end in an isolated clone
  with two fake notes — folding, CURRENT.md rewrite, file deletion, sweep, commit all
  confirmed correct.
- Second real bug caught testing `land`: `execFileSync`'s default stderr inheritance
  leaked "fatal: no upstream configured" straight to the console for an expected,
  already-handled failure (probing an unpushed branch) — in both `repo-state.mjs` and
  `space-sync-vendor.mjs`'s `git()` helpers, pre-existing in PR #94's code, not just
  this branch's additions. Fixed both.
- Dogfooded the CURRENT.md-untouched rule on this exact branch: my own earlier commits
  had hand-edited `CURRENT.md` directly, in violation of the rule being written.
  Reverted rather than grandfathered — see the commit for the full story, including a
  second bug this surfaced (`origin/dev...HEAD` vs `origin/dev` diff form).
- `.claude/commands/land.md` added; `recap.md` (from PR #94) rewritten to write session
  notes instead of editing `CURRENT.md` directly, which is now a `docs:ai:check`
  violation. `docs/ai/golden_rules.md` and `docs/ai/parallel-agents.md` updated to
  match — the worktree-location convention (`.claude/worktrees/`, not `../di.iiii-*`)
  is now stated as the rule, not "either is fine".

## 2026-08-06 — Vendor drift gets a check that can actually fail

- `scripts/space-sync-selfcheck.mjs` (vendored as `sync-space-check.mjs`): fetches
  di.iiii's real upstream engine over HTTPS (public repo, no token), byte-compares,
  asserts `minEngine` matches. Never skips on a fetch failure — that was the exact flaw
  in the tool it replaces. Live-tested against br_id_ge's real current state: correctly
  caught the actual `minEngine: 5` vs vendored `v6` drift that's been sitting there all
  session, plus byte-mismatch and missing-file failure modes, all verified for real.
- `docs/templates/vendor-check.yml`: the CI workflow that runs it, in the LINKED repo's
  own CI (di.iiii's CI structurally can't see a linked repo's copy — that inversion is
  the actual fix). `--release` now writes both alongside the engine.
- Second real dry-run bug, same shape as `land`'s: `--release --dry-run` was calling the
  new file-writer unconditionally before checking the flag, so a "preview" silently
  wrote files to disk. Caught by actually running it against a scratch directory, not
  by inspection. Fixed, regression-tested (3 cases: dry-run writes nothing, a real run
  writes everything, a second real run is idempotent).
- `space-sync.test.js`: di.iiii's own spaces' `minEngine` now asserted strictly equal
  to `ENGINE_VERSION` (was `<=`) — these are declared in the same repo as the engine,
  no excuse for lagging the way a linked repo briefly can.
- `docs/ai/space-sync-vendoring.md` added (full reference); `golden_rules.md`'s
  vendoring rule updated to `npm run space:sync:release` and a new rule on why a
  checked-out worktree is a runnable copy of every tool, not just source code.

## 2026-08-06 — The real fix, landed for real, in all 3 linked repos

- `br_id_ge`: `minEngine` 5→6, engine v6 committed, `sync-space-check.mjs` +
  `vendor-check.yml` added, `sync-space.yml` gated on it. Pushed to `main`. **Both the
  new vendor-check AND the existing production sync workflow ran and passed for
  real on GitHub Actions** — content unchanged, tooling only, verified green.
- `beyond_form`: same fix, plus `di-space.space.json` committed for the first time
  (was untracked since the repo was linked — no history at all until this commit).
  Pushed. **This repo's first CI run ever, passed.**
- `platform_recordar`: same fix, committed. No remote — this repo's permanent state,
  documented in a new `AGENTS.md` (had none) as a deliberate `KNOWN_EXCEPTIONS` entry
  rather than a silent gap.
- Each repo's own pre-existing uncommitted work (br_id_ge's real session notes in
  `CURRENT.md`; a `DEFAULT_LIVE_URL`-removal edit in both `beyond_form` and
  `platform_recordar`'s `di-space.json`) deliberately left untouched and unstaged —
  not mine, not this task's scope.

- `~/di-spaces` investigated: a genuinely separate system (nightly pull-based backup +
  guarded disaster-restore, `--force-prod` required for a prod write), not an
  unexamined duplicate of the editing path — it already documents the boundary in its
  own README. Cross-referenced from `docs/ai/space-sync-vendoring.md` so the boundary
  is visible from both sides, no code changes needed.

**Plan complete** except: consolidating to one canonical di.iiii checkout, blocked on
`di.iiii-algomerge`'s active work (check `npm run state` before attempting it), and the
human-triage branch list from the P0/P1 worktree cleanup (`fix/audit-gaps`,
`feat/inscription-mark` — overlaps `fix/inscription-mark-server`, `fix/space-sync-engine`,
`fix/wcc-degenerate-lock-deltas`, `feat/raw-studio-node`, `feat/timeline-core`,
`chore/github-oauth-env-wiring`'s 4 real unmerged walker fixes, `feat/algovrithm`'s 1
unmerged hook-path fix) — land, park, or drop, one call each, not this session's to make.

## 2026-08-06 — A third CURRENT.md casualty, found while cleaning up worktrees (2026-07-15 session)

**Why this entry exists:** the `nginx-header-fix` worktree (branch `feat/brand-refresh`,
PR #65, squash-merged into `dev` weeks ago) was marked safe to remove, but carried one
uncommitted `CURRENT.md` edit — not a stray edit, an entire session's real notes that
never made it anywhere else. Recovered before removing the worktree, same pattern as
the other two entries below.

- **A real prod bug, found and fixed**: nginx's `add_header` directive does not
  inherit into a location block that sets its own `add_header` — so all 3 security
  headers were silently dropped on every real route despite being declared once at
  server level. Fixed by repeating them per location block (confirmed still live:
  `nginx.conf` carries 18 `add_header` lines today, one set per block).
- **VPS cutover confirmed and hardened**: prod fully on the Hetzner VPS
  (Docker + Caddy), cPanel demoted to a manual-dispatch fallback only (auto-trigger
  removed, host left intact, decommission timeline undecided). Closed direct
  port-8080 exposure (Caddy-only), rotated `ADMIN_API_TOKEN`, added nightly SQLite
  `VACUUM INTO` backups (14d retention), fail2ban, SSH password auth disabled, Docker
  log rotation.
- Merged 5 repo-improvement PRs (#57–#62): GitHub OAuth env wiring, Docker resource
  limits, nginx compression/caching, a GHCR+SSH deploy pipeline scaffold (left inert,
  needs secrets), serverXR structured logging.
- GitHub cleanup (#63): 16 stale branches deleted, old PRs closed/retargeted, ~562
  dead lines stripped from `mobile-shell.css`.
- Shipped a branding refresh (#65): real favicons/OG-image/wordmark replacing a
  placeholder text SVG; GitHub social preview image uploaded manually (no API).
- **WCC mouse-look reopened**: a user report that it was still broken live despite an
  earlier merged fix. This session ruled out a routing-pattern cause (WCC shares the
  same walker code as every other published space) and couldn't reproduce via
  `input-check.mjs` (its debug hook is dev-only, stripped from prod), and was left
  waiting on a concrete repro. **Later resolved** — three separate mouse-look root
  causes were subsequently found and fixed (see `docs/ai/known-fixes.md`: a silent
  `reloadDocument()` failure blocking input behind an invisible overlay; drag-look
  sensitivity mistuned 3x too gentle for non-pointer-lock users; a spawn effect
  replacing `playerRef.current` instead of mutating it, orphaning the mouse-look
  listeners' closure). None reference this session, so the link was only visible by
  reading both.
- Still open at the time, unclear if since resolved: `self-host` and
  `claude/di-iiii-new-space-kbywad` branches were deliberately left undeleted pending
  a human call — both still exist as of 2026-08-06, worth a decision.

## 2026-08-06 — Two sessions' CURRENT.md notes, recovered from unreachable commits

**Why this entry exists:** a forensic pass (`git fsck --dangling`) found that two
concurrent sessions on 2026-08-05/06 each wrote real notes into `CURRENT.md`, and a
third, later session on a different branch overwrote the whole file (per its own
"replace, don't append" convention) before either had merged into `dev`. No code was
lost — only these notes, which existed nowhere else. Recovered via `git show <sha>:CURRENT.md`
and folded in here rather than restored to CURRENT.md itself, since neither describes
`dev`'s current state. This is also the concrete case study behind the CURRENT.md
race fix below (session notes now live in `docs/ai/sessions/`, one file per branch,
so they can't be overwritten by a concurrent branch again).

**From `bb9db2b4` (2026-08-06, "the audit's leftovers" session):**
- The Open Space scene is designed and rendered but **still not applied** — the
  scene-ops write was denied by the tool permission classifier, so it exists only as
  `/home/nooo/open-space.dii-project.zip` (import at `/open?ui=show` → Load Scene;
  import replaces the whole scene). **Still an open TODO** — re-added to CURRENT.md's
  Open section.
- A parallel tools survey hit its session limit — only the realtime-audio and
  observability strands returned results; 3D/XR, creative-coding, infra, video and ML
  strands still need re-running.

**From `71a729e1` (2026-08-05, `feat/timeline-core` session recap):**
- Algovrithm's art was separated from its tool: `AlgoVrithmExperience` cut from 747 to
  404 lines (playback + fullscreen + VR/AR only, no editor); the editor moved to
  `src/raw/director/` and became a tool that takes a piece descriptor (`pieces.js` is
  the only file that knows algovrithm exists).
- Two new Raw nodes, `view.director` and `view.timeline`, verified in a real browser.
  Node types can now declare `defaultFrame` — without it the director opened at
  360×280 and cropped.
- `src/project/timeline/timelineCore.js`: a frame-exact shared core merging
  algoVrithm's ops with cutlab's discipline, 30 tests, cross-checked against cutlab's
  33-shot REVÓ EDL (966 frames, matches MLT).
- Same-day parallel session: a crash had left a zero-length commit object under HEAD,
  repaired, with `core.fsync=loose-object,...` set globally so it can't recur; the
  GitHub App was found never wired after the cPanel→VPS move (not a stale key — never
  configured); a manual `docker compose up -d` could silently downgrade a host because
  `:latest`/`:staging` resolve against the local image cache; br_id_ge staging sync had
  been silently skipping staging for lack of `DI_SPACE_TOKEN_STAGING` and reporting
  success anyway.
- `feat/timeline-core` itself is still unpushed at the time of this recap (later pushed
  to `origin/feat/timeline-core` in the 2026-08-06 sync-safety session below) — 5
  commits, not yet landed on `dev`; branched before the phone keyboard-scroll fix, so
  it still carries the old two-corner chrome and needs a deliberate merge, not a fast-
  forward (`chromeLayout.test.js` catches the regression if it lands carelessly).

## 2026-08-04 (second session) — A dead repo, a feature that was off for three weeks, and the flaky suite pinned down

**Who:** Claude ("analyze it, look what's left" → "fix all things"). Pushed to
`dev` as `fc30eaca` + `5b6257de`; both staging deploys green. Another agent was
committing algovrithm work in the same tree throughout, so this session worked
from a separate `git worktree` and rebased before each push.

- **The repo would not open.** Every git command died on
  `object file …2946550f… is empty`. A hard machine crash at 21:46 (previous
  boot's journal ends mid-line, no shutdown target) had left the 21:25 commit
  object zero-length. Repaired by re-pointing the branch at the last good
  commit — no work lost, that commit's content was already on `origin/dev`.
  **Root cause is a git default, not a repo problem:** `core.fsync=committed`
  fsyncs packs but not loose objects, so btrfs kept the inode and lost the data
  extent. Widened `core.fsync` globally on this workstation. All seven other
  local repos scanned clean.
- **`VPS_HOST_KEY` set** — the value was read from the VPS's own
  `/etc/ssh/ssh_host_ed25519_key.pub` over an authenticated session and matched
  against `known_hosts`, rather than keyscanned. Confirmed live in the deploy
  log: pin branch taken, no `ssh-keyscan`, zero emitted warnings.
- **"Stale GitHub App key" was a misdiagnosis — the App was never connected.**
  `docker-compose.yml` passes the OAuth `GITHUB_CLIENT_*` vars but never
  `GITHUB_APP_ID` / `_PRIVATE_KEY_B64` / `_WEBHOOK_SECRET`; the VPS `.env` has
  no `GITHUB_APP_*` at all. They lived in cPanel's `deploy.env`, and the
  2026-07-15 move replaced that mechanism without carrying them. So
  `isConfigured()` had been false on both hosts since — one-click sync and
  webhooks silently off for three weeks (`br_id_ge` kept syncing only because
  it uses its own `sync-space.yml` CI path). Rotating the key would have fixed
  nothing. Wired into both compose files, documented in `.env.example`, runbook
  rewritten off cPanel. The guard derives the required names from the
  `process.env.GITHUB_APP_*` reads in `githubApp.js`, so a new var can't be
  added there and left out of compose the same way; verified with a real
  `docker compose config` run on the VPS (staging substitutes its own twins and
  does not inherit prod's webhook secret). **Secrets themselves still owed.**
- **The flaky suite: reproduced, root-caused, fixed, re-verified.** Eight
  sequential full runs were 8/8 clean — the report said "under load", so load
  was applied deliberately: two full suites at once, which failed 5 of 6 runs.
  Three independent causes, all defaults measuring the scheduler rather than
  the behavior: (1) Vitest's 5s per-test budget applied to contract tests that
  spawn a real serverXR process (failures at 5074ms/5095ms, while their own
  `waitForHealth` allows 15s for the boot alone); (2) Testing Library's 1000ms
  `findBy`/`waitFor` default (a button resolved at 1405ms); (3) `SpaceHub` read
  the preview iframe synchronously though it is two settles behind the card
  (IntersectionObserver → `visible`, then the next effect → `booted`). Same
  reproduction after the fix: 10 run summaries, 1561/1561 every time. Noted in
  known-fixes: the racy `getFreePort` (`listen(0)` → close → hand the port to a
  child) is duplicated in all five contract files — not the cause here, but a
  real TOCTOU if they ever run more parallel.
- **URL spec §7 now has a recommendation under every question**, so sign-off is
  a review rather than a design session. The load-bearing one corrects the
  spec's own premise: it claims nesting lives on `nodes[]`, but
  `normalizeEntity` has carried `parentId` all along, `StudioViewport` renders
  the entity tree recursively and `StudioShellPanels` ships drag-to-reparent.
  Entities already nest in the shipped lane → address `entities[]`, add `slug`
  there, and build **no** bridge (entity and node parents never point at each
  other, so the entity tree is closed). **Still unsigned — owner's call.**
- **Rescued a local-only commit**: the other agent's hook-path fix
  (`CLAUDE_PROJECT_DIR`) existed only on a local branch — without it the
  pre-push gate and golden-rules check silently no-op in any session not rooted
  at the repo. Cherry-picked onto `dev`; its only conflict was a known-fixes
  row `dev` already had.

## 2026-08-01 — Dependency batch, owed verifications all pass, two Raw/registry fixes, off-box backup scheduled

**Who:** Claude ("go fix all" session). Dev is ahead of prod at `a45d1d6a`,
staging-verified, awaiting owner click-through before promoting `main`.

- **Dependabot queue 15 → 2.** Merged into dev: express 5 (contracts 64/64),
  three 0.185 (verified rendering live on staging), jsdom 30 (its PR's CI
  failure was a stale July 28 base; suite green on current dev), dotenv 17,
  six actions/docker bumps. Deferred with written verdicts in
  `docs/ai/dependency-decisions.md`: MUI 9 (required `@mui/material-pigment-css`
  peer = styling-engine migration, pair with React 19), drei 10 (React 19),
  node 26 (Current not LTS until ~Oct 2026 — the 2 open PRs are deliberate).
  drei/MUI majors told `@dependabot ignore this major version`.
- **The three owed browser verifications PASS** on staging (headless
  Playwright): Raw deep nesting, EXIF round-trip on a real sideways-portrait
  upload (served asset: orientation baked, zero EXIF/GPS, assetId = sha256 of
  scrubbed bytes), Time node ticking (pixel-diff; rAF gated on Time existing).
- **Two bugs found by those verifications, fixed with guards + known-fixes
  rows:** (1) Raw "Enter ›" into a world never engaged fullscreen —
  worldNode was resolved among scope *children* only, so the no-world effect
  cancelled the just-requested fullscreen; extracted `resolveScopeWorldNode`
  (scope-is-world case) into `viewportWorldState.js`, verified live on
  staging. (2) `time` still carried `authoringOnly: true` after being
  implemented; guard test parses the runtime evaluator's `case` list so no
  evaluated type can carry the flag. Also added the missing Raw wiki article.
- **Legacy WCC page self-hosted** (`public/wcc/artist-works-land/`): Google
  Fonts → local `fonts.css` + woff2, 3 unpkg scripts → `vendor/` (SRI hashes
  match); staging probe shows zero third-party requests, fonts loaded. The
  product now makes no external requests anywhere.
- **Off-box backup scheduled**: systemd user timer `di-backup-pull` daily
  09:00 local + linger on the laptop; first run pulled 1.4 GB, integrity ok,
  18 archives / 11 G held. Archives still unencrypted at rest.
- Hygiene: local `main` fast-forwarded, stale probe scripts (`.detect.mjs`/
  `.fin.mjs`) removed, temp worktrees pruned. Known flakes (pre-existing,
  pass on rerun): SpaceHub preview test under load, contracts 429-throttle
  timing.

## 2026-07-26 — Landing "Open Studio" un-hijacked from jam mode; CI audit gate unblocked; dev→main promoted

**Who:** Claude. User-reported bug: logged-out "Open Studio" on the landing
page dumped visitors into the stripped-down jam editor at
`/open/studio/projects/open-jam`. Cause: the Jul 21 open-jam work made the
open-space hub auto-forward into the jam project ("door, not a lobby",
`StudioHub.jsx`), and the landing CTAs already pointed at `/open/studio`.
Fix: `OPEN_STUDIO_HREF` (and nav "Studio") now use the hub's existing
`?browse=1` forward opt-out; "Step inside" keeps the plain door on purpose.
Regression tests lock both hrefs (`LandingPage.test.jsx`); known-fixes entry
added. Commit `6c795fce`.

The push's staging deploy then failed at CI's `npm audit --production
--audit-level=high` gate — new high-severity advisories against transitive
`sharp@0.34.5` (libvips CVEs, via `@gltf-transform/functions → ndarray-pixels`),
unrelated to the change. Fixed with a root `overrides` entry forcing
`sharp@^0.35.3` (matching serverXR's direct dep). Commit `bada1cbd`.
Two moderate react-router advisories remain (fix = breaking v7 upgrade,
deliberately not taken; they don't block the high-level gate).

Also resolved a local/origin `dev` divergence from concurrent sessions
(rebased the Jul 19 recap commit onto the Jul 21 open-jam commits — git
auto-merged CURRENT.md by concatenation; compressed back into PROGRESS.md
this session). Staging verified green (all CI jobs + headless Playwright
href check), then user asked to promote: `dev → main` at `bada1cbd`,
production deploy green, live-verified on di-studio.xyz (hrefs correct,
zero page errors). Production now carries the full open-jam feature set,
the landing fix, and the sharp override.

## 2026-07-21 (later) — minimal jam mode UI

- User feedback: the full Studio editor overwhelms QR newbies at `/open_jam`.
  Shipped **minimal jam mode** — same floating-window UI, auto-on at the
  open-jam project only: one Create window (file upload + 5 simple shapes,
  no lights/Drive/Commons/share/delete), no Scene/World/Share/Code/Projects
  windows, no Arrange/Hub/View-live chrome, mobile nav = Create only,
  QuickInsert uses the same reduced palette. "⚒ All tools" ⇄ "◱ Simple"
  toggle in the cluster (persisted per device, `di.studio.jamAllTools`).
- New `src/studio/utils/jamMode.js` (+ `JAM_PRIMITIVES` in `entityPalette.js`);
  prop-gating in `StudioControlCluster`/`LibraryPanel`/`StudioQuickInsert`;
  wiring in `StudioShell.jsx`. Tests: `StudioJamMode.test.jsx` (7 cases).
  Wiki article updated. lint/build/902 tests/wiki check all pass.
- Follow-up (user tested staging: "can't change text"): added `JamEditPanel` —
  jam mode's whole inspector. Desktop: floating Edit window auto-appears on
  selection; mobile: an "Edit" tab next to Create. Text content ("Your text"),
  appearance color, "✕ Remove" — all through the normal `updateComponent`
  patch pipeline, so "All tools" sees identical values. +4 tests (11 jam total).
- **Concurrent-session incident, again**: mid-work, `git status` showed fresh
  edits in `src/raw/`, `src/project/graph/`, `nodeRegistry` + a new
  `useDeviceEgress.js` — another live session in this same working tree (the
  parallel-agents pattern; their in-progress `FaderControl.jsx` briefly failed
  repo-wide lint). Followed the documented rule: staged/committed ONLY own
  files after diffing each, validated per-file lint + targeted tests + build,
  left their work untouched.
- Earlier today: `/open_jam` short link + jam welcome shipped to production
  (see below).

## 2026-07-21 — open-jam short link + minimal jam welcome

- Goal: a minimalist, QR-friendly way for non-technical people to join the
  communal jam and add their own visuals. Backend/auth already supported it
  (guests get an `editor` grant on the `open` space; `open-jam` uploads work) —
  the gap was purely UX/entry.
- Shipped (frontend only, landed on `dev` → staging):
  - **Short link `/open_jam`** — a QR-/flyer-sized alias resolving to the same
    editor state as `/open/studio/projects/open-jam`, no redirect (URL stays
    short). Added in `src/studio/utils/studioRouting.js`
    (`OPEN_JAM_ALIAS_SEGMENT`/`_SPACE_ID`/`_PROJECT_ID`); SPA fallback in
    `nginx.conf` already serves it. Regression test in `studioRouting.test.js`.
  - **Minimal jam welcome** — single-beat coach at `/open_jam` only
    ("Open Create to add your visual to the jam ✨" → "Nice! ✨ Add as many as
    you like" on first add, then fades). Shows once per device for everyone
    (guest or signed-in), separate from the guest walkthrough. `StudioCoachMarks.jsx`
    refactored into a hookless dispatcher + `GuestCoach`/`JamCoach`; helpers in
    `studioGuide.js` (`STUDIO_JAM_COACH_DONE_KEY`, `shouldShowJamCoach`,
    `markJamCoachDone`); flag wired from `StudioShell.jsx`
    (`document.projectMeta.id === 'open-jam'`). Tests in `StudioCoachMarks.test.jsx`.
  - Wiki updated (`wikiContent.js`, `guest-and-sandbox-modes` article).
- Validation (Node 22 via `brew node@22` — this Mac's default Node 25 breaks
  jsdom's localStorage, an env-only issue): lint clean, build passes, 794/794
  tests, wiki check passes.
- Not done: live click-through on staging (owed after the push's deploy
  settles); not promoted to `main`/production — user has only asked for `dev`.

## 2026-07-19 — live-verified vanity links + seed on staging, reorganized Admin UI

Ran the full validation suite on the previous sessions' unpushed/unverified
work (lint/build/887 tests/64 contract tests/docs checks — all clean, one
`syncRoutes.test.js` timeout confirmed flaky under parallel load, not a
real failure), then manually click-through tested on `staging.di-studio.xyz`
via the Chrome extension: `/wcc` + `/wcc/scene` (untouched, still correct),
a bogus vanity-link segment (hits `GET /api/resolve/...`, 404s, falls
through cleanly to the plain space — no crash), `/open/studio` (not
hijacked by the new 2-segment routing), and `/open/raw` (loads clean, no
console errors). Confirmed auth gating works both directions (blocked from
a space outside the guest session's scope, allowed into a public one).
**Not verified**: the admin slug-edit UI and `ProjectSwitcher`'s "Copy
link" button — this session only had guest/anonymous access, no owner
login, on staging or local dev.

User then flagged the admin/preferences area as "messy — target audience
and backend are mixed" and asked about adding role tiers (super-admin/
admin/etc). Audited first rather than guessing: the role model itself
(`guest < viewer < editor < admin` global rank + per-space grant list +
per-space owner, `serverXR/src/authAccess.js`) is reasonable as-is — the
actual mess is `AdminManageSection.jsx`'s space/project detail panels
mixing audience-facing controls (public link, public/private, publish,
main, guest entry) with backend/infra controls (permanent/temporary,
edit-lock, raw ids, embedded GitHub-sync internals) in one undifferentiated
button grid, plus `PreferencesPage.jsx`'s "Admin Console" bundling 7
unrelated debug/telemetry tabs alongside the 2 real access-control tabs
with no visual distinction. Presented two options — reorganize-only vs.
add real owner/platform-admin tiering — user picked reorganize-only.

Shipped (`df8ac3c8`, pushed): `AdminManageSection.jsx`'s space/project
detail panels split into "Audience & publishing" vs "Storage & sync" /
"Details"; `PreferencesPage.jsx`'s `SectionNav` now groups Manage/Open
Call under an "admin" label separately from the 7 debug tabs under
"diagnostics". No schema/role/route changes — pure UI reorg. Lint clean,
build clean, 887/887 tests green. **Not yet visually confirmed** — same
no-admin-login gap as above; user was about to log in and check when this
recap was written.

## 2026-07-19 — live-verified `src/raw/`, found + fixed a real World-nesting bug

Did the manual live click-through of `/open/raw` that the previous two
sessions had shipped but never actually run (browser extension wasn't
connected until this session). Found the free-nesting/active-marker/code-
panel work all genuinely works as designed — verified by placing all 49
registered node types in one project (zero crashes, zero console errors)
and by diffing raw `parentId` values from `/api/projects/:id/document`
rather than trusting the UI.

That same API-diffing turned up a real bug the UI was actively lying
about: nesting anything **inside** a `universe.world` node — the entire
point of the previous sessions' redesign — silently landed the new node
as a **sibling** of World instead of its child, at any depth. I initially
reported this as working (trusted a UI element that looked like scope
navigation but wasn't); only caught by fetching the live document and
reading `parentId` directly. Root cause: `universe.world` (and every
other `panel-2d`-render type — Text/Image/Browser/stream panels) is
deliberately excluded from the graph canvas's card list, which was the
*only* thing wired to the scope-navigation handler — so there was no
reachable way to enter such a node's own scope at all. Fixed by adding an
`Enter ›` button to `DesktopWindow.jsx`'s per-node window header, wired to
the pre-existing `handleEnterNode` (which already handled `universe.world`
correctly — it just had no caller). Verified live at 1 and 4 levels of
nesting: children now get the correct `parentId` and render in the 3D
viewport (a cube/sphere genuinely appears on the grid). Full writeup:
`docs/ai/known-fixes.md` (last row).

**Separately confirmed and NOT yet fixed**: opening a nested World's live
3D viewport while an ancestor scope's World viewport is also mounted can
trigger `THREE.WebGLRenderer: Context Lost.` and freeze the tab's paint
pipeline (data survives — confirmed via reload — only the render/compositor
hangs). Reproduced twice in independent tabs. Likely simultaneous WebGL
context exhaustion (browsers cap concurrent contexts, ~16). Not touched
this session — flagged for whoever picks up World-viewport work next.

Committed `40d96c0d` (code + tests, 4 new tests, 891/891 suite green,
lint clean) + docs commit `a6f4b20d`. Pushed to `origin/dev`.

## 2026-07-19 — vanity space/project links + a real concurrent-edit incident

Shipped clean public links: spaces/projects get a `slug` independently
renameable from their immutable id, enabling `/wcc/artistplace`-style short
links alongside the existing `/p/{id}` and `/studio/projects/{id}` forms
(both kept forever, nothing replaced). Server: `spaces.slug`/`projects.slug`
columns, `PATCH` validation (reserved words, 409 on collision), new
`GET /api/resolve/:space/:project`. Client: `getAppLocationState` classifies
the bare two-segment shape, `SlugProjectRoute` resolves it and falls back to
a plain space route on a miss. Admin gets an "Edit public link" action;
`ProjectSwitcher` gets one-click "Copy link". Full proposal (custom domains
and in-app space export still draft-only): `docs/architecture/
SPEC_space_urls_and_portability.md`. Committed `26452eb3`.

**Real incident, now resolved**: this repo runs multiple concurrent Claude
sessions sharing the same on-disk working tree (see `docs/ai/parallel-
agents.md`). Editing `src/RootApp.jsx` landed a stray import from another
session's in-progress, uncommitted `src/raw/` lane — `src/RootApp.jsx` on
disk already had their edits when mine were applied, and the whole file got
committed together, breaking the pushed build (`f7306204` attempted a fix
by stripping the import; that raced with the other session's own fix,
`9c70e534`, which committed the real `src/raw/` files instead — `d908bcd3`
reverted `f7306204` once the actual fix was confirmed). Net effect after
all three commits: both features are intact, correctly wired, and verified
live. **Lesson for next session**: when a shared file was very likely
touched by someone else recently (long-running repo, multiple active
sessions), diff the actual staged change before committing — don't assume
"what's on disk when I `git add` this file" is only your own edit.

## 2026-07-19 — kill node-type singletons, universal code panel; committed `fe30ea53`, pushed

The `src/raw/` lane itself (fork of Beta, hierarchy-as-connection active
markers) was committed separately by a concurrent session (`9c70e534`,
after `26452eb3` shipped RootApp's seed import without the untracked
`src/raw/` directory — a real CI-breaking near-miss, now fixed). This
session's own commit (`fe30ea53`) covers the schema/registry/Beta/docs
side of the same work — the two commits together are the full picture.

User wanted free-form node nesting ("build like lego") instead of the
one-per-scope restriction a same-day-earlier session had just added a
warning for. Went through a deep multi-tool research pass (TouchDesigner,
Notch, Kantan Mapper, Houdini, Blender, Nuke, Unreal Blueprints, vvvv,
Cables.gl, Max/MSP, VCV Rack, Resolume, QLab, Ableton, Hydra) before landing
on a concrete plan — full writeup: `/home/nooo/.claude/plans/luminous-bouncing-otter.md`.
Shipped (lint/build/887 tests green throughout):

1. **Removed the singleton system entirely** — `SINGLETON_TYPE_IDS`/
   `SCOPE_SINGLETON_TYPE_IDS`/`getSingletonDedupKey` deleted from both
   `src/shared/projectSchema.js` and `shared/projectSchema.cjs` (not left
   unused — actually gone). Stripped `singleton:true` from the 6 affected
   `nodeRegistry.js` types. Removed Beta's same-day blocked-create warning
   (`getPaletteBlockReason`, `NodePalette.jsx`'s `getBlockReason` prop/CSS).
2. **New lane `src/raw/`** — full fork of `src/beta/` (first lane-forked-
   from-another-lane in the project; see `PROJECT_SURFACES.md`'s "On forking
   a new lane from Beta"), routed at `/open/raw`, wired into `RootApp.jsx`.
   Own localStorage namespace (`dii.seed.*`). Fixed one opportunistic bug
   while forking: edges are now scope-filtered before rendering.
3. **Hierarchy-as-connection active markers** (Kantan Mapper pattern) — new
   generic `workspaceState.activeNodeIdByTypeScope` map (keyed
   `typeId::scopeId`) for World/Light/Background/Grid, alongside the
   pre-existing `liveWorldNodeIdByScope`. Small ● toggle on `seed`'s graph
   node cards. Beta itself keeps its simpler `.find()`-first-match lookup.
4. **Universal code panel** — every node type (not just `node.null`) gets an
   inert "Code" inspector section, `values.__code` (distinct reserved key).
   No execution anywhere — storage/display only, deliberately out of scope.
5. Added `authoringOnly: true` (cosmetic palette tag) to the ~24 node types
   that don't compute/render anything real yet.

Design detail + explicitly-deferred Phase 2 (boundary In/Out nodes, a
closed-outer-panel/custom-parameter side-channel, Studio-as-a-brick, a
separate performance-safe surface): plan file above,
`docs/architecture/RECURSIVE_NODE_CORE.md` ("Nesting"/"The `seed` lane"),
`docs/ai/known-fixes.md` (last row). Committed (`fe30ea53`) and pushed
(`c0d33af5` on top, docs-only). Not yet manually click-verified live
(hit a real routing regression during the first attempt — a concurrent
session's `f7306204` had dropped the seed import from `RootApp.jsx`,
already reverted by `d908bcd3` before this — see "Last commit" above
before assuming that's still broken). Next: push (when asked) + a live
click-through of `/open/raw`.

## 2026-07-19 — audience/promotion/licensing

- **License**: repo now AGPL-3.0 (`LICENSE` + package.json
  `"license": "AGPL-3.0-only"`) — makes the landing's "Open source"
  claim true. Direction user-confirmed: open like a library, revenue
  from services around it, never from closing the code.
- **Promotion kit**: written this session, and since **moved out of this
  public repo** into the private `di.iiii-ops` (`promo/`) — audience plan,
  the sustainability/revenue model, the funding calendar and the unsent
  announcement drafts. 101-agent deep-research verified the festival/funding
  claims 3-0; community-launch norms did NOT survive verification — re-check
  forum rules manually before posting.
- Wiki: new "License & openness" article. Golden rule added:
  usage-limit sizing + never-brick checkpoint workflow
  (docs/ai/golden_rules.md, Agent Behavior Rules).
- **Later same session**: pushed to dev + staging live-verified (landing/
  wiki/wcc/beyond-form, zero JS errors); unbricked CI by committing the
  missing `src/raw/` lane (`9c70e534`); golden rule split into two
  (budget sizing vs same-session perk capture, `44d12e1b`); docs IA fix —
  one canonical lane map in README/CURRENT.md/AGENTS.md (`7753699c`);
  new **Producer role** (`docs/ai/roles/producer.md`, `6892b005`) —
  default first hat: classify user messages, park impulsive ideas
  verbatim+translated in `docs/ai/INBOX.md`, never mix into running work.
  Inbox has its first real entry: **sound-in-spaces** (parked). Results
  artifact page published (private) for the user.
- **Owed by user**: 60–90s demo recording; fill warm-contact names in
  drafts/stakeholders.md; approve every outbound post/mail (Notations #2
  draft ready for Jul 20); say when to promote dev → main (license goes
  live on prod only then).
- **Nothing was posted or mailed. Production untouched.**

## 2026-07-18 — Studio wrong-space bug fix + hardening batch 1+2

- Real user-reported bug: opening a project in Studio via a direct/
  bookmarked link (no space segment in the URL, e.g. from admin's
  "Open in Studio") silently landed in the `main` space instead of the
  project's real space — everything but the project document itself
  (assets, publish state, back-to-hub link) was wrong. Root cause:
  `getStudioLocationState` (`src/studio/utils/studioRouting.js`)
  hardcoded `spaceId: defaultSpaceId` for space-less URLs instead of
  leaving it unset, pre-empting `StudioEditor`'s own fallback to
  `document.projectMeta.spaceId`. Fixed + admin's two "Open in Studio"
  buttons (`AdminManageSection.jsx`) switched from an async `space`
  lookup (`space?.id`, could resolve null/stale) to `project.spaceId`
  (DB-sourced, travels with the project row). Regression tests added;
  known-fixes.md updated. Pushed to `dev`, staging verified.
- User then asked for a "full audit + hardening plan" covering this bug
  class, general security, and AI-agent stale-fact citation (caught the
  agent citing an old cPanel deploy workflow and a wrong Ollama model
  name in the same session). Planned via EnterPlanMode, approved, shipped
  in two batches (not yet pushed — local commits `1a56e9a7`, `e374d70f`):
  - **Batch 1**: `config.js` now hard-fails boot in production if
    `AUTH_SESSION_SECRET` falls back to an API token instead of only
    warning; CI + Dependabot gained `npm audit` coverage (root +
    serverXR); new `scripts/check-fallback-patterns.mjs` (CI-gated)
    greps `serverXR/src` for the "silent hardcoded fallback" bug-class
    shape; `known-fixes.md` got a bug-class header naming all 4 known
    instances; `golden_rules.md`/`agent-operating-contract.md` gained a
    "verify infra/deploy/tool facts before citing" rule.
  - **Batch 2**: new `fallbackContracts.test.js` (server-side analog of
    the spaceId bug, wired into `test:server-contracts`) +
    `authAccess.test.js` cases locking in null/undefined-spaces-means-
    unrestricted semantics; `docs:ai:check`'s rot-scan extended to
    `docs/deploy/*.md` for stale legacy-workflow-name citations — running
    it for real found and fixed two genuinely stale citations beyond the
    known allowlist candidates (`.claude/agents/infra.md` still called
    the cPanel workflow "Current deploy"; `deploy/AGENTS.md` still
    described the VPS path as unconfigured/additive when it's been live
    primary since 2026-07-15).
  - User's own global `~/.claude/CLAUDE.md` (outside this repo) also had
    the same stale cPanel deploy claim — fixed on request.
  - Full plan: `/home/nooo/.claude/plans/stateless-greeting-bengio.md`.
    Deferred items (not started): recover/re-list the ~23 untriaged audit
    findings, decide whether to test-gate `deploy-space-code.yml`, rotate
    the stale GitHub App key, a speculative periodic memory-self-audit.

## 2026-07-16 → 2026-07-17 — compressed recaps (moved from CURRENT.md; no fuller PROGRESS entries exist)

- **2026-07-17 cont'd**: landing "Enter Space" reuses the existing "Main"
  space concept (`defaultSpaceId`) rather than a new config field; a real
  Walk/Fly UX bug fixed (mislabeled exit button, not a broken mechanism);
  "Made with di.iiii" badge restyled to work on any theme.
- **2026-07-17, perf audit**: 12 fixes (build chunking, code-splitting,
  caching, query paths, render loops) shipped to prod; two live bugs found
  during manual verification and fixed (`/data/spaces` root-owned →
  EACCES, and a pre-existing mouse-look bug from a stale `playerRef`
  reassignment, `git log -L`-blamed to commit `a79c689c`).
- **2026-07-17, multi-world graphs**: `world.light`/`background`/`grid`/
  `universe.world` moved to per-scope dedup, `BetaViewport.jsx` scoped
  rendering, `workspaceState.liveWorldNodeIdByScope` live-pointer + "●"
  toggle, Studio's read-only `StudioWorldSurface.jsx` render pane
  (dev-only "W" split) — this is the multi-world/singleton system this
  session's node-graph rework builds on top of and then removes.
- **2026-07-17, Beta audit → Studio graph pane**: fixed a window-clipping
  CSS bug, extracted the node-graph engine into `src/project/graph/`,
  added Studio's first read-only graph pane (dev-only "N" split), fixed a
  Node-0-deletion safety bug.
- **2026-07-16, full repo audit**: fixed path-traversal/auth-scope bug in
  `syncRoutes.js`, a lost-update race on concurrent doc writes, confirmed
  nightly VPS backups already existed. ~23 lower findings still open, see
  `docs/ai/known-fixes.md`.
- **Earlier**: deploy pipeline made real (staging+prod on VPS/Docker/Caddy),
  OAuth sign-in bug fixed (state signed per-request, not once at startup).

## 2026-07-12 — Invite links: self-serve sharing without the admin (audit slice 6)

**Who:** Claude. Session opened with a status pass (both envs smoke-green), then
user picked the last unbuilt audit slice: owner-minted invite links. Design
locked with the user first: guests may redeem; one-button UI (no management
surface yet — server keeps list/revoke endpoints).

- `space_invites` table + `inviteStore.js`, a sibling of `syncKeyStore.js`:
  `dii_invite_<id>.<secret>`, sha256-at-rest, constant-time compare, fail-closed
  resolve, 7-day default TTL, `use_count`/`last_used_at` bumped only on redeem.
- Routes: `POST/GET/DELETE /api/spaces/:spaceId/invites` behind the existing
  `requireSpaceOwnerOrAdmin` (rate-limited mint) — scope membership is NOT
  ownership, so invited people can't mint invites (no escalation). Redeem:
  `POST /api/invites/redeem` — registered users go through
  `grantSpaceToSessionUser` (DB + cookie re-mint); guests get a cookie-only
  re-mint (30d); token-login sessions get the cookie path too. Invalid /
  expired / revoked are indistinguishable 404s.
- SpaceHub card: Invite button (owner-only, existing `.ssh-card-btn`) mints and
  copies `<origin>/<space>/studio?invite=<token>` — the studio path so the gate
  always runs, even for public spaces.
- AuthGate: `?invite=` auto-redeems when out of scope, then refreshes the
  session and strips the param; pending invite wins over the public-view
  redirect; failure adds one line to the access-restricted screen.
- Tests: 3 inviteStore unit tests (tamper/revoke/expiry/usage) + 1 end-to-end
  HTTP contract (mint gate, guest redeem, no-escalation, revoke). Wiki article
  `invite-links` added + highlighted.
- Validation: lint, build, 575 unit, 47 contracts, wiki + docs checks — green.
- Branch `feat/invite-links`; sync-key manage 403 copy generalized ("manage
  sharing for this space").

---

## 2026-07-11 — Sandbox archive + revive: permanent sandboxes never pile up

**Who:** Claude. User asked whether many future users would re-flood the studio
with sandboxes; answer was "only permanent account sandboxes grow unbounded" —
user chose the archive + revive option to close that path (PR #42, merged to dev).

- `archiveIdleAccountSandboxes` (spaceStore): account sandboxes idle past
  `ACCOUNT_SANDBOX_TTL_MS` (default 180d) snapshot their scene then delete;
  empty ones delete without a snapshot; sandboxes holding Studio projects are
  never archived (snapshots capture only the scene).
- `ensureOwnSandbox` revives: a returning owner's fresh sandbox is restored
  from its latest snapshot (sceneVersion set to 1) — the room comes back.
- Runs on the daily boot interval and inside `POST /api/admin/sandboxes/purge`
  (response now `{ ok, removed, archived }`; hub Sweep button unchanged).
- Tests: 2 store unit tests + 1 HTTP contract (build → archive → 404 → owner
  GET restores scene). Wiki article updated with the six-month promise.
- Validation: lint, build, 570 unit, 46 contracts, wiki check — all green.

---

## 2026-07-10 (night) — Guest journey rethink: three-place space model shipped

**Who:** Claude. User: "still messy… we need one sandbox per user, one open space
to collab, and the [owned spaces] for users." Storyboard agreed first (all four
decisions D1–D4 approved), then built as 4 slices:
https://claude.ai/code/artifact/d0267562-fa6d-4fa7-9c2f-be3d4e094778

### The model — three places, that's all

**Open Space** (one communal `open` space, everyone edits, ensured at boot) ·
**Your sandbox** (exactly one per identity, guests throwaway / accounts permanent) ·
**Your spaces** (owned, unchanged). Landing's primary CTA is now the door.

### Shipped (all merged to dev, tests + wiki + known-fixes each)

- **PR #38** server model — communal grant in `canAccessSpace` (no cookie re-mints),
  deterministic `getOwnSandboxSpaceId`, admin `sandboxSummary` + purge endpoint,
  daily open-space snapshot + `restore-snapshot` route. Watch out: `GUEST_SPACES=*`
  in a `.env.local` no longer means "all spaces" for guests — it falls through to
  the default open space.
- **PR #39** hub three shelves (Open Space / Your sandbox / Your spaces); admin sees
  sandboxes as one collapsed row with Sweep expired; sandbox cards hide raw ids.
- **PR #40** "Step inside" landing CTA → `/open/studio` → auto-forward into the
  boot-ensured shared `open-jam` project (`?browse=1` keeps the hub list). Guest
  first-run: `StudioCoachMarks` action-completed pills (select → add → share)
  replace the auto-opening help dialog (help stays behind `?`).
- **PR #41** keep the room — at sign-in (OAuth or token), the old guest cookie is
  still on the request; `promoteGuestSandbox` + `spaceStore.moveSpace` re-home the
  guest's whole sandbox onto the account's sandbox id. Never clobbers account work.
  Toast: "Signed in — your sandbox came with you."

### Open

- Staging verify: open space + open-jam exist after deploy; check `globalSpaceId`
  in staging/prod config (a set value repoints the commons — null → default `open`).
- Real-device click-through still owed for this + the previous session's slices.
- Slice 6 of the old audit (invite links) still designed-not-built.
- Prod promotion on user's word.

**Who:** Claude (audit fan-out: 5 parallel code-sweep agents; then single-agent fixes).
Session goal: "guest UX isn't intuitive → analyze every user type, then fix one by one."

### Audit

Mapped guest, registered creator, public viewer, WCC visitor, collaborator, mobile,
and admin journeys file-by-file. Report (journeys, ranked findings, 5 cross-cutting
patterns, 7-slice roadmap): https://claude.ai/code/artifact/a739fd54-d04c-4cad-a18e-707470c36b0a
Headlines: split-brain publish (says "Published", space stays private); public viewer
had zero path to creating; Studio had zero onboarding (hotkey table only); no
self-serve sharing; Studio ignored its own isMobile; "Settings" was an admin dead end.

### Shipped (all merged to dev, each with regression tests + wiki + known-fixes)

- **PR #32** publish intent unified — visibility disclosed + one-click Make public
  in Share window and SpaceHub card; truthful messages; no silent flips.
- **PR #33** `MadeWithBadge` view→create affordance on every public surface.
- **PR #34** `StudioHelpDialog` visual help (4 CSS-diagram guides + Shortcuts tab);
  guest first-run auto-open once per browser.
- **PR #35** guest "Keep this work" card in Share (OAuth + export); `?auth=ok` +
  `AuthReturnNotice` toast — OAuth returns are no longer silent.
- **PR #36** OAuth-first AuthGate (token behind disclosure); Drive section open by
  default; Settings/admin links admin-gated.
- **PR #37** Studio phone layout — bottom nav + sheets via shared `panelBodies` map.

### Open

- Slice 6 (self-serve sharing via owner-minted invite links) designed, NOT built —
  waiting on user approval (touches server access model).
- Staging click-through pending: phone Studio, guest welcome, OAuth toast, badge.
- Prod promotion (dev→main) after click-through.

---

## 2026-07-10 — Bundles shipped, Drive picker migration, CI noise fix

**Who:** Claude (single agent; backend + scripts + CI). Session goal: "where are we
stuck, work next" — unstick the queue, then take the deferred strategic items.

### Done this session

- **PR #26 landed** (was stuck as a conflicting draft): only conflict was CURRENT.md;
  resolved, merged to dev, staging deploy + smoke 9/9 PASS.
- **PR #28 — whole-install bundles** (the queued strategic follow-on):
  `npm run install:export/install:import` — every space + `spaces/_server-config.json`
  in one tar.gz of nested space bundles (composes `space-bundle.mjs` exports);
  `--spaces` subset, `--force`, `--owner`; `selfhost` detects install vs space bundles
  by manifest. New `installBundleContracts.test.js` (multi-space + config round-trip,
  subset, force guard). Real-data check: exported the local install (6 spaces, 98 MB),
  imported into a fresh root cleanly. Docs: SELF_HOST.md.
- **PR #29 — Drive `drive.readonly` → `drive.file` + Google Picker** (clears the
  Google-verification blocker permanently): new `picker-token` endpoint (caller's own
  token + `GOOGLE_API_KEY`/`GOOGLE_APP_ID`), shared `pick()` in `useDriveImport`
  (loads Picker on demand, imports via the existing selection path), one
  "Pick from Drive" button per surface, search now lists previously picked files.
  Wiki + `docs/ops/GOOGLE_DRIVE_INTEGRATION.md` updated. NOT runtime-tested —
  needs Cloud console (Picker API, drive.file scope, GOOGLE_APP_ID) + a real-account
  click-through on staging.
- **PR #30 — `open-pr` red-X fixed**: the fork-side auto-PR template also ran
  upstream where `UPSTREAM_PR_TOKEN` doesn't exist. Job-level repo guard (mirrored in
  `docs/templates/fork-auto-pr.yml`); verified skipped on its own push. Known-fixes row.
- Triaged PR #24 (fork `work/session`): zero code — playwright logs + `public/taron/`
  assets; left alone as someone's live WIP. Restored stray `spaces/wcc/scene.json`
  working-tree deletion.

### Next

- User: Cloud console setup + Drive click-through on staging; WCC real-mouse check on
  prod; GitHub App key from a host shell. Then promote dev→main.
- Strategic: P2P/IPFS direction per MANIFESTO (design doc first — CAS blobs and
  bundles are already content-addressed, natural fit).

## 2026-07-09 (late) — Space-card preview optimization

**Who:** Claude (single agent; UX + viewport). Follow-up to the live previews:
"i like it but need to optimized".

### Done this session

- **Low-power viewport mode** (`StudioViewport.jsx`, new `lowPower` prop): preview
  renders at full rate for 8s while assets stream in, then drops to
  `frameloop="demand"` — idle GPU cost ~0; live-sync ops re-render through React,
  which invalidates demand mode, so thumbnails still track edits. DPR pinned to 1
  (was up to 2 — 4× the pixels for a ~340px card) and `powerPreference: 'low-power'`
  so browsers may pick the integrated GPU. `PublicProjectViewer` passes
  `lowPower={isPreview}`; the real viewer is untouched.
- **Boot queue** (`SpaceHub.jsx`): at most 2 preview iframes boot concurrently
  (each is a full app instance — 4+ simultaneous boots janked first paint). A slot
  frees on iframe load, card unmount/scroll-away, or a 15s backstop.
- Tests: boot-queue test (2 mount, third waits, load frees a slot) + `low:` flag in
  viewer preview tests. Trade-off accepted: keyframe/shader animation freezes in
  thumbnails after the 8s settle — still a live frame, desirable for a grid of cards.
- **Virtual-viewport scaling** (follow-up: "previews is big than the window"): the
  iframe lays out at 1024×576 and is CSS-`scale()`d to the card (ResizeObserver keeps
  the scale on resize) — previews now show a true desktop miniature instead of the
  page's cramped mobile layout zoomed into the thumbnail.
- **Preview manager** (follow-up: "need place to manage… put image"): new Preview
  button on managed cards opens a panel — upload a custom cover image or switch back
  to the live miniature. New `spaces.preview_image_asset_id` column (ensureColumn
  migration); PATCH validates the asset exists in the space (400 malformed / 404
  missing), image served from the existing public space-assets route. Contract test +
  SpaceHub tests + wiki line.

### Next

- One-command self-host: portable space bundle (blobs + projects + meta) + bootstrap.

---

## 2026-07-09 (night) — Live previews on Spaces-hub cards

**Who:** Claude (single agent; UX + shared viewer). Finished the uncommitted SpaceHub
preview WIP found in the tree, per Gevorg's ask ("preview of spaces which has live").

### Done this session

- **Space cards** (`SpaceHub.jsx`, `studio-space-hub.css`): public spaces with a linked
  project show a 16:9 live preview — a real miniature of the published route. Smart
  loading: `SpaceCardPreview` mounts its iframe via IntersectionObserver only while the
  card is near the viewport and unmounts when scrolled away (frees the WebGL context);
  `pointer-events: none` keeps the card itself the click target.
- **Viewer preview mode** (`PublicProjectViewer.jsx`): `?preview=1` renders the authored
  orbit camera with navigation disabled and no chrome — Walk/Fly, Enter AR/VR, and the
  viewport fullscreen button all hidden (new `showChrome` prop on `StudioViewport`,
  default true). Document still live-syncs, so thumbnails follow what's published.
- Tests: SpaceHub preview gating (public+linked only, `?preview=1` src, IO mount) and
  viewer preview/non-preview flag tests. Wiki: publishing article line.

### Next

- One-command self-host: portable space bundle (blobs + projects + meta) + bootstrap.

---

## 2026-07-09 (eve) — Per-space CAS blob store (owner-approved storage change)

**Who:** Claude (single agent; BAE). Storage-format change approved by Gevorg in-session
(manifesto non-negotiable #2/#4 gate).

### Done this session

- **Blob store** (`serverXR/src/blobStore.js`): `spaces/<spaceId>/blobs/<sha256>` holds bytes
  once per space. Project uploads with sha256 ids write the blob (skip if present) plus a
  per-project `assets/<sha256>.json` reference — no more per-project binary copies. Legacy
  uuid-style ids keep the old project-local layout.
- **Reference-safe semantics** (`projectRoutes.js`): GET serves legacy local binary first,
  else the space blob but only while the project holds the meta reference (deleted assets
  404 even though the blob survives for other projects). DELETE removes only the reference.
  `/meta` probe updated for blob-backed assets.
- **GC** (`scripts/gc-space-blobs.mjs`): removes blobs no project references; dry run by
  default, `--apply` to delete, `--space`/`--spaces-dir` filters. Asset routes never
  delete blobs.
- Contract test covers: one blob for two projects, delete-in-A keeps B alive, legacy
  binary serve/delete, GC keeps referenced + reclaims orphaned. Backend README API
  section rewritten; wiki line updated.
- No client changes needed — dedupe probe (`/meta`) semantics preserved.

### Next

- One-command self-host: portable space bundle (blobs + projects + meta) + bootstrap.

---

## 2026-07-09 (later) — Content-addressed assets: client pre-hash, dedupe, integrity verify

**Who:** Claude (single agent; BAE + shared project layer)

### Done this session

- **Client pre-hash + upload dedupe** (`src/project/services/projectsApi.js`): `hashFileSha256`
  via `crypto.subtle`; `uploadProjectAsset` checks the new
  `GET /api/projects/:id/assets/:assetId/meta` endpoint and skips the byte upload when the
  project already holds the content (sha256-shaped ids only — legacy uuid ids still
  overwrite-upload). Returned meta adopts the current file's name. Degrades gracefully
  against servers without `/meta` and non-secure contexts (server hashes on receipt as before).
- **Server integrity verify** (`serverXR/src/assetHash.js`, `routes/projectRoutes.js`,
  `routes/spaceRoutes.js`): a client-supplied sha256-shaped `assetId` is now stream-hashed
  and rejected with 400 on mismatch — previously any bytes could replace an immutable-cached
  content address. Server-side hashing now streams instead of buffering whole files.
- Contract test `content-addresses project assets…` (assign / meta 200 / meta 404 / forged-id
  400 keeps original bytes / matching-id accepted), 4 client unit tests, known-fixes row,
  wiki line in "How content flows".

### Validation

`lint` ✓ · `build` ✓ · `test --run` 508/508 ✓ · `test:server-contracts` 36/36 ✓ ·
`docs:wiki:check` ✓ · `docs:ai:check` ✓

### Next

- Cross-project/space shared CAS store (one blob per hash per space) → one-command self-host.

---

## 2026-07-07 — Full audit (app + AI layer), then closed every finding it raised

**Who:** Claude (single agent; built on the morning's 6-way parallel audit)

### Done this session

- **Full audit** of the codebase, the AI instruction layer (~110 files — first time audited), CI,
  and the competitive landscape. Report artifact:
  <https://claude.ai/code/artifact/210249cb-5815-4db6-8acb-b0edf5b0fd85>. All findings transcribed
  into `docs/ai/audit-2026-07-07.md` (the durable tracker) and then **fixed in the same session**:
- **P0** (`e65bf16`, `e02a1d2`): gizmo icon mojibake, Shift+D double-duplicate, 7 a11y lint
  warnings (0-warning baseline restored); stale agent baselines/CHEATSHEET CI claims corrected;
  stale merged worktrees removed.
- **P1 security** (`1561fc3`): zero-dep rate limiting on guest-session issuance/login/OAuth/
  sync-key-mint/uploads; AUTH_SESSION_SECRET fallback warning; WCC postMessage origin check;
  Drive folderId escaping; syncRoutes off global fetch + contract test banning global fetch in
  serverXR forever.
- **P2 reliability** (`f0e5410`): Studio camera-controls ref rewired via pane registration —
  un-broke save-view, frame-selected, double-click placement, XR restore, saved-view-on-load;
  socket reconnects after unexpected disconnects; V1-scene asset delete guard; image-load
  placeholder; portal navigation via appNavigate.
- **Schema-mirror drift — the session's biggest catch** (`8b639f4`): rewrote schema-sync as a real
  ESM↔CJS equivalence test; it instantly exposed that the server's hand-mirrored CJS was
  **coercing all light/group entities to boxes and stripping `parentId`** on every server-side
  normalization. Mirror synced; the drift class now fails the pre-push gate with a real diff.
- **Lows** (`3f16755`) + **dead-code sweep** (`e397e16`): export credentials scoped to
  first-party URLs; capture-rule/data-cleanup sharp edges; wiki shortcuts refreshed; ~1,500
  verified-dead lines deleted (runtimeSchema, desktop shells, OpCreateDialog, resolvePortValue,
  projectStore vestiges, orphaned WCC CSS, useStudioLayoutPrefs).

### Validation

- `npm run lint` — 0 errors, **0 warnings** · `npm run build` — pass
- `npm run test -- --run` — 423/423 · server-contracts 29/29 · schema-sync 16/16 (now a real
  equivalence check) · `docs:ai:check` + `docs:wiki:check` — pass · `npm audit` — 0 vulns
- Staging smoke 9/9 after every push; prod smoke 9/9 after the P0 promotion.

### Open

- Promote the P1/P2/schema/Low/sweep commits `dev` → `main` (P0 already live on prod).
- Drive prod live-check + Google OAuth sensitive-scope verification (manual, user-only).
- GitHub-sync App webhook untested against a real repo push.
- Medium-confidence dead code deferred (V1 layoutMode plumbing, e2e-smoke.mjs — see tracker).

---

## 2026-06-24 — Portal object, landing CTAs, placement UX, paired audit

**Who:** Claude (multiple agents, parallel)

### Done this session

- **Portal object** (`d82f718`, `b859236`, `e2a3172`): a Studio entity that references another project — embed it inline or act as a gateway. Added `portal` as a 14th entity type in the shared `src/project/viewport/EntityContent.jsx` + `PortalObject.jsx`, with tests asserting `EntityContent` dispatches portal entities correctly. Same commit line also added view-centred placement, double-click-to-place, and portal name pickers.
- **WCC landing button + perf** (`d82f718` swept the wcc/landing edits, `09f5e05` for main landing): "Enter exhibition" restyled to solid red (`#d90000`) + white border; main di.iiii landing's "WCC Exhibition" CTA made red to match (`landing-cta-wcc`). Perf: ambient dots moved off layout-thrashing `margin` keyframes to compositor `transform` via `@property --dot-x/--dot-y`; pointer-parallax caches circle layout boxes instead of `getBoundingClientRect` per move. ~61fps desktop; remaining throttled cost is the always-on WebGL particle veil.
- **Paired deep audit** (`docs/ai/audit-2026-06-24-as-built.md` + `-as-documented.md`): same project audited two ways — as the code exactly is (all 7 gates green, 334 tests, 44 endpoints, ~57k LOC) and as the docs portray it. Surfaced that the *memory layer* drifts, not the code: PROGRESS was ~3 sessions behind, the manifesto's asset-ID seed was silently done, and the viewport Tier-1 plan had landed without being marked. Those drift items fixed alongside this entry.

### Validation

- `npm run lint` — pass (0 errors, 6 pre-existing a11y warnings)
- `npm run build` — pass (0 circular-dep warnings)
- `npm run test -- --run` — 334/334
- `npm run test:server-contracts` — 21/21 · `npm run test:schema-sync` — 13/13 · `check:three-vendor` — pass

### Open

- `dev` ahead of `main` — portal + landing live on staging, **not yet in production**.
- OAuth round-trip still unverified end-to-end. WCC hub `main` project still a placeholder sphere. Viewport extraction Tier 2/3 still open.

---

## 2026-06-23 — Walk/fly + XR locomotion, viewport de-dup, admin rewrite

**Who:** Claude (+ Codex)

### Done this session

- **Walk/fly locomotion overhaul** (`223e7b1`, `bac2e05`, `2bbf74f`, `e7ebbf2`): strafe, wider look range, drone-style decoupled flight, mobile fly support with touch up/down ascend controls, and a Walk/Fly toggle on every public space. Ported the fixes into `WccExhibition`'s duplicated `Walker`.
- **XR locomotion from scratch** (`8206780`, `e85469a`, `d6e8b6e`, `66d42f6`, `450cffc`, `5fbdd15`, `03c9b10`, `b000166`): no VR/AR movement existed before. Added AR joystick (joy.x turns, joy.y walks forward off the real camera forward), VR thumbstick locomotion + fly via right-stick Y, AR dom-overlay portal so the joystick composites in handheld AR, and AR-on-every-public-space by default (`xrDefaultMode` modifies it). Stopped the `Walker` from clobbering the camera during XR sessions.
- **Shared viewport extraction Tier 1** (`b860aba`, `448b193`): extracted `EntityContent` + `buildAssetMap` into `src/project/viewport/`, collapsing the 4× duplicated entity→object switch into one canonical renderer; added the fork-map + extraction-plan docs.
- **Admin UI rewrite** (`f1e7f93`, `d82f6f5`): section-based admin layout replacing the single-scroll mega page; repaired the stale `PreferencesPage` assertions it broke.
- **Landing + deploy fixes** (`2e50438`, `f295bd5`, `b79e109`, `5b77069`, plus dev-tooling `c8ff430`/`22b8150`): fixed the fixed-3D-background hiding section content, restored inline fly/walk + main-space sync, silenced 401/404 noise on envs without a public `main`, and added cron-independent deploy-backup pruning.

### Validation

- All work validated per-commit with lint/build/test; the 2026-06-22 audit (run just before) confirmed the suite green going into this session.

---

## 2026-06-22 — Full system audit + landing page fixes

**Who:** Claude

### Done this session

- Ran a full audit of `dev` (lint, build, full vitest suite, server-contracts, schema-sync, three-vendor, docs:ai:check — all pass) plus a live manual walkthrough (Studio, WCC, asset upload, SpaceSyncPanel, live staging dry-run sync). Full findings in `docs/ai/audit-2026-06-22.md`. `scripts/e2e-smoke.mjs`'s 16 failures were root-caused to the script itself (stale `default-scene-test` fixture ID, stale Studio tab selectors, Beta's by-design empty-canvas-until-Node-0 behavior) — not app bugs; script still needs updating, not done this session.
- **Real bug found + fixed:** landing page sections below the hero (`What is di.iiii?`, `How to use di.iiii`, `Made for everyone`, etc.) rendered with only their eyebrow label visible — body text/cards were invisible because `GridFloorBackground`'s `position: fixed; z-index: 0` canvas spans the whole scrollable page and paints over non-positioned static section content. Fixed by giving `.lp-section` `position: relative; z-index: 1; background: var(--di-black)`, matching the pattern already used on `.lp-hero-inner`. See `docs/ai/known-fixes.md`.
- **Copy fix:** landing page credit lines referenced "Hayfilm Studio," which doesn't appear anywhere in the project's own identity deck (`docs/deck/di.ii XR studio_network.pdf` — real identity is "di.i — XR studio_network", site `thedi.studio`). Changed `src/landing/LandingPage.jsx`'s Ready-section line to "Armenia · Web XR · thedi.studio" and the footer note to "Open source · Web XR · thedi.studio".
- OAuth round-trip remains unverified in this dev environment (still an open item from prior sessions — user completed a real login but the session check method used couldn't confirm it from this side).
- Set up a personal (outside-repo) dev-browser launcher at `~/bin/di-dev-browser` — isolated flatpak Chromium profile for testing, `--wipe` flag to reset. Not part of the repo.

### Validation

- `npm run lint` — pass (0 errors, 6 pre-existing a11y warnings)
- `npm run build` — pass
- `npm run test -- --run` — 326/326 pass
- `npm run test:server-contracts` — 21/21 pass
- `npm run test:schema-sync` — 13/13 pass
- Manual browser verification (Playwright) of the landing-page fix before/after, and of the copy change live on `localhost:5173`

---

## 2026-06-19 — Opt-in GLB optimization during Studio import

**Who:** Codex

### Done this session

- Added a 10 MB threshold for recommending optimization of newly imported `.glb` models.
- Added a Studio decision dialog with Optimize & upload, Upload original, and Cancel paths.
- Added a lazy browser worker that resizes embedded textures to 2048px WebP, deduplicates/welds/prunes model data, and quantizes without geometry simplification.
- Added a two-minute timeout and original-upload fallback when optimization fails.
- Verified a real 14.4 MB WCC gate model optimized to 1.9 MB in 3.8 seconds (87% reduction) with no browser errors.

### Validation

- `npm run lint` — pass
- `npm run build` — pass
- `npm run test -- --run` — 316/321 passed in a three-way parallel run; five server tests timed out under contention
- `npm run test:server-contracts` — pass, 20/20 when rerun serially
- Browser dialog smoke — pass

---

## 2026-06-19 — Portable Studio Export With Assets

- Export now produces one `.studio.zip` containing `project.json` and every project asset binary under `assets/<asset-id>/`.
- Asset-heavy exports now show live download/packing progress, fetch up to three assets concurrently, and use STORE mode instead of recompressing GLB/MP4/JPG payloads.
- Manual browser automation against WCC (asset responses stubbed small) produced `wcc.studio.zip` with zero page errors.
- Export fails with a visible activity error if any asset cannot be downloaded, preventing silently incomplete archives.
- Import accepts both `.studio.zip` and legacy `.studio.json`; bundled assets are re-uploaded into the current project using their stable asset IDs before document replacement.
- Bundle round-trip tests pass 3/3, full lint and build pass. The full suite reached 310/319 before nine files hit shared 5-second timeouts under sustained load; all nine passed 32/32 when rerun with two workers.

---

## 2026-06-19 — Studio V1 Selection/Highlight Parity

- Added V1-style orange primary and green secondary bounding-box highlights that track transformed objects.
- Selection IDs are deduplicated, validated against the document, and pruned after deletes/replacements.
- `A` selects visible, unlocked entities; Alt+A and Escape clear; `F` frames the full visible selection or all visible entities when selection is empty.
- Hidden entities no longer render. Locked entities can still be selected/inspected/highlighted but do not receive transform gizmos.
- Structure supports Ctrl/Cmd/Shift additive selection and labels hidden, locked, and primary rows; Inspector reports selection count and primary entity.
- Focused parity tests pass 14/14; complete suite passes 316/316 with four workers; full lint and production build pass.

---

## 2026-06-19 — Studio Multi-Selection Gizmo

- `A` already selected all entities; Studio now renders one shared centroid gizmo for any selection of two or more.
- Dragging G/R/S previews the matrix delta on every selected entity and commits one batched operation on release for coherent undo/history.
- X/Y/Z axis visibility applies to the shared gizmo. Single selections retain the existing per-entity gizmo.
- Matrix tests cover centroid, group translation, and group scaling; touched suites pass 10/10, scoped lint is clean, and production build passes.

---

## 2026-06-19 — Studio Transform Hotkey/Button Parity

- Keyboard `G/R/S` now selects translate/rotate/scale gizmos exactly like clicking the matching toolbar buttons; it no longer launches the separate modal operator.
- Added coverage for all three key-to-gizmo mappings and verifies the modal start callback is not called.
- Added `X/Y/Z` constraints to the active gizmo by wiring axis state to `TransformControls.showX/showY/showZ`; repeated axis restores all, and changing G/R/S clears the constraint.
- Bare X is now reserved for axis constraint; Delete/Backspace still delete and Ctrl/Cmd+X still cuts. Axis/mode tests (7/7), lint, and build pass.

---

## 2026-06-19 — Studio Floating Panel Controls

- Fixed close/collapse controls being swallowed by draggable-header pointer capture in Firefox.
- `usePanelDrag` now ignores interactive descendants when deciding whether to start a drag.
- Added a regression test; focused test, full lint, and production build pass.

---

## 2026-06-19 — Duplicate Vite Dev-Stack Guard

- Diagnosed Studio module-load failures on port 5174 as two concurrent `npm run dev` stacks.
- Set `server.strictPort: true` so duplicate Vite startup fails instead of drifting away from the HMR port.
- Stopped only the duplicate 5174 stack; the original frontend remains available on 5173.
- Enabled WebSocket forwarding on the `/serverXR` Vite proxy so Socket.IO can upgrade from polling during local development.
- Validation: `npm run build` passed; `/studio/StudioApp.jsx` returned 200 on 5173; duplicate `npm run dev:client` failed as expected with port-in-use.

---

## 2026-06-10 — Space and project workflow

**Who:** Copilot

### Done this session

- Documented the default space → Studio/Beta → public workflow in `README.md`.
- Added a workflow card to Studio Hub for space creation, project development, and publishing.
- Added a workflow card to Beta Hub for experimental project development and handoff to Studio.

### Validation

- `npm run build`

---

## 2026-05-10 — Beta graph-first workspace + world node

**Who:** Gevorg + Claude

### Done

- **Graph as primary surface** — `BetaViewSurface` removed; `BetaGraphSurface` is the permanent canvas
- **Topbar seeding** — topbar is hidden until `universe.node0` is placed; fades in on Node 0 creation
- **`universe.world` node** — singleton panel-2d node replacing the ad-hoc system viewport window
  - Panel mode: resizable `DesktopWindow` with `BetaViewport` inside
  - Overlay mode (◫): 3D world renders as transparent background behind graph
  - Fullscreen mode (⤢): world takes over screen; topbar "← World" exits
- **NodePalette**: removed `slice(0, 8)` cap; all matching nodes visible with arrow-key scroll tracking
- **`Node0PanelWindow`** and **`WorldPanelWindow`** added as dedicated panel components
- `universe.world` added to `SINGLETON_TYPE_IDS` in `projectSchema.js`
- Committed `3e8824a` to `dev` + `staging`; cPanel deploy confirmed live on `staging.di-studio.xyz`

### Validation

- `npm run test` — 81 files / 284 tests — all pass

---

## 2026-05-04d — Bundle Fix + SHA-256 Asset IDs

**Who:** Copilot

### Done this session

**Content-addressed asset IDs (complete):**
- Both upload routes (`projectRoutes.js`, `spaceRoutes.js`) already used SHA-256 — done in a prior session.
- Removed the dead `|| crypto.randomUUID()` fallback from `buildProjectAssetMeta` in `serverXR/src/projectStore.js`.
- Function now throws `Error('assetId is required')` if called without one — misuse is immediately visible.
- Removed now-unused `const crypto = require('node:crypto')` import from `projectStore.js`.

**Bundle manualChunks fix:**
- Root cause: the previous `manualChunks` omitted drei's peer deps (`detect-gpu`, `maath`, `camera-controls`, `@react-spring/three`, `@monogrid/gainmap-js`). Those landed in `vendor`, imported `three`, creating `three-vendor → vendor → three-vendor` circular init order → TDZ crash in production (SES/lockdown).
- Fix: added all missing drei peer deps to the `three-vendor` group in `vite.config.js`.
- Build now produces **no circular chunk warning**. Chunk caching is now clean: `three-vendor` and `vendor` are stable across app changes.
- **Needs runtime verification on staging** — the prior TDZ crash was a browser runtime issue. Monitor after next staging deploy.

### Chunk comparison (gzip)

| Chunk | Before | After |
|---|---|---|
| three ecosystem | 462 + 234 kB (split) | 591 kB (one stable chunk) |
| vendor (MUI + socket.io) | scattered | 391 kB (one stable chunk) |
| react | bundled in index | 46 kB separate |
| SceneCanvas | 43 kB | 5.5 kB (just the entry) |
| useAssetUrl shared | 234 kB | 3.7 kB |

### Files changed

- `vite.config.js` — restored manualChunks with complete drei peer dep list
- `serverXR/src/projectStore.js` — removed randomUUID fallback, removed crypto import
- `PROGRESS.md` — this entry

### Validation

- `npx vite build` — clean, no circular chunk warning
- `npx vitest run` — 79 files / 274 tests — all pass

### Easy wins (pick any next)

1. ~~**Routing**~~ — done. `react-router-dom@6` installed; `BrowserRouter` in `RootApp`, `useLocation()` in `AppRouter`/`useAppRoute`, `initialRoute` prop passed down to `StudioApp`/`BetaApp`. 274/274 tests pass.
2. ~~**GitHub Actions deploy**~~ — done. `deploy-staging-ssh.yml` is complete and tested in CI. Remaining step is ops-only: add `staging` environment secrets to GitHub repo settings (`STAGING_SSH_HOST`, `STAGING_SSH_PRIVATE_KEY`, `STAGING_WEB_ROOT`, `STAGING_SERVER_ROOT`, `STAGING_SHARED_ROOT`) and set `ENABLE_SSH_STAGING_DEPLOY=true`. See `docs/deploy/SSH_STAGING_DEPLOY.md`.

---

## 2026-05-04c — Manifesto Shortcut Capture Rule

**Who:** Copilot

### Done this session

- Added a permanent manifesto section requiring short reusable solution notes after solved tasks.
- Defined a compact template: Problem, Short way, Verification, Source files/commands.

### Why

- Prevent repeat investigation of already solved paths.
- Keep operational memory compact and immediately actionable.

### Files changed

- `MANIFESTO.md`

### Follow-up update

- Added a concrete shortcut entry for staging publish failures: missing `deploy/cpanel/cpanel.prebuilt.yml`, repromote flow, and verification checklist.

---

## 2026-05-04b — Outliner Panel + Tests

**Who:** Gevorg + Claude

### Done this session

**Outliner panel (node count badge → clickable toggle):**

- Converted `<span class="beta-topbar-node-count">` to a `<button>` that toggles an Outliner window
- `surfaceNodes` memo reuses the filtered array for both the count and the outliner list (was computing separately before)
- Created `OutlinerPanelWindow.jsx` — lists nodes for the active surface, shows type label + node label, highlights selected node with `is-selected`
- Outliner window is a floating `DesktopWindow`, draggable/resizable, available on all three surfaces
- CSS: node count button gets `appearance: none` reset, hover/active color brightening; `.beta-outliner button.is-selected` added

**Tests:**

- `OutlinerPanelWindow.test.jsx` — 5 tests: empty state, node list rendering, typeId fallback, is-selected class, click callback
- `BetaEditor.test.jsx` — 4 new outliner toggle tests: no button when empty, button appears with nodes, opens dialog on click, closes on second click

### Validation

- `npm run test` — 79 files / 270 tests — all pass

### Easy wins (pick any next)

1. **Bundle size follow-up** — drei subpath imports (note: `sideEffects: false` is already set in drei's package.json so tree-shaking from the index works; investigate whether chunk inflation from dynamic import boundaries is addressable with a different Rollup strategy instead)
2. **Routing** — replace manual `window.location`/`popstate` with a router library (medium-large scope; current system is clean and tested — weigh carefully)
3. ~~**Outliner node-type icon/colour**~~ — done. `OutlinerPanelWindow` already renders `.beta-outliner-dot` with `getCategoryColor(typeDef?.category)` and CSS grid layout.

---

## 2026-05-04 — geom.plane Texture + Initial Bundle Optimization

**Who:** Gevorg + Claude

### Done this session

**`geom.plane` texture support:**

- Added `textureUrl` string port to `geom.plane` in `nodeRegistry.js`
- Added `PlaneWithTexture` component in `BetaViewport.jsx` using `useTexture` from drei
- When `textureUrl` is set, renders with texture mapped; falls back to solid color otherwise
- Loads lazily inside existing `<Suspense>` boundary — no new Suspense needed

**Initial bundle optimization (index.js: 459kB → 30kB gzip):**

- Made `App`, `BlankNodeWorkspaceApp`, and `PublicProjectViewer` lazy in `SpaceSurfaceApp.jsx`
- Made `SceneCanvas`, `PresentationCanvas`, and drei `Loader` lazy in `EditorLayout.jsx`
- Fixed `SpaceSurfaceApp.test.jsx` — two sync `getByText` checks updated to async `findByText` to match new lazy rendering
- Updated `manualChunks` in `vite.config.js`: merged `xr-vendor` into `react-three`, added `@react-spring/three` to prevent circular chunk warnings; removed stale comment
- Known tradeoff: Three.js lazy chunks are larger than original (tree-shaking is less aggressive across dynamic import boundaries). Initial render is dramatically faster for landing pages and non-3D workflows.

### Validation

- `npm run lint` — 0 errors, 5 pre-existing warnings (unchanged)
- `npm run test` — 78 files / 261 tests — all pass

### Easy wins (pick any next)

1. **GitHub Actions deploy** — replace cPanel cron. Push to `staging` → build → rsync + SSH restart. IE role. New workflow file.
2. **Outliner panel** — node count badge in topbar has no click target. Wire it to an outliner panel.
3. **Bundle size follow-up** — `drei` tree-shaking regresses with lazy imports. Root fix: use drei subpath imports (`@react-three/drei/web/Grid`) instead of top-level index in viewport components. ~15 targeted import changes.
4. **Routing** — replace manual `window.location`/`popstate` with a router library.

---

## 2026-05-04 — Undo/Redo + AI Company Structure + Ollama Integration

**Who:** Gevorg + Claude

### Changes

**Undo/redo in Beta editor:**
- Wrapped `applyLocalOps` with a history-tracking layer inside `BetaEditor.jsx`
- All structural ops (everything except `setWorkspaceState`) push the current document to a 50-entry undo stack
- `Ctrl+Z` / `Cmd+Z` restores previous document state via `replace-document` dispatch
- `Ctrl+Shift+Z` / `Ctrl+Y` redoes
- Input/textarea fields correctly ignore the shortcut
- Fixed stale `windowLayout.test.js` assertions (expected old formula values, now reflect `bottom + 8`)

**AI company structure** (`docs/ai/roles/`):
- 10 role cards: UI/UX Engineer, Node System Engineer, 3D/Viewport Engineer, Backend/API Engineer, Schema/Protocol Engineer, Infrastructure Engineer, QA/Test Engineer, Security Auditor, Technical Architect, Documentation Engineer
- Each card has: owned files, forbidden files, elite domain knowledge, done criteria
- Role routing table added to root `AGENTS.md`

**Token efficiency + Ollama integration:**
- `scripts/ollama-task.sh` — safe CLI wrapper for 5 Ollama tiers (fast/deep/coder/general/tiny)
- `dob-fast` and `dob-deep` are project-fine-tuned — called without system prompt override
- Model routing guide at `docs/ai/roles/model-routing.md`
- Token budget rules added to `AGENTS.md` (startup context limits, tool budgets)
- All 4 AI tools (Claude, Gemini, Copilot, Cursor) now receive role routing table + token efficiency rules via their bridge files
- `npm run docs:ai:sync` regenerates all 16 bridge files automatically

### Validation

- `npm run lint` — 0 errors, 5 pre-existing warnings (unchanged)
- `npm run test` — 78 files / 261 tests — all pass
- `npm run docs:ai:check` — pass

### Easy wins (pick any next)

1. **`geom.plane` texture** — add `textureUrl` port in `nodeRegistry.js`, read with `useTexture` in `BetaViewport.jsx`. ~30 lines. NSE + VPE.
2. **GitHub Actions deploy** — replace cPanel cron. Push to `staging` → build → rsync + SSH restart. IE role. New workflow file.
3. ~~**Content-addressed asset IDs**~~ — done. Both project and space upload routes use `SHA-256(file content)`. `buildProjectAssetMeta` fallback removed.
4. **Outliner panel** — node count badge in topbar has no click target. Wire it to an outliner panel.

---

## 2026-05-04 — Beta Layout Fixes + Full Surface Testing

**Who:** Copilot

### Done this session

Created `default-scene-test` project and systematically tested all three Beta editor surfaces. Found and fixed 4 layout bugs.

**Fixed:**
1. **Dead space below topbar**: `DEFAULT_BETA_WORKSPACE_TOP` was 168px (old value from before topbar redesign). Changed to 64px, updated `getWorkspaceTopInset` formula to `return bottom > 0 ? bottom + 8 : DEFAULT_BETA_WORKSPACE_TOP`.
2. **Viewport starts at y=0 when workflow strip hidden**: `workflowHeight` fallback was `0`, so surfaces started under topbar. Changed fallback to `workspaceTop`.
3. **Workflow strip not hiding when cube exists**: `hasWorldContent = entities.length > 0` only checked legacy entities. Beta nodes live in `document.nodes`. Fixed to `entities.length > 0 || nodes.length > 0`.
4. **Inspector overlapping workflow strip**: `.beta-selection-scaffold` had `top: 64px` hardcoded in CSS. When workflow strip height ~150px, inspector overlapped it. Added `style={{ top: workflowHeight + 'px' }}` to override.

**Tested and verified:**
- World surface: cube visible at [0,0.5,0], clickable, inspector updates on selection, no layout overlaps
- Graph surface: node cards visible, port connections show, inspector works, no overlaps  
- View surface: text panel floating window at correct position, draggable, workflow strip hides when view nodes exist

**Files changed:**
- `src/beta/utils/windowLayout.js` — DEFAULT_BETA_WORKSPACE_TOP 168→64, formula updated
- `src/beta/components/BetaEditor.jsx` — 4 fixes: workflowHeight fallback, hasWorldContent, inspector top, (surface switching)

### Follow-up fixes

- Made Beta selection surface-aware so World/View no longer inherit an unrelated selected node from another surface.
- Scoped the topbar node count to the active surface instead of counting the full mixed document.
- Filtered `view.image` asset picker options to image assets only so the node UI no longer offers incompatible project assets.
- Added focused tests for the asset-filtering inspector behavior.
- Fixed `OpCreateDialog` render loop on `Add View Node` / `Add World Node`: stable selection now comes from the memoized definitions list, which prevents the `Maximum update depth exceeded` warning when opening the create dialog.
- Completed live Beta checks for remaining todos: View surface OK, add-node flow OK (created Browser node), and graph wiring OK (created a `value.color -> geom.cube.color` edge in `default-scene-test`).

### Validation

- `npm run lint` — pass
- All surfaces load cleanly with no console errors
- Cube visible and selectable in World; inspector shows Cube ports
- Graph shows node cards with ports; edges visible as wires
- View shows floating text panel at correct y position; no overlap with topbar

---

## 2026-05-04 — Beta Graph Node Dragging + Visibility Fix

**Who:** Codex

### Done this session

- Fixed Beta Graph surface not showing node cards: removed inline `position: 'relative'` that was breaking `position: absolute; inset: 0` CSS.
- Fixed `topInset` calculation to use `offsetTop + offsetHeight` for proper workflow strip offset.
- Added auto-scroll to Graph surface on mount to show nodes.
- **Added drag-to-move for graph nodes**: nodes now respond to click-and-drag to reposition in the graph canvas. Cursor changes to `grab`/`grabbing` to indicate affordance.
- Connected drag callback (`onMoveNode`) to persist `graphX`/`graphY` via `updateNode` operations.
- **Fixed UI overlap issues**: Workflow strip now hides when content exists on the active surface (hidden on World when entities exist, hidden on Graph when nodes exist, hidden on View when view nodes exist).

### Validation

- Node cards visible and interactive.
- Graph drag-to-move tested: moved node by (150px, 100px) and confirmed position updated.
- Workflow strip hidden on all surfaces with content (tested World and Graph).
- World viewport fully visible with no overlays.
- Graph editor showing 6 nodes with connection wires visible.
- Inspector panel positioned non-overlapping on right.
- All surfaces layout correctly with topbar and optional workflow hints.

### Completed Features

✅ Graph visibility (nodes now show)
✅ Node dragging (drag to reposition)  
✅ UI layout (no overlaps, clean workspace)
✅ Workflow hinting (shows only when empty)


---

## 2026-05-03 — Beta Empty World Affordance

**Who:** Gevorg + Codex

### Done this session

- Replaced the faint empty-world hint with a visible onboarding overlay in Beta World.
- Added a bright framed target area, crosshair, and a centered `Add World Node` button so users do not have to guess where to double-click.
- Kept double-click support, but added a direct first-action button for dark-grid scenes where the interaction was too hidden.
- Added focused viewport tests for the empty-world CTA.

### Validation

- `npm run lint` passed.
- `npm run test -- src/beta/components/BetaViewport.test.jsx src/beta/components/BetaHelpDialog.test.jsx src/beta/components/BetaHub.test.jsx src/beta/utils/betaGuide.test.js src/beta/components/BetaEditor.test.jsx` passed.

---

## 2026-05-03 — Beta Visitor/Creator First Landing

**Who:** Gevorg + Codex

### Done this session

- Added a visual Beta hub onboarding split for two audiences: `For Visitors` and `For Creators`.
- Added audience-specific steps and actions so visitors can go to the public space while creators can jump into project creation.
- Extended the in-app Beta help `Start Here` section with matching visitor/creator guidance cards.
- Updated the Beta user manual so the written docs now begin with the same two entry paths.

### Validation

- `npm run lint` passed.
- `npm run test -- src/beta/components/BetaHub.test.jsx src/beta/components/BetaHelpDialog.test.jsx src/beta/utils/betaGuide.test.js src/beta/components/BetaEditor.test.jsx` passed.

---

## 2026-05-03 — Beta Help Flow + User Manual

**Who:** Gevorg + Codex

### Done this session

- Added a Beta in-app help system with surface-aware guidance for `Start Here`, `World`, `View`, and `Graph`.
- Added a topbar `Help` button plus a workflow-strip `How To Use ...` action so users can open guidance from multiple places.
- Added shared Beta guide content in code so the in-app steps stay consistent.
- Added a written Beta manual at `docs/beta/USER_MANUAL.md` covering first steps, first connections, and current Beta expectations.

### Validation

- `npm run lint` passed.
- `npm run test -- src/beta/components/BetaHelpDialog.test.jsx src/beta/utils/betaGuide.test.js src/beta/utils/surfaceWorkflow.test.js src/beta/components/BetaEditor.test.jsx` passed.

---

## 2026-05-03 — Beta Workflow Strip Layout Fix

**Who:** Gevorg + Codex

### Done this session

- Fixed Beta surface overlap caused by the new workflow strip floating above World/View/Graph content.
- Measured workflow strip height in `BetaEditor.jsx` and passed a live top inset into each active surface.
- Updated `BetaGraphSurface.jsx` and `BetaViewport.jsx` to reserve that inset instead of rendering under the strip.
- Updated Beta surface CSS so the workflow strip participates in normal layout and the View surface honors a dynamic top offset.

### Validation

- `npm run lint` passed.
- `npm run test -- src/beta/components/BetaEditor.test.jsx src/beta/components/BetaGraphSurface.test.jsx src/beta/utils/surfaceWorkflow.test.js` passed.

---

## 2026-05-03 — Handoff Cleanup · Logical Commits · Beta Delete Key

**Who:** Gevorg + Codex

### Done this session

- Fixed `git diff --check` trailing whitespace failures in Studio/shared panel CSS.
- Reviewed the large uncommitted handoff batch and committed it in logical slices:
    - AI task contract + manifesto/golden-rules tooling
    - browser session auth gate and token removal from client requests/sockets
    - SQLite-backed serverXR persistence and migration
    - serverXR Docker image support
    - App/Preferences/StudioShell file splits
    - fallback catch annotations and visible sync warnings
    - di.i visual identity refresh across landing, Studio, Beta, and shared surfaces
- Completed quick Beta editor win: Delete/Backspace now deletes selected nodes/entities in World/View surfaces, while Graph keeps its existing graph-local handler.
- Cleared the remaining lint warnings:
    - moved `useAppState` ref updates out of render and into an effect
    - removed unused imports/destructures in Beta, Preferences, and node registry tests
    - converted intentionally ignored catch bindings to bare `catch`
    - made Beta graph/world/view interactive surfaces keyboard-addressable
- Added the opt-in SSH/VPS staging deploy path:
    - GitHub Actions workflow for `staging` / manual SSH rsync deploys
    - deployment docs for required GitHub variables/secrets and host shape
    - live deploy docs now point to the future SSH staging path while keeping cPanel as current truth
- Cleaned branch hygiene after the deploy workflow push:
    - deleted stale remote `copilot/help-with-pull-request` branch with no open PR
    - fast-forwarded local `main` and `staging` refs to their upstreams
    - closed PRs #9/#10 and deleted their `copilot/*` branches after confirmation to keep only needed branches
- Stabilized the PreferencesPage runtime metadata test by waiting for async backend health metadata before asserting release fields.
- Completed quick Beta editor win: `world.background` nodes now drive the Beta viewport background color, with legacy `worldState.backgroundColor` as fallback.

### Validation

- `git diff --check` passed after whitespace cleanup.
- SSH deploy workflow structural check passed.
- Branch cleanup verification passed: remote branch count is now 5; only `dev`, `staging`, `main`, `cpanel-staging`, and `cpanel-production` remain.
- `npm run docs:ai:sync` passed — bridges already up to date.
- `npm run docs:ai:check` passed.
- `npm run lint` passed with 0 warnings.
- `npm run test` passed: 67 files / 221 tests.
- `npm run build` passed.
- `npm run test:server-contracts` passed: 2 files / 16 tests.
- Focused Beta checks passed: `npm run test -- BetaGraphSurface.test.jsx beta/utils/betaRouting.test.js`.

---

## 2026-04-29 — AI Task Contract + MCP Guardrails

**Who:** Gevorg + Copilot

### Done this session

- Added a required **AI Task Contract** section to `AGENTS.md` with goal/priority/scope/non-goals/output/done-criteria fields.
- Added **MCP / tool-usage guardrails** to `AGENTS.md` to reduce extra tool calls and out-of-scope edits.
- Added a practical **Task Request Template** section to `README.md` so task prompts are clearer and better prioritized.
- Added `docs/ai/workflows.md` guidance for task intake checks and MCP/tool budgeting.
- Added a new golden rule in `docs/ai/golden_rules.md` to prevent tool-heavy work before contract clarity.
- Tightened contract with strict execution rules: max 2 clarifying questions, scope lock, and explicit end-of-task reporting.
- Added output response contract to keep AI replies concise and structured (summary/changes/validation/risks).
- Extended README template with a copy-paste strict task format for higher prompt control.
- Added an ultra-short default task mode block in `AGENTS.md` for always-on strict behavior.
- Added a required progress status bar contract (`status | phase X/Y | XX% | current | next`) in `AGENTS.md`.
- Added matching progress-bar fields to `README.md` strict task templates.
- Added `docs/ai/workflows.md` progress telemetry rules and blocked-state format.
- Added a universal all-model startup contract in `AGENTS.md` so Claude/Gemini/Copilot/Cursor all inherit the same behavior at project open.
- Updated `docs/ai/agent-support-matrix.md` to explicitly require the same runtime contract across all supported agent entrypoints.
- Ran AI docs maintenance checks:
	- `npm run docs:ai:sync`
	- `npm run docs:ai:check`
	- both passed.

## 2026-04-29 — File Splits · Dockerfile · Manifesto + Golden Rules

**Who:** Gevorg + Claude

### Done this session

- **App.jsx split** — all hook wiring extracted to `src/hooks/useAppState.js`. `App.jsx` is now 56 lines (was 795). Zero behavior change. 219 tests pass.
- **PreferencesPage + StudioShell splits confirmed** — these were done in a previous uncommitted session. Now documented as done.
- **Dockerfile for serverXR** — `serverXR/Dockerfile` finalized. Builds from repo root so `shared/` schema files are baked into the image. Only `/data` (SQLite + assets) is a volume. Runs as non-root user. Build: `docker build -f serverXR/Dockerfile -t dii-server .`
- **`.dockerignore`** — added at repo root. Excludes `node_modules`, `serverXR/data`, `.env`, `.git` from build context.
- **`MANIFESTO.md`** — platform vision, non-negotiables, and architectural seeds. Permanent record. Lives at repo root.
- **`docs/ai/golden_rules.md`** — living record of hard-won solutions and agent behavior rules. Wired into `AGENTS.md` and `docs/ai/index.md`.

---

## 2026-04-28 — Auth · Storage · Bug Sweep · Architecture Direction

**Who:** Gevorg + Claude

### Done this session

#### Fix 1 — Auth
- Removed `VITE_API_TOKEN` from the client bundle — the raw server token was being baked into the JavaScript at build time and was visible to anyone inspecting the bundle.
- Added `AuthGate` (`src/components/AuthGate.jsx`) — a proper login form shown when `requireAuth=true` and the user has no session. Replaces the old `window.prompt()` fallback.
- Added `useAuthSession` hook (`src/hooks/useAuthSession.js`) — fetches `/api/auth/session`, provides `login()` / `logout()`.
- Session cookies now handle all auth. Sockets already sent `withCredentials: true` so they pick up the session automatically.
- `frontend.env.production.example` no longer sets `VITE_API_TOKEN`.

#### Fix 2 — Storage
- Replaced filesystem JSON stores with SQLite (`better-sqlite3`). All space/project metadata, ops logs, and the project index now live in `{DATA_ROOT}/di.db`. Binary assets remain on disk.
- **Automatic first-startup migration**: existing `meta.json` / `ops.json` files are imported into SQLite and the migration is marked done. No manual step needed on deploy.
- **Race condition on ops fixed**: ops appends are now atomic SQLite transactions.
- **Project index is a query**: `findProjectById` no longer does a two-phase directory scan with a JSON file that could go stale.
- New files: `serverXR/src/db.js`, `serverXR/src/migrate.js`. Config: `DB_PATH` env var to override `{DATA_ROOT}/di.db`.

#### Simplify pass
- Prepared statements cached per DB instance in `spaceStore.js` and `projectStore.js` — built once, reused on every call. ~30-50% latency on metadata hot paths.
- Redundant final SELECT removed from `appendOpsHistory` / `appendProjectOps` — the routes never used the return value.
- Silent op-import failures in `migrate.js` now log with context.

#### Bug sweep
- Fixed 3 bugs where empty `catch {}` blocks were hiding real server errors in `useSceneInitializer.js` and `useLiveSync.js` — errors now surface via `console.warn`.
- Fixed 31 other intentional empty catches with `// ignore` comments — ESLint `no-empty` rule satisfied without changing behavior.
- **Result: 0 lint errors (was 37), 219 tests passing (was 219).**

### Architecture decisions made
- **VPS migration path confirmed**: serverXR backend is the move-critical piece. Frontend (static build) stays on cPanel or moves separately. Next infra step: Dockerfile + GitHub Actions.
- **Decentralization path identified**: op-log is CRDT-compatible. Asset IDs → SHA-256 content hashes would make them IPFS-compatible. These are seeds to plant, not immediate work.

---

## Current project state — for all readers

### For developers

**What exists and works:**
- Studio editor: project-based 3D scene authoring, inspector, camera, assets upload
- Beta editor: node graph system with typed ports, graph surface, wiring
- Real-time collaboration: Socket.IO + SSE ops sync, cursor sharing
- Auth: session-cookie login form, role-based access (viewer/editor/admin)
- Storage: SQLite for all structured data, filesystem for binary assets
- Deploy: cPanel Node.js App + cron pulling prebuilt GitHub branch

**What is broken or missing:**
- Delete key not wired in world/view surfaces (handler exists, no keyboard listener)
- No undo/redo in Beta editor node ops
- No outliner panel (node count badge exists, no click target)
- `geom.plane` texture port defined in registry but not read by viewport
- `world.background` node defined but viewport still reads from legacy `worldState`

**File sizes:** All three large files have been split.
- `PreferencesPage.jsx` → 443 lines (logic in `usePreferencesData.js`)
- `StudioShell.jsx` → 502 lines (panels in `StudioShellPanels.jsx`)
- `App.jsx` → 56 lines (all hook wiring in `src/hooks/useAppState.js`)

**Bundle issues:**
- `three-core` chunk: 740 kB (not lazy-loaded)
- Public production sourcemaps are disabled in Vite
- Route-level lazy loading exists for Studio/Beta/SpaceSurface, but deeper 3D chunk splitting is still open

**Routing:**
- Manual `window.location` / `popstate` — no router library
- Works but fragile; deep-link support is limited

### For designers and product

**Studio lane** (main shipped product):
- Project hub, project editor, inspector, asset panel, spaces panel, media panel
- Solid but monolithic — the large file sizes reflect this

**Beta lane** (experimental node-first direction):
- Node graph with wiring works
- Visual identity is di.i: black + cyan, square corners, monospace
- Missing: undo/redo, delete key, outliner, full viewport node feedback

**Landing page**: exists, currently double-click to reveal (hidden by default)

**What the platform is becoming**: a spatial editor for immersive XR experiences. Long-term direction is decentralized — scenes stored on IPFS, real-time via WebRTC, no central server dependency. This is the "heritage collection for future generations" vision.

### For infrastructure / ops

**Current deployment:**
- Frontend: cPanel public_html, static files
- Backend: cPanel Node.js App at `/serverXR`, PM2 via ecosystem.config.js
- Deploy trigger: cron job pulls prebuilt branch from GitHub every few minutes
- Data: `serverXR/data/` — SQLite DB + spaces directory with assets

**cPanel limitations hitting us:**
- No reliable process resurrection (PM2 restarts controlled by cPanel, not us)
- Shared disk I/O affects SQLite write performance under load
- No Docker, no background workers
- Awkward deploy pipeline (prebuilt branch model)

**Next infrastructure step:**
- Hetzner CX22 (~€4/mo): 2 vCPU, 4GB RAM, 40GB SSD
- PM2 for process management
- Nginx reverse proxy
- GitHub Actions: push → build → SSH deploy
- SQLite and assets on a mounted volume

---

## Easy wins — pick any of these next

> Self-contained. Each one 2-4 hours max. No research needed.

### Infra (unblock future scaling)
1. ~~**Dockerfile for serverXR**~~ — done. Build: `docker build -f serverXR/Dockerfile -t dii-server .` from repo root. Shared schema baked in, only `/data` volume needed at runtime.
2. **GitHub Actions workflow** — replace cPanel cron. Push to `staging` → build frontend → rsync dist + SSH restart.

### Quick feature completions
3. ~~**Delete key in world/view**~~ — done. World/View surfaces now listen for Delete/Backspace outside text inputs.
4. **`geom.plane` texture** — ~~add `textureUrl` port~~ — done (added in 2026-05-04).
5. ~~**`world.background` node drive**~~ — done. Beta viewport now reads the singleton graph node color before falling back to legacy `worldState.backgroundColor`.
6. ~~**Undo/redo in Beta**~~ — done (added in 2026-05-04b).

### File splits (reduce review friction)
7. ~~**Split `PreferencesPage.jsx`**~~ — done (`usePreferencesData.js` + `PreferencesShared.jsx`).
8. ~~**Split `App.jsx`**~~ — done (`useAppState.js` holds all wiring, `App.jsx` is 56 lines).

### Decentralization seeds
9. ~~**Content-addressed asset IDs**~~ — done. Upload routes use `crypto.createHash('sha256')`. `buildProjectAssetMeta` now requires `assetId` (no UUID fallback).

---

## Remaining priorities

| # | Priority | Item | Status |
|---|----------|------|--------|
| 1 | ~~HIGH~~ | Auth — token in bundle | ✓ Done |
| 2 | ~~HIGH~~ | Storage — filesystem race conditions | ✓ Done |
| 3 | ~~MEDIUM~~ | Large files — PreferencesPage, StudioShell, App | ✓ Done |
| 4 | ~~MEDIUM~~ | Bundle — reduce large 3D chunks | ✓ Done (manualChunks fixed · needs runtime verify) |
| 5 | MEDIUM | Routing — replace manual popstate | Open |
| 6 | INFRA | Dockerfile ✓ · GitHub Actions | Dockerfile done |
| 7 | FUTURE | Content-addressed assets (IPFS) | Routes done · client pre-hash TBD |
| 8 | FUTURE | CRDT sync (replace ops with Yjs) | Planned |
| 9 | FUTURE | WebRTC P2P mesh | Planned |

---

## Rule for all developers

**Before stopping work:**
1. Add an entry here (date, what changed, easy wins at the bottom)
2. Commit `PROGRESS.md` with your changes
3. Easy wins = tasks that are fully isolated, no research needed, clear where to start

This file is the handoff. If it is not updated, the next developer starts cold.

---

## 2026-04-24 — Node Cards + di.i Visual Identity + Staging Sync

**Who:** Gevorg + Claude

### Done this session

- **di.i visual identity applied** across beta app — `--di-cyan: #4df9ff`, black cards, square corners, monospace labels
- **Graph node cards redesigned** — hollow square `□` motif, cyan border, selected state glow
- **BetaHub main page** — `□ □ □` wordmark, `di.i studio_` heading
- **Hidden node auto-surface switch** (`BetaEditor.jsx:419`) — creating a hidden-render node auto-switches to Graph surface
- **Category colors** added to `NODE_CATEGORIES`
- **Staging updated** — dev merged to origin/staging

### Node system status

| Step | Status |
|------|--------|
| 1. Stabilize blank workspace | ~80% — missing undo/redo + keyboard shortcuts |
| 2. Local asset core | Not started |
| 3. Nodes replace legacy entities | Not started |
| 4. Graph authoring (edges/ports) | Works, no undo |
| 5. View UI fully authored | Not started |
| 6. Runtime adapters | Not started |
| 7. Recursive containers | Not started |
| 8. Publish + collaboration | Schema only |

---
