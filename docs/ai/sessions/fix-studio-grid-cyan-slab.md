# The cyan slab, and Safari's missing blur (2026-08-25)

Two cross-surface defects found while auditing the UI as one suite.

## 1. The hairline-grid slab (public, on prod)
Six grids draw their 1px lattice with the classic `gap: 1px` over a
`--di-cyan-border` background. That only works while the last row is FULL —
any empty cell shows the raw background as a solid teal slab.

- `.lp-feature-grid` holds **8 cards in 3 columns**, so one slab has been live
  on the marketing page the whole time. Confirmed by screenshot on BOTH
  di-studio.xyz and staging.
- `.sh-projects-grid` (Studio) is `auto-fill`, so its column count varies with
  the viewport and a partial row is the normal case — seen as a bright teal
  block across half the last row of /dilijan/studio.

Fix: the cards draw their own right/bottom hairlines and the container draws
top/left. Same 1px lattice, but there is nothing behind an empty cell to
expose. Verified against a local build: the full grids render identically,
the slab is gone.

## 2. backdrop-filter without the -webkit- twin
23 of 39 blur declarations had no `-webkit-backdrop-filter`, so every one of
those frosted panels rendered flat on iOS Safari — the browser most visitors
and every camp phone actually use. `ui-system.md:229` already required the
pair. Added the missing 23 (purely additive: no Chrome pixel changes).

Guards: contrast, colourRoles and cssBraceBalance tests all pass.
