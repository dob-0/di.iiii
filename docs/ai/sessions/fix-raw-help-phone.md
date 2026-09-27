## 2026-09-27 — Raw's Help reads on a phone

- Reproduced signed in at 390x844 DPR3 in a project's Raw page: Help kept two columns (15.98px + 260px), the
  diagram and its words a 34px sliver. Cause: the phone rule sat ~700 lines above the base rule it meant to
  override. Moved after it; rows sized to content (the clipping stage had collapsed to 34px).
- Seen after: one 298px column, stage 494px, scrolls to the last step; desktop 1440 unchanged.
- Guard: `rawHelpOrder.test.js` — any max-width rule in raw.css undone by a later base rule fails the build.
- Seen on the way, not fixed: the Help footer shows as an empty strip on a phone; the bare Raw canvas's own
  "di.iiii" wordmark sits under the bar's wordmark at 390.
