## 2026-10-13 — cloud: arranging a rig by hand in the Studio — audit, plan, six Blender transform keys

Owner (2026-10-13 19:1x): *"objects move around their anchor point, there is no way to move an object in the world
frame; check all kinds of things that are left, missing, needed now and in future for arranging, add them."* Branch
`cloud/studio-arranging-by-hand-2026-10-13` from `fix/moxir-selection-box-and-scenes-2026-10-13` (e4bbf501). The world /
local gizmo toggle had already landed (40f53d09, b6be3e7f) and was not redone.

### Audit
- `docs/ai/plans/2026-10-13-studio-arranging-by-hand.md`: 23 needs, each with Blender manual page, exists?, file, size,
  risk; an order for before 10-17; sketches for every M/L item.
- Worth knowing first: **a look hides the hand.** While a look plays (the Studio follows the show clock by default),
  `lookPoses` → `posedEntities` replaces position and rotation of every spot light the look names, so a hand aim shows
  only on "work light", and a gizmo drag during a look writes the document while the room draws the look (read in
  code; the screen is UNVERIFIED). Plan item #22, first in the order.
- A rig lamp's entity origin is its lens (`lensFromMount`), so turning one by hand pivots at the lens, not the yoke —
  possibly what "around their anchor point" meant as much as world/local. UNVERIFIED; plan #15, a question for the owner.

### Done (one commit each, each test seen failing before the change)
- Shift+X/Y/Z during G/R/S keep a plane (Blender Axis Locking): Shift+Y slides along the floor. `modalMotion.js`,
  `ModalTransform.jsx`. Tests +3.
- **Bug fix:** a typed rotation (R Z 90) added to one Euler component — a world turn only for X — so a tilted lamp went
  elsewhere than by mouse; now the same world-axis quaternion turn. R and S take a number without an axis (R 90 = view
  axis, S 2). known-fixes row. Tests +3.
- Ctrl+Shift = precision snap (a tenth: 5 cm · 1.5° · 0.01) in G/R/S and on every gizmo. Tests +2, +1.
- Alt+G / Alt+R / Alt+S clear location / rotation / scale (Blender Object › Clear), one batch, locked objects stay;
  StudioShell's G/R/S branch skips Alt. `clearTransform.js`. Tests +2, contract +1.
- Shift+D duplicates and starts a grab on the copy (Blender Duplicate Objects); Ctrl+D copies in place.
  `StudioEditorArrange.test.jsx` +2.
- The Inspector reads rotation in degrees (stored radians; `degrees: true` on the registry's rotation fields; Nodes'
  inspector ignores it). Test +1.
- Help (`studioGuide.js`) and the wiki (Studio basics, Keyboard shortcuts) list all of it.

### Tests
- Before (base e4bbf501, full `vitest run` in a worktree): 920 files passed, 1 failed, 7 skipped; 10429 passed,
  4 failed, 2 expected fail, 58 skipped (10493).
- After (this branch, same command): 923 files passed, 1 failed, 7 skipped; 10445 passed, 4 failed, 2 expected fail,
  57 skipped (10508). +15 new tests; one more test ran instead of skipping (environment-dependent, not investigated).
- The 4 failures are the same on both: `scripts/di/oneAddressPrinted.test.js` expects `http://diiii.localhost:…`, the
  container prints `http://localhost:…` — environment, not this branch.
- `npm run lint`: 0 errors, 103 warnings (pre-existing). `npm run build`: passed. `docs:ai:check`: passed.

### UNVERIFIED
- Nothing was looked at in a browser, desktop or phone. In particular: Shift+D's grab picking up the clones (the
  unit test sees the op start, not the drag); Alt+G/R/S on Firefox/Linux, where Alt+letter can open a menu (the
  handler calls preventDefault); the "Rotation °" label width in the Inspector's compact row.
- Whether the look hides a gizmo drag on screen (plan #22).

Next: plan #22 (the room draws the document while editing, then "Keep this aim" into the look as a `point` rule), then
#13 aim-at-point and #2 local axes in G/R/S; walk all of it on dev.diiii.xyz, desktop and phone, in v2-9.
