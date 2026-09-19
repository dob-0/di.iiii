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
