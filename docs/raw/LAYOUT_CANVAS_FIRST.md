<!-- Provenance: produced 2026-08-06 by a 9-agent research + design workflow
     (4 research strands, 3 competing designs from opposed principles, a
     3-lens judge panel). All three judges independently picked this design:
     73 points vs 56 for each runner-up.

     STATUS. Unit 1 is BUILT and shipped in commit e9d92117: semantic-zoom
     LOD tiers, the legible fit floor with the partial-view notice, Fit and
     Frame controls, the port grab radius, and the pinch fix. Everything
     else here is a proposal, not a description of the code.

     TWO THINGS THE JUDGES CUT, and the reasons, so they are not re-added
     by accident:
       - the frame WRITE-GATE (§3): clampWindowFrame already fixes the
         overhang; the gate only adds a divergence users cannot explain.
       - the focus-mode shell (scope bar + command sheet + selection bar +
         panel takeover): "a second editor shell, roughly the size of units
         1 and 3 combined" — it must not share a session with them.

     GRAFTS the judges wanted onto this design, still unbuilt:
       - one --raw-hit custom property (28px, 44px under any-pointer:coarse)
         with ::after hit expanders, instead of per-element target sizes
       - keep the Size select but rewire it as a density multiplier on the
         fit floor, rather than exiling it to a sheet
       - spawn placement from the panel node's own graph position, cascade
         only as fallback
       - a WebGL mount budget: maxMountedWorlds = clamp(2, floor(area/(320*240)), 6)
       - state thresholds derived from content minimums (CANVAS_MIN 420,
         INSPECTOR_MIN 248, PANEL_MIN 300) rather than the chosen 720/1024
-->

# CANVAS-FIRST — a layout & viewport design for the Raw editor

**Principle, stated once and then obeyed:** the graph surface is the product. It occupies `inset: 0` at every width, always. Every other thing in the lane is either (a) a thin overlay that costs ≤48px of edge, or (b) summonable and dismissable. When space runs out, the answer is never "shrink the canvas to make room" — it is "put the chrome away and navigate the canvas better." Zoom is therefore not a convenience; it is the layout mechanism.

Consequence accepted up front: **the graph and a panel never share the screen below ~720px.** You look at one or the other. That is the trade this proposal makes, and everything below follows from it.

---

## 0. The state machine (replaces the 640px cliff)

Three named states, derived from the **shell element's** width via one `ResizeObserver` in `RawEditor`, written as `data-space="roomy|tight|focus"` on `.raw-editor-shell` and mirrored to a CSS custom property. Not a media query, because the brief's own requirement ("a resized desktop window is the same problem") is a container problem, and because panel internals need to react to their own box, not the viewport.

| state | shell width | meaning |
|---|---|---|
| `roomy` | ≥ 1024 | chrome and canvas coexist; panels float |
| `tight` | 720–1023 | chrome thins, panels float but are viewport-proportioned |
| `focus` | < 720 | chrome collapses to two overlays; panels take the screen one at a time |

Additionally, and **orthogonally**, `data-pointer="coarse|fine"` from `matchMedia('(any-pointer: coarse)')` with a `change` listener. Size decides *what fits*. Pointer decides *how big the targets are and whether hover may hide anything*. A 1440px tablet gets `roomy` + `coarse`. A 500px desktop window gets `focus` + `fine`. These are never conflated again anywhere in the lane.

Hysteresis: state transitions use a 24px deadband (enter `focus` below 720, leave above 744) so a drag-resize across a boundary doesn't strobe.

Between the three states, everything continuous is `clamp()`/`min()` — no per-breakpoint pixel tables for padding or type. The three states only gate *structural* decisions (does this cluster exist inline, does this panel float or take over).

---

## 1. LAYOUT MODEL

### The invariant
`.raw-surface-shell` and `RawGraphSurface` are `inset: 0` — **full viewport, at every state, always.** `topInset` stops shrinking the graph and becomes a *fit-padding* input only (the graph is drawn under the topbar; the fit algorithm just doesn't place content there). Chrome overlays it. This alone reclaims 48–96px of canvas at every width and is the single most literal expression of the principle.

### Persistent chrome, total budget

| state | persistent chrome |
|---|---|
| roomy | topbar 48px (overlay) + nav cluster bottom-left (~140×44) |
| tight | topbar 48px (overlay) + nav cluster |
| focus | **scope bar 44px top + nav cluster bottom-right, nothing else** |

Everything else — help, examples, reset, chat, outliner, presence, view settings — is summonable from **one** control (`⌘`, the command button) and dismissable with backdrop-tap/Esc. That is the whole canvas-first bargain: one persistent affordance to reach everything, instead of eight persistent affordances each reachable.

### Per-width specification

**1440 (roomy, fine)**
- Topbar: `position: fixed; top:0; height:48px`, background `rgba(10,10,10,0.82)` + `backdrop-filter: blur(8px)` (existing near-black; no new colour, just alpha — the canvas reads through it, which is the point). Bottom hairline uses existing `--di-cyan-border`.
- Clusters inline, in priority order (§4). No horizontal scroll ever.
- Nav cluster: bottom-left, `44px` tall: `[⤢ Fit] [100%] [− +] [◎ Frame]`.
- Selection inspector: floats top-right, `width: min(340px, 26vw)`, `top: calc(var(--raw-topbar-h) + 12px)`, `max-height: min(560px, calc(100svh - var(--raw-topbar-h) - 24px))`. `container-type: inline-size` on it; its internal density (label-above vs label-beside, icon-only buttons) is a `@container` decision, so it degrades correctly when a user drags it narrow too.
- Panel windows: float, cascade-placed (§3).

**900 (tight, fine)**
- Topbar identical structure; the Priority+ measure pass has already pushed *Size* (retired, see §2) and *Examples* and *Help* into the `⋯` menu. Project name already hidden (existing 1200px rule, keep as a Priority+ rank rather than a media query).
- Inspector floats, `width: min(340px, 34vw)` → 306px. Panel windows float with viewport-proportional spawn sizing (§3), so `universe.world` spawns 680×480 → clamped to `min(680, 0.55 × 900) = 495` wide.
- Nav cluster unchanged.

**640 / 500 / 393 (focus)** — one description, three widths, nothing structural changes between them; only `clamp()`-driven padding and the sheet height differ.

- **Scope bar**, 44px, `position: fixed; top:0; left:0; right:0`, `padding-left: calc(10px + env(safe-area-inset-left))`, same on the right. Exactly three children, no scroll, no wrap:
  - `[←]` back/up-scope, 44×44, icon only.
  - **scope chip**, `flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis` — shows the *current* scope name only (not the full breadcrumb). Tapping it opens the breadcrumb as a sheet list. This is the fix for the 250px overflow: the breadcrumb is a *list*, and lists belong in sheets, not in a 393px row.
  - `[⌘]` command button, 44×44, with a dot badge when there is unread chat or ≥1 other presence user.
  - Total intrinsic minimum: 44 + 44 + ~60 = 148px. Fits 320px with 170px to spare. **No overflow is possible by construction**, because only one child is elastic and it has `min-width: 0`.
- **Nav cluster**, bottom-**right**, `position: fixed; bottom: calc(12px + env(safe-area-inset-bottom)); right: calc(12px + env(safe-area-inset-right))`. On coarse pointer it is `[⤢ Fit] [◎ Frame]`, two 44×44 buttons stacked vertically, plus the zoom % as a 24px-tall non-interactive label above them. `−/+` are dropped on coarse (pinch exists and works); they are kept on fine (wheel exists but buttons are cheap and discoverable). Bottom-right, not bottom-left, because the thumb reaches it and because nothing else will ever be there — see next item.
- **Selection**: selecting a node does **not** open a panel. It shows a **selection bar**: `position: fixed; bottom: 0; left:0; right:0; height: 44px` + safe-area padding, containing `[node label · type] [⌃ expand] [Delete]`. The nav cluster's `bottom` shifts to `calc(56px + safe-area)` when it is present — via a CSS custom property `--raw-bottom-chrome`, computed once — so **the zoom controls are never covered**. That is defect #5 designed out rather than survived.
- **Expanded inspector**: tapping `⌃` raises a sheet, `height: min(62svh, 520px)`, `max-height: 78dvh` (svh as the safe default, dvh only as the ceiling — no global dvh), with a 44px drag handle, dismiss on swipe-down / backdrop tap / Esc. It is *modal over the canvas* and explicitly temporary. Before opening it, the app fires **frame-selection** (§2) so the node you are editing is centred in the visible 38% of canvas above the sheet. This is the canvas-first move: the panel is allowed to cover the canvas *because the canvas has already been navigated so the relevant part is not under it.*
- **Command sheet** (`⌘`): full-width bottom sheet, `height: min(70svh, 560px)`, a flat single-column list with 48px rows, sectioned: **Go** (Home, breadcrumb scopes, Outliner), **View** (Fit, Frame selection, Reset zoom, card density), **Do** (Examples, Reset workspace), **Talk** (Chat, presence users). One scroll, one dismiss. This absorbs six of the eight current topbar clusters.
- **Panel-2d windows**: do not float. See §3.

Nothing here is new visual chrome: the scope bar reuses `.raw-topbar` styling, the sheets reuse the existing `.raw-selection-scaffold` bottom-sheet rules already written for ≤640px, the command sheet reuses `.raw-topbar-overflow-menu` item styling in a sheet container. Square corners, cyan hairlines, JetBrains Mono, unchanged.

---

## 2. ZOOM BEHAVIOUR

### Constants (new, in `RawGraphSurface.jsx` beside the existing ones)

```js
const GRAPH_FIT_PADDING_PX   = 24        // unchanged for roomy/tight
const FIT_PADDING_FOCUS_PX   = 16
const FIT_MAX_ZOOM           = 1         // unchanged: never magnify a fit-all
const FIT_MIN_USEFUL_ZOOM    = 0.34      // below this, fit-all refuses (see below)
const FRAME_TARGET_ZOOM      = 1         // zoom-to-selection target
const FRAME_MAX_ZOOM         = 1.6       // allowed to magnify a single small card
const LOD_LABELS             = 0.62      // below: drop port labels
const LOD_PORTS              = 0.34      // below: drop port rows entirely
const LOD_BLOCK              = 0.18      // below: solid block, no text
const CARD_CONTROL_MIN_ZOOM  = 0.5       // unchanged (enter chevron)
```

### Initial fit
On scope entry (keyed on `currentScopeId`, not `nodes.length` — entering a node is the event, node count is not): compute the bbox of the **current scope's** nodes, pad by `GRAPH_FIT_PADDING_PX` (or `FIT_PADDING_FOCUS_PX` in `focus`), plus an asymmetric top pad of `topbarHeight + 8` and bottom pad of `--raw-bottom-chrome + 8` so the fitted content lands in the *visible* canvas, not under the overlays. Zoom = `min(fitW, fitH, FIT_MAX_ZOOM)`.

**If that zoom < `FIT_MIN_USEFUL_ZOOM` (0.34), fit-all does not happen.** This is the direct answer to "33 nodes at 20% on a phone." Instead:

1. Pick a **focus target**: `selectedNodeId` → else the last node touched in this scope (persisted locally per scope) → else the node with no inbound edges that is topmost-leftmost (the graph's entry point).
2. Fit that node **plus its 1-hop neighbourhood** (direct predecessors and successors), same padding, zoom clamped to `[FIT_MIN_USEFUL_ZOOM, FIT_MAX_ZOOM]`.
3. Flash a transient, self-dismissing (3s) line in the existing `.raw-overlay-message` style: `showing 5 of 33 — ⤢ fits all`. Tapping it runs fit-all anyway, honestly, at whatever zoom that is.

You are never dropped into an unusable 20% view again, and you are never lied to about the graph being small.

### Re-triggers
- **Scope change** — always (as above).
- **Explicit `⤢ Fit`** — always available, in the nav cluster at every state. Keyboard `1` (n8n precedent), `0` resets to 100% centred on viewport centre (a *separate* command, per Steve Ruiz).
- **Container resize** — `ResizeObserver` on the graph container, 180ms debounce, and only when the user has not manually panned/zoomed since the last programmatic fit (`viewportDirtyRef`). If dirty: **re-anchor, do not re-scale** — keep zoom, translate so the document point that was at viewport centre stays at viewport centre (TouchDesigner's `home(zoom=False)` distinction). This makes a desktop window resize non-destructive, which is the behaviour the complaint is actually about.
- **Never** on node add / edge create / node move. No precedent does this and it is disorienting.

### Zoom-to-selection (`◎ Frame`) — the primary navigation verb
Fit the selected node's bbox (single node, or the union bbox of a multi-selection) with padding, zoom clamped `[FIT_MIN_USEFUL_ZOOM, FRAME_MAX_ZOOM]`, target `FRAME_TARGET_ZOOM` when the node fits comfortably. Uncapped at 1 — unlike fit-all, framing one card is *allowed to magnify*. Bound to: the nav cluster button, `.` (Blender), **double-tap on a card** (coarse pointer), and implicitly before the inspector sheet opens.

Animate: 220ms `ease-out` interpolation of `(panX, panY, zoom)` via rAF. This is the one animation added, and it exists for orientation, not decoration — an instant jump to a different scale is the classic "where am I" bug.

### Semantic zoom (LOD) — with the wire-math constraint respected

**Rule that must not be broken:** `cardHeight(node)`, `CARD_WIDTH`, `HEADER_HEIGHT`, `PORT_ROW_HEIGHT`, `inputPortCenter`, `outputPortCenter` are **untouched at every LOD tier.** The card's box and every port's centre stay at exactly the same document coordinates. LOD swaps *markup inside a box of unchanged size*, so wires never move. This is enforced by a comment and, ideally, by keeping the geometry functions in a module that the render branch cannot reach into.

| zoom | tier | card renders | ports | what the user does |
|---|---|---|---|---|
| ≥ 0.62 | **full** | header (marker, icon, label, category tag, enter chevron) + port rows with labels | dots 10px, labels 11px | everything: wire, enter, drag, inspect |
| 0.34 – 0.62 | **compact** | header with label + enter chevron; category tag hidden; port rows become 22px-tall unlabelled strips | dots only, still 10px CSS (so the *screen* target shrinks with zoom but the dot doesn't get smaller relative to the card) | wire (drop radius 36 **screen** px already forgives this), enter, drag |
| 0.18 – 0.34 | **header-only** | header label only, truncated to fit; the port-row region renders as a single filled strip of exactly `rows × PORT_ROW_HEIGHT` with hairline ticks at each port's y | **ticks, not dots** — 6×2px marks at the exact port centres so wires visibly land somewhere | pan, read structure, **tap → select → `◎ Frame`**. Wiring is not attempted here. |
| < 0.18 | **block** | solid `var(--di-card)` rect, 1px `--di-cyan-border`, no text, category colour as a 3px left edge bar | none rendered; wires still terminate at the same coordinates | pan/read topology only; tap selects and the selection bar names it; `◎ Frame` gets you there |

Two invariants: (1) nothing *appears* as you zoom out that wasn't there zoomed in — tiers only remove; (2) the tap target for **select** is the whole card at every tier, so a tap at 0.1 zoom always does something useful (select → the bottom bar tells you what you hit → Frame). The current failure mode — tiny cards where every control is under one fingertip — is answered by *removing the controls at that zoom and making the whole card one big select target*, not by trying to keep them aimable.

Hysteresis on tier boundaries: ±0.02, so a pinch that hovers on a threshold doesn't flicker markup.

**`nodeScale` / the "Size" select is retired from the topbar.** It is a 3D-viewport control mislabelled as a graph control (audit defect #1) and under canvas-first it has no business being persistent chrome. It moves into the command sheet's **View** section as "World entity size", honestly labelled. Card density is *zoom* — one mechanism, not two. This deletes a cluster from the toolbar problem for free.

---

## 3. WINDOW SIZING

### Spawn size (all states)
Default frames stop being absolute desktop numbers. Each panel type declares `{ w, h, minW, minH }`; the spawn size is:

```
w = clamp(minW, min(default.w, viewport.w * WFRAC), viewport.w - 2*PAD)
h = clamp(minH, min(default.h, usableH  * HFRAC), usableH - PAD)
usableH = viewport.h - workspaceTop - PAD
WFRAC = 0.55   HFRAC = 0.70
```

At 1440: `universe.world` → 680×480 (unchanged, defaults win). At 900: 495×480. At 720: 396×~430. Below 720 this path is not used at all (see focus mode).

### Spawn placement — cascade, not stacking
Per Raymond Chen's cascade, ephemeral, client-local:

```
STEP = 28
MAX_STEPS = max(1, floor(min(vw - w, usableH - h) / STEP))
slot = cascadeCounter++ % MAX_STEPS
x = PAD + slot*STEP;  y = workspaceTop + slot*STEP
if a same-size frame already occupies that rect (>90% IoU): slot = 0
return clampWindowFrame({x,y,w,h}, bounds)
```

`cascadeCounter` lives in a `useRef` in `RawEditor` — a placement hint for the spawning client, **never** in the op-log. Not a largest-empty-rect solver: that needs a live free-space tree and a second source of truth that would itself need syncing.

### focus (<720): panels stop floating
One panel at a time, full-bleed:
- The panel renders as a **takeover sheet**: `position: fixed; top: 44px (scope bar); left/right/bottom: 0`, with a 44px header carrying `[← back to canvas]`, the panel name, and — if more than one panel is open in this scope — a **dot switcher** (one 44×44 tap target per open panel, max 5 then `+N` into the command sheet).
- **Only the active panel is mounted.** The others are unmounted, not hidden. This is not a compromise, it is strictly better for constraint 3: today N floating world panels hold N live WebGL contexts on the smallest device in the fleet. Under focus mode the phone holds exactly one, ever. `selectMountedPanelNodes` gains an `activePanelId` parameter and returns `[activePanel]` when `space === 'focus'`.
- Suspend/resume is implemented as plain unmount/remount of the `WorldPanelWindow` subtree keyed by node id. The mechanism this establishes is reusable later for a desktop context cap, which nothing currently enforces.
- `visible !== false` still governs *whether a panel is open*; focus mode governs *which open panel is on screen*.

### Shared vs per-viewer frames — the write gate
Follow Figma's split: **document state is shared; how big your screen renders it is yours.**

- `node.values.frame.visible` stays **shared** in the op-log. Which panels are open is a document fact, multiplayer and undoable. Unchanged.
- `frame.x/y/width/height` stays **shared** — but is **written only by clients in `roomy` or `tight`.** It is desktop-authored *intent*.
- A drag/resize gesture performed while `space === 'focus'` writes to a **local store only**: `localStorage['dii.raw.frames'][documentId][nodeId]`, never an op. On mount, the rendered frame is `clampWindowFrame(localOverride ?? sharedFrame ?? spawnFrame, bounds)`.
- Reading is unchanged for everyone: the shared frame is always clamped to the local viewport before render, so a 680×480 intent never overhangs a 393px screen.

This is a ~30-line write-gating change, no new sync channel, and it kills the "phone user resizes → desktop layout corrupted" failure outright. In focus mode there is effectively nothing to resize anyway (panels are takeovers), so the gate mostly guards the 500–719px desktop-window case, which is exactly where the brief says the bug is not mobile-only.

**Op-log discipline:** during a drag/resize, the live frame updates a `useRef` + a rAF-scheduled local style write. **One** `updateNode` op is committed on `pointerup` (the existing rAF-coalescing precedent, made mandatory). The resize-driven re-clamp pass (`ResizeObserver` on the shell, 250ms debounce) **never commits** — clamping is a render-time transform, not a document edit. That is the rule that prevents a browser-window drag from producing 200 ops.

---

## 4. TOOLBAR

At 393px the toolbar problem is solved by **not having a toolbar** — three children, one elastic, mathematically incapable of overflowing (§1, focus state). The eight clusters land as:

| cluster | roomy | tight | focus |
|---|---|---|---|
| back / project name | inline (name hidden <1200 by rank) | inline, icon only | `[←]` |
| breadcrumb | inline | inline, truncated to last 2 | scope chip → sheet list |
| World toggle | inline | inline | command sheet → View |
| Size (nodeScale) | **retired** → command sheet → View | " | " |
| outliner / node count | inline | overflow menu | command sheet → Go |
| chat | inline | inline (badge only) | `⌘` badge → command sheet → Talk |
| help | inline | overflow menu | command sheet → Do |
| `⋯` / presence | inline | inline | `⌘` |
| zoom controls | **on canvas**, bottom-left | on canvas | on canvas, bottom-right |

For `roomy`/`tight` the inline set is **Priority+ with a `ResizeObserver`**, not breakpoints: measure the topbar's available width and each cluster's intrinsic width once per resize (debounced 120ms, measured against a hidden `visibility:hidden` mirror row to avoid a measure→layout→measure loop), then pop clusters into `.raw-topbar-overflow-menu` from the bottom of the priority list until the row fits with 12px slack. The overflow component **already exists** (`raw.css:1130–1220`); this wires it to a ranking instead of leaving it as decoration.

Priority (highest first): back → breadcrumb → World → outliner → chat → help → examples → Size.

**`overflow-x: auto` on the topbar is deleted.** Undiscoverable horizontal scroll on primary chrome is the anti-pattern being fixed, not a fallback to keep.

---

## 5. TOUCH — what is gated on pointer, not width

Gated on `(any-pointer: coarse)` — because a 1440px tablet needs these and a 500px desktop window does not:

- **All hit targets ≥44×44.** Topbar buttons (currently ~18–28px), inspector inputs (~30px), the checkbox (16px, no expanded hit area), the `⋯` button, the enter chevron. Implemented as `min-height:44px` + a `::after` hit-slop overlay where visual size must stay small — the *visual* design does not change, only the invisible target grows. No restyle.
- **Port drag start gets hit-slop.** Today only the *drop* is forgiving (`PORT_DROP_RADIUS_PX = 36`); the pointerdown that starts a wire must land on an 8px dot. Add a symmetric `PORT_GRAB_RADIUS_PX = 28` — on `pointerdown` anywhere on the card, if the point is within 28 screen px of a port centre **and** the tier is `full` or `compact`, start a wire drag instead of a card drag. This is the single highest-value touch fix in the lane.
- **Enter chevron always visible** (already correct at `raw.css:2271` under `(hover:none)` — keep, and extend the same rule to every other hover-revealed affordance).
- **`−/+` zoom buttons removed** from the nav cluster (pinch covers incremental); `Fit` and `Frame` take their place.
- **Double-tap on a card = Frame selection.** No hover, no chevron aiming, no precision required.
- **Long-press (450ms) on a card = context sheet** (Enter / Frame / Duplicate / Delete), replacing hover menus.

Gated on **width/space** instead: which clusters are inline, whether a panel floats, whether the inspector is a float or a sheet. Never touch-target size — that would give a mouse user on a 500px window finger-sized buttons they don't need, and a tablet user at 1100px mouse-sized buttons they can't hit.

Also: verify `index.html` carries `viewport-fit=cover`. Every `env(safe-area-inset-*)` in `raw.css` silently resolves to 0 without it, which would make the notch handling in this design decorative.

---

## 6. WHAT IT COSTS

| file | change | ~LOC |
|---|---|---|
| `src/raw/components/RawGraphSurface.jsx` | LOD tiers + render branch, fit rework (scope-keyed, min-useful floor, neighbourhood fallback), frame-selection + animation, ResizeObserver re-anchor, port grab radius, double-tap/long-press | **+380 / −60**, the bulk of the work |
| `src/raw/components/RawEditor.jsx` | space/pointer state machine, Priority+ measure loop, scope bar + command sheet + selection bar for focus, cascade counter, frame write gate, retire Size cluster | **+320 / −90** |
| `src/raw/styles/raw.css` | `[data-space]` / `[data-pointer]` rules, delete the 640px cliff block, sheets, nav cluster, `--z-*` token pass, `container-type` on panels/inspector | **+420 / −140** |
| `src/raw/utils/windowLayout.js` | proportional spawn sizing, `placeNewWindow` cascade, `selectMountedPanelNodes(activePanelId, space)` | **+90** |
| `src/raw/utils/deviceDetection.js` | add reactive `useSpace()` / `usePointer()` hooks; keep existing exports for the World path | **+60** |
| `src/raw/components/DesktopWindow.jsx` | takeover-sheet mode, one-op-per-gesture commit, local-override read path | **+110 / −20** |
| `src/raw/components/PropertyInspector.jsx` | container-query-friendly markup; no logic change | **+20** |
| `index.html` | `viewport-fit=cover` if missing | 1 |

**~1400 lines touched.** This is not a small change. Roughly 3 units of work: (1) zoom/LOD in `RawGraphSurface`, (2) the space state machine + focus chrome in `RawEditor`/CSS, (3) windows. Unit 1 is independently shippable and delivers most of the perceived fix.

**Riskiest part, in order:**

1. **The LOD render branch desyncing wires.** If any tier changes `cardHeight`, `CARD_WIDTH`, or a port centre, every wire in the graph detaches visibly. Mitigation: geometry functions stay pure and untouched; the LOD branch may only swap children inside a div whose inline `width`/`height` still come from the same functions. This wants a test asserting `outputPortCenter` is identical across all four tiers for a fixture node — cheap, and it's the one regression that would be immediately, embarrassingly visible.
2. **The Priority+ measure loop oscillating.** Classic failure: hiding a cluster changes the width, which re-triggers the observer, which shows it again. Mitigation: measure intrinsic widths from a hidden mirror row (never from the live row), debounce, and require 12px slack before promoting a cluster back inline.
3. **The frame write gate creating divergence people don't expect.** A user on a 700px window drags a panel; nothing syncs; they don't know why. Mitigation: this is only reachable in focus mode where panels are takeovers, so there is barely a gesture to lose — but the takeover sheet should say nothing rather than lie, and the shared frame must never be *deleted*, only shadowed.
4. **Removing `topInset` from the graph.** Anything that assumed the graph's rect started below the topbar (hit-testing, `clientPointToGraphPoint`, the empty-hint centring) must be re-checked. `clientPointToGraphPoint` already uses `getBoundingClientRect`, so it is fine — but the fit padding and the empty-state hint are not.
5. **Panel unmount/remount losing in-panel state.** Switching panels in focus mode unmounts a world; camera position, any transient scene state, and WebGL resources go with it. Needs the camera pose lifted into a ref keyed by node id, or switching panels feels like a reset.

**What could regress:** wire rendering at low zoom (above); the desktop float experience if the cascade or the proportional spawn sizing is wrong at 1440 (it should be a no-op there — defaults win — verify); undo behaviour around panel frames if the local-override path accidentally short-circuits an op; the 640px bottom sheet that was just built and works, which this replaces with the selection-bar + expand model (a real behaviour change for anyone used to the current build); presence pills, currently only reachable in the overflow menu, moving into the command sheet.

**Cannot be verified here.** Everything in this document is a layout claim about pixels. None of it is proven until it is looked at on a real device at a real DPR — recommend building unit 1 only (LOD + fit floor + Frame), screenshotting at 1440 / 900 / 500 / 393 at DPR 2, and reviewing that before units 2 and 3 are written.

---

## 7. WHAT THIS DELIBERATELY GIVES UP

- **Seeing the whole graph on a phone.** `FIT_MIN_USEFUL_ZOOM = 0.34` means a 33-node graph will *not* fit-to-view on a 393px screen unless you ask twice. You trade the overview for a usable working scale, and you get the overview back only by navigating (Frame, breadcrumb, outliner). If overview turns out to matter more than I think, the answer is a minimap — which I am explicitly **not** proposing, because a persistent minimap is persistent chrome on the canvas, and that is the thing this principle spends everything to avoid.
- **Side-by-side anything below 720px.** No graph-plus-inspector, no two panels, no comparing two worlds. One surface at a time. This is the biggest single concession and it is the principle's whole point.
- **Wiring at low zoom.** Below 0.34 you cannot make an edge. You must Frame in first. Accepted: you couldn't reliably do it before either — it just let you try and fail.
- **Discoverability of the eight commands** now behind `⌘`. A first-time user on a phone sees three buttons and a canvas. That is intentional (nothing competes with the graph) and it is a real cost: the affordances are one tap further away, forever. The `⌘` badge and the transient fit hint are the only compensation offered.
- **Two-thirds of a card's information when zoomed out.** The block tier is a coloured rectangle. You know topology and position; you do not know the node's name until you tap it.
- **`nodeScale` as a graph density control.** It never was one, and this proposal declines to make it one — zoom is the only density mechanism. Anyone who wanted bigger cards at the same zoom does not get them.
- **A cleaner design-token pass.** The audit found 75 rgba literals, 14 font sizes and 19 spacing values with no system. This design touches CSS heavily but proposes **only** the `--z-*` token consolidation (which is load-bearing — there is a real FAB/overlay-message collision at z-index 1300), and deliberately leaves colour/type/spacing alone, because the visual language is locked and consolidating it invites drift.
