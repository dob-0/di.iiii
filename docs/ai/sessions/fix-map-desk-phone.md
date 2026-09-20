## 2026-09-20 — projection-mapping desk usable on a phone

- Fixed a real bug reported from a screenshot at 390x844: the map desk's
  toolbar (`src/map/MapSurface.jsx`, styled by `src/map/mapSurface.css`)
  never wrapped or scrolled, so everything after GRID (Snap/Mask/Live/Open
  output/Light) sat off-screen past the viewport edge and was unreachable
  from a phone.
- Second defect in the same screenshot: the fixed ModeMark tier badge
  (`src/components/ModeMark.jsx`/`modeMark.css`, bottom-left) covered the
  first words of the inspector's empty-state line ("Pick a surface to
  change what it shows.") in the stacked mobile layout.
- Fix, layout only, inside the file's existing 900px media query so nothing
  changes above that width (verified pixel-identical desktop screenshots
  before/after at 1440x900): `.map-bar`/`.map-bar-controls` wrap instead of
  overflowing; `.map-panel-right` gets bottom padding sized to ModeMark's
  own chip footprint, reusing its `env(safe-area-inset-bottom)` pattern.
- Verified with Playwright/Chromium against a throwaway space
  (`phone-fix-test`) with a 2-surface project, at 1440x900, 390x844 and
  360x640 (DPR 3 for the phones), before (origin/dev) and after. A script
  asserted every toolbar control's bounding box is inside the viewport
  width at both phone sizes — passed, 8/8 controls in bounds each size.
- Not checked: a real phone. A pre-existing floating "M" button (unrelated
  to this change, present identically before and after) overlaps the
  bottom hint text at 360x640 — out of scope for this fix, left untouched.

## 2026-09-20 — the stacked phone layout was overprinting itself

- A follow-up newcomer walk (after the fix above) still found two overlaps
  at 390x844, both inside `src/map/mapSurface.css`'s existing
  `@media (max-width: 900px)` block: (a) the left panel's last section (Wall
  photo / Carry) read as cut off mid-line where the canvas began right on
  top of it; (b) the drag-hint text under the canvas printed over the
  inspector's `SURFACE N` header / Delete row.
- Root cause, found by measuring rendered boxes, not guessing from CSS: the
  layout used `grid-template-rows: auto minmax(0, 1fr) auto` with
  `.map-panel { max-height: 30vh }` on the two side panels. The "auto" rows
  did not reliably respect that max-height — measured one panel rendering at
  301px against its own 253px (30vh of 844) cap — which squeezed the middle
  `1fr` canvas row thin enough that its own drag-hint (positioned after the
  stage in normal flow, with no clipping of its own) spilled past the
  canvas row's box into the inspector row below it. The same drift let the
  left panel's overflowing content report a layout position past its own
  clipped box, coinciding with the canvas row's screen position.
- Fix: gave all three rows explicit, non-"auto" sizes
  (`grid-template-rows: 30vh minmax(34vh, 1fr) 30vh`) so a panel's rendered
  box is always exactly the size its own `overflow-y: auto` clips to — one
  source of truth instead of two numbers (grid track + max-height) that
  could drift apart — and added `overflow: hidden` to `.map-frame` as the
  same guarantee for the canvas row, so the drag-hint can never spill into
  the row after it.
- Verified with Playwright/Chromium against a throwaway space, 2-surface
  project, surface 2 selected, at 390x844 and 360x640 (DPR 3), before/after.
  Confirmed by exact `getBoundingClientRect()` measurement (not just a
  screenshot) that the three rows now sit flush with no gap and no overlap
  (e.g. left panel bottom 366.19px == canvas row top 366.19px at 390x844;
  canvas row bottom 522.59px == right panel top 522.59px at 360x640), and by
  `elementFromPoint` probing the old overlap coordinates that only one
  region's content ever paints there. Desktop 1440x900 confirmed
  pixel-identical before/after (only diff: a test project's own timestamp
  in its title). No new or changed user-visible strings — layout only.
