## 2026-10-13 — what MOXIR built that di.iiii should keep: an inventory and a plan

- Analysis only, no feature code. `docs/ai/plans/2026-10-13-moxir-tools-into-di-iiii.md`: every MOXIR-shaped
  viewer and Studio control, rig/look/cue/version tool and script family, what it does, where it is hard-wired
  to MOXIR, what it becomes for any space (live vs work), size, risk, and what it connects to; a proposed order;
  five questions for the owner.
- Found: no runtime code checks the space id `moxir`; MOXIR lives in data and conventions (one fixture
  library `types/moxir.json`, `EYE_HEIGHT = 1.7`, ids `rig-show` / `rig-out-*`, crane-hall aim rules,
  script defaults). Which views a visitor gets is fixed in code; authored `viewPresets` cannot hide a view.
- Safety gap, read in code, not run: three different laser type lists (`shared/laserMoments.cjs:29`,
  `sceneDeck/model.js:22`, `laserView.js:16`); a laser type carried in a project's `rentalList.types` is
  refused on the show page only by its group name. Proposed as the first step, with a failing test first.
- Not browser-verified; UNVERIFIED items are marked in the plan.
