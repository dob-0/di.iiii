# Audit — the rig tools and the show pages, every device (2026-10-21)

**Measured in a real browser this time.** serverXR ran in the cloud sandbox on a throwaway data root
(`DATA_ROOT=/tmp/…`, `REQUIRE_AUTH=false`), Vite proxied `/serverXR` to it, and headless Chromium
(Playwright 1.63, `executablePath /opt/pw-browsers/chromium`) loaded every page: **32 of 32 page × device
rows mounted** with no page error. The seed is ONE project: three looks, three cues (65 s loop), no lamps,
no positions, no rental list, no venue plan. So the cards, equipment and plot pages were walked mostly
in their empty states, and the light desk is the sandbox's own (no DMX hardware). Nothing here was seen
on a real phone, a real touchpad, Safari, or with a screen reader: the owner's look on phone, touchpad
and desktop is owed (see UNVERIFIED).

Brief: `docs/ai/cloud-briefs/2026-10-13-pro-sweep.md`, agent #27, base `origin/dev`.
Area: `src/rigbuild/*Surface.jsx` (Show, Scenes, Cards, Equipment, Plot, Patch sheet, Visualiser),
`src/rigbuild/ScenesDeck.jsx`, Perform (`src/perform/`). Not touched: `BuildSurface.jsx`, `Inventory.jsx`,
RoomLookFollower, SceneBar, RoomCueList, `usePieceAssets.js`, `scripts/rigbuild/`. Crossed once:
`src/rigbuild/sheet.js` (the patch sheet's markup, row S1). No light output, patch or laser value changed.

## Method

1. **Heuristics** — Nielsen's 10 usability heuristics (NN/g), severity 0–4 (Nielsen's scale: 4 catastrophe,
   3 major, 2 minor, 1 cosmetic). Written as H1…H10 below.
2. **Accessibility** — WCAG 2.2 AA with axe-core 4.13.0 (`@axe-core/playwright` 4.13.0, pinned; tags
   wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa) on every page × device row, plus the manual checks the
   script does: target size (2.5.8: 24 px with a pointer, the brief's 44 px on touch), focus visible on 25
   Tab presses (2.4.7, 2.4.11), the plot's touchpad and pinch input, Escape on Perform's menu.
3. **Device matrix** — mouse + keyboard 1440×900 at DPR 1 and 2 · touchpad (wheel, deltaMode 0, deltaX 14.5 /
   deltaY 9.25; pinch = wheel + ctrlKey) · phone `devices['iPhone 13']` 390×844 DPR 3 · tablet 820×1180
   DPR 2 touch · keyboard only (the Tab walk, desktop rows). Touch rows skip the Tab walk.
4. **Lint** — eslint-plugin-jsx-a11y ^6.10.2 (recommended rules, the repo's config) over the 12 area files.

Script: `scripts/audit/rig-show-pages.cjs` (seeds, walks, prints one line per check, writes
`report.json` and a screenshot per page and device; exit 1 on any FAIL). How to run it is in its header.

## Numbers (same script, same seed, both trees against one serverXR)

| measure | `origin/dev` | this branch |
|---|---|---|
| matrix checks ok / FAIL (126 checks) | 83 / 43 | **94 / 32** |
| pages that mount (of 32 rows) | 32 | 32 |
| axe serious + critical nodes, all pages and rows | 66 (61 contrast, 4 aria-prohibited-attr, 1 scrollable-region-focusable) | 56 (56 contrast) |
| … of those in this area's files | 9 | **0** |
| targets under the floor in this area's own controls | 23 | 6 (V2 ×4 rows; F4's 24 px box inside a 44 px label ×2) |
| targets under the floor in shared bars (not this area) | 328 | 328 |
| Tab stops with no visible focus ring (392 stops) | 0 | 0 |
| plot: two-finger scroll pans, deltaX kept (4 rows) | 0 / 4 | 4 / 4 |
| plot: pinch zooms in · mouse notch zooms out (4 rows) | 4 / 4 · 4 / 4 | 4 / 4 · 4 / 4 |
| Perform: Escape closes the preset menu, focus back (2 rows) | 0 / 2 | 2 / 2 |
| jsx-a11y warnings in the 12 area files (unique file:line) | 0 | 0 |
| jsx-a11y suppressions in them (`eslint-disable … jsx-a11y`) | 1 (`PerformDesk.jsx` no-autofocus, the save box) | 1 (unchanged) |

The 11 checks that turned green: plot two-finger scroll ×4, plot own targets phone + tablet, Perform own
targets ×2 desktop, Perform Escape ×2, visualiser axe on the phone. None turned red. The 32 still red: 26 axe
rows whose every remaining node is in shared chrome or `Inventory.jsx` (X1, X2, E2), and 6 target rows
(V2 ×4; F4 ×2, where the script measures the 24 px box inside the 44 px label).

## Findings

Device: D = desktop mouse/keyboard, T = touchpad, P = phone, Tb = tablet, K = keyboard only, all = every row.

| id | where | heuristic / WCAG | device | sev | repro | size | state |
|---|---|---|---|---|---|---|---|
| P1 | `PlotSurface.jsx` wheel | H3 user control; brief: deltaX never dropped | T | 3 | wheel {deltaX 14.5, deltaY 9.25} on the plan: viewBox width 28.56 → 28.96 (a zoom), x/y follow the zoom only | S | fixed `58d6d9e` (`planWheel.js`) |
| P2 | `PlotSurface.jsx` | WCAG 2.5.1 Pointer Gestures (A), 2.1.1 Keyboard | P, Tb, K | 3 | the plan zooms by pinch or wheel only; no button, no key | S | fixed `262e36e` (+ − fit, keys + - 0) |
| P3 | `plot.css` plan / room, sheet handle, tool rail | WCAG 2.5.8 / brief 44 px touch | P, Tb | 2 | measured 64×40, 366×40, 59×40 | S | fixed `e4a3154` |
| P4 | `plot.css` side panel buttons, sheet links | WCAG 2.5.8 / brief 44 px touch | Tb | 2 | "print sheet 1" 116×36, "patch the room on the desk" 209×36 | S | fixed `92cd7c0` |
| P5 | `PlotSurface.jsx` | WCAG 2.1.1, H7 flexibility | K | 2 | zoomed in, a keyboard cannot pan (arrows nudge the selection). Sketch: arrows with nothing selected pan by a tenth of the view | S | OPEN |
| P6 | `PlotSurface.jsx` pointer | H3 | P, Tb | — | one-finger pan in select and the two-pointer pinch are code-read only: the script does not synthesise touch pointers | — | UNVERIFIED |
| F1 | `PerformDesk.jsx` strip menus | H3 user control; APG menu button | D, K | 3 | open "VJ ▾", press Escape: menu stays (open 1 → 1); a press elsewhere leaves it over the windows | S | fixed `3fdd7d7` |
| F2 | `PerformWindows.jsx` beat dots | WCAG 4.1.2 (axe aria-prohibited-attr, serious) | all | 2 | `.perform-beats` div with aria-label and no role, flagged on 4 of 4 rows | S | fixed `3d0f056` |
| F3 | `PerformDesk.jsx` save box | owner's rule: no production name in code or defaults | all | 2 | "Save as mine…" placeholder named a production | S | fixed `f830df8` |
| F4 | `perform.css` Follow Light, master sliders | WCAG 2.5.8 | D, P, Tb | 2 | checkbox 13×13, slider 317×16 | S | fixed `82e121b`; on touch the label is the 44 px target, the box 24 px (the script measures the box, so P/Tb still print it) |
| F5 | Perform VJ preset, narrow | H8 aesthetic, WCAG 1.4.10 Reflow | P | 3 | 390×844: Out's sentence and Clock's Reset / Follow Light are clipped under the next window; Master · Blackout is not on screen; the bottom third is empty (screenshot `perform-phone.png`, same on dev) | M — the narrow rects in `presets.js` stack and size to content, or the narrow desk scrolls | OPEN |
| F6 | `PerformDesk.jsx` role="menu" | APG menu: arrow keys between items | K | 2 | Tab walks the items; ↑/↓ do nothing | S | OPEN |
| F7 | `PerformWindows.jsx` beat dots | owner's rule "rectangles only, no circles anywhere" | all | 1 | the four beat marks are circles (not a control; `controlsAreRectangles.test.js` scans controls) | S | OPEN, owner's call |
| F8 | `PerformWindows.jsx` MasterWindow | H5 error prevention | all | 2 | blackout from a deck master of 0, then un-blackout: the deck comes back at 1 (`restore \|\| 1`). An output level — audit only, unchanged | S | OPEN |
| S1 | `sheet.js` table boxes | WCAG 2.1.1 (axe scrollable-region-focusable, serious) | P, K | 3 | 390 px: the patch table scrolls sideways in a box Tab never reaches | S | fixed `eb28987` |
| S2 | `scripts/rigbuild/patch-sheet.mjs`, `look-compare.mjs` | WCAG 2.1.1 | P, K | 2 | the same `<div class="wrap">` pattern in the crew sheet and the look comparison (not this job's files) | S | OPEN, epic-build job |
| V1 | `visualiser.css` `.vis-title` | WCAG 1.4.3 (axe color-contrast) | all | 1 | 2.89:1 on black (axe 2.9) | S | fixed `02a9406` (5.28:1) |
| V2 | `VisualiserSurface.jsx` divider | WCAG 2.5.8 / brief 44 px touch, 2.5.7 | P, Tb, D | 2 | the divider is a 6 px track: 390×6 on the phone, 6×779 on desktop. Layout buttons are the single-pointer alternative (2.5.7 holds); the target does not | S — a 24 px track on a coarse pointer with the 6 px line drawn inside it | OPEN |
| V3 | `VisualiserSurface.jsx` divider | WCAG 4.1.2 | K | 1 | a `button` named "Resize…" rather than `role="separator"` with aria-valuenow / aria-orientation | S | OPEN |
| SC1 | `ScenesDeck.jsx` sync strip | H1 visibility of status, H2 match | all | 2 | always "SYNC: OFFLINE … will sync when the other copy is reachable", but the page has no network sync: only a file carries the other copy. The sentence is the owner's sketch's (`docs/architecture/moxir-crew-ui/sketch.html`) | S | OPEN, owner's words |
| SC2 | `ScenesDeck.jsx` / `scenes.css` phone | H8, H6 recognition | P | 2 | 390×844: the sync box comes before the scenes, and the sticky UNDO / RESTORE / MARK foot covers the preview | M | OPEN |
| SC3 | `ScenesDeck.jsx` tabs | WCAG 4.1.2 | K | 1 | the inactive tab's aria-controls names a panel that is not rendered; axe did not flag it | S | OPEN |
| SC4 | `ScenesDeck.jsx` tabs | APG tabs (Home / End) | K | 1 | ←/→ move, Home / End do not | S | OPEN |
| C1 | `CardsSurface.jsx` patch conflicts | H1; WCAG 4.1.3 | screen reader | 2 | every conflict row is role="alert": N conflicts on load are N interruptions (code read; no conflict in the seed) | S | OPEN, UNVERIFIED |
| C2 | `CardsSurface.jsx` cue hold | H4 consistency | D, K | 2 | the hold box writes on blur only; Enter does nothing (the plot's fields commit on Enter) | S | OPEN |
| C3 | Cards, Equipment, Plot, Visualiser | WCAG 1.3.1 / 2.4.6 (advisory) | K, screen reader | 1 | no on-screen h1: the title is a span (Equipment's h1 is print-only) | S | OPEN |
| E1 | `equipment.js` `emptyList`, `EquipmentSurface.jsx` `money()` | known-fixes "silent hardcoded fallback" | all | 2 | a list that names no currency is costed and written as AMD | S | OPEN, owner's call (a default for every space) |
| E2 | `Inventory.jsx` tiles `.is-none .rigplot-mono` | WCAG 1.4.3 (axe, serious) | all | 2 | 3–5 nodes on every equipment row | S | OPEN, owned by #22 (never touch) |
| SH1 | show feed (`/api/spaces/:space/show/:project`) | H2 | P | 1 | a look whose colours name a group the rig does not have gets an empty swatch: every brick shows a dark square (seen with the seed; a real rig UNVERIFIED) | S | OPEN, server side |
| W1 | words across the area | `docs/ai/vocabulary.md`, H4 | all | 2 | "room" for the 3D scene (plot / cards "room", the show's "see the room", the visualiser's "The room", the rig bar's ROOM), "desk" (banned as a metaphor; in lighting it is the console's real name), and "scenes" for a look on the cue list while vocabulary gives scene to the 3D place | M | OPEN, owner's call |
| X1 | `RigSteps.jsx` `.rigsteps-title`, `.rigsteps-n` | WCAG 1.4.3 (axe, serious) | all | 2 | 17 page × row hits of the title, 8 of the step number on the phone | S | OPEN, rig bar (not in this area) |
| X2 | `DesktopWindow.jsx` `.raw-window-kicker`; the tier mark `.mode-mark-*` | WCAG 1.4.3 (axe, serious) | all | 2 | every Perform window's kicker; the LOCAL chip | S | OPEN, #26 / #29 |
| X3 | `SurfaceBar.jsx` `.sbar-*` | WCAG 2.5.8 | D, Tb | 2 | links 13 px high on desktop (15–22 per page), 30–38 × 44 on the tablet; 328 of the 334 small targets | S | OPEN, #29 |

No severity-4 finding. Every severity-3 finding that is S-sized is fixed (P1, P2, F1, S1); the one
severity-3 left (F5) is M. Seven S-sized severity 2 / 1 rows were fixed on the way (P3, P4, F2, F3, F4, V1).

## Tests (each fix: one commit, a test that failed before it)

| row | test | red before → green after |
|---|---|---|
| P1 | `src/rigbuild/plotInput.test.jsx` (wheel on the mounted plot + `createPlanWheel` cases) | 1 failed / 6 → 6 passed |
| P2 | same file, "zooms with buttons and with + / - / 0" | 1 failed / 7 → 7 passed |
| F1 | `src/perform/PerformDesk.test.jsx` "the strip menus close…" | 2 failed / 14 → 14 passed |
| F2 | same, "the clock window" | 1 failed → passed |
| F3 | same, "the save box" | 1 failed → passed |
| S1 | `src/rigbuild/PatchSheetSurface.test.jsx` "the sheet on a narrow screen, by keyboard" | 1 failed / 6 → 6 passed |
| P3 | `src/rigbuild/touchTargets.test.js` (plot) | 3 failed → 3 passed |
| F4 | same (Perform) | 2 failed / 5 → 5 passed |
| P4 | same (plot side panel) | 5 failed / 10 → 10 passed |
| V1 | `src/rigbuild/visualiserContrast.test.js` | 1 failed (2.89:1) → passed |

## UNVERIFIED

- Nothing was seen on a real screen, a real touchpad, a real phone or tablet, Safari (gesture events), or a
  screen reader. The plot's touchpad rule (planWheel.js) tells a mouse notch from a touchpad by the event
  itself; a touchpad scroll that is perfectly vertical in whole pixels from its first event reads as a
  mouse and zooms. The owner's look on phone, touchpad and desktop is owed.
- Touch drags (plot pan, visualiser divider, Perform windows) are code-read only.
- The seed has no lamps, positions or rental list: the cards' dealing, the patch bars, the equipment order
  and the plot's placing were not walked with content.
- The show page's press (a brick sends a scene to Light) was not pressed; it would change the sandbox desk's
  state, and the press path is serverXR's.
- Colour contrast over canvases and iframes (the scene preview, the room, the desk) is not measured by axe.
