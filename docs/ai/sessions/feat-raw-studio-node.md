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
