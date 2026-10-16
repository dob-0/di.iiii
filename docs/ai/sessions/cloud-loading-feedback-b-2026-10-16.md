## 2026-10-16 — loading feedback, design B: a proposal and a sketch, no code

Branch `cloud/loading-feedback-b-2026-10-16`, from `origin/dev`. This is one of two independent designs answering the owner's
report: on a big project, about 10 s of only lamps, no hall, no toolbars, nothing saying it was loading.

- Wrote `docs/ai/proposals/loading-feedback-B.md`: a survey of 23 waits with file:line, then the design.
  - One ledger and one component, `StillComing`, with two placements: `corner` once anything is drawn, and `alone` before.
    `alone` replaces `LoadingScreen`'s body; the ring stays.
  - Models still coming are drawn as dashed outlines. Their bounds are cached locally by content id.
  - Show/hide rules: 400 ms, 800 ms, 1.2 s. Nothing opaque is ever drawn over a canvas.
  - A failure is red, where the piece would stand, and says why.
  - The proposal lists the files a build would touch and its cost: about 3–4 sessions.
- Wrote `docs/ai/proposals/loading-feedback-B.html`: a static sketch in the base.css tokens. Looked at in Chromium at 1366 and
  390 wide, with no horizontal scroll. The phone pass showed the full list covering the room, so the list now folds on a phone.
- Survey findings worth keeping, even if design B is not chosen:
  - After the first frame every wait is silent, the hall included (`ModelObject.jsx`).
  - A model that fails is only a `console.warn`.
  - `StudioViewport.jsx:854` wraps every root object in one `Suspense fallback={null}`.
  - `SpaceSurfaceApp.jsx:116` swallows the space error.
  - Asset `size` and `Content-Length` are known and never read.
- Still open: no code path was found that hides the toolbars while models load. The cause of "no toolbars" is unconfirmed:
  either the opaque project-file cover, or a held main thread during `GLTFLoader.parse`. It needs a profiler run on the
  owner's project. Nothing under `src/` or `serverXR/` was changed.
