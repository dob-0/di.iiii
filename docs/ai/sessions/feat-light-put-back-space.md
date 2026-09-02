## 2026-09-02 — The Light Put Back arrives as a space, and space:code-push turns out to be broken three ways

A new work — 14 laser photographs from MOCT × MECHATRONICA (Davit Nersisyan) run
through a photo → threshold → vector → depth-cloud → scan → ILDA pipeline — lands on
staging as the space `the-light-put-back`, not as repo code. `src/works/works.js`
says a third work never joins the platform tree, and this obeys that.

Getting it there exercised `scripts/space-code-push.mjs` for real, which is how three
faults surfaced that no test could have caught, because all three are silent:

- It sent `PATCH` to `/api/projects/:id/document`. `projectRoutes.js` registers only
  `GET` and `PUT` there, so express answered a bare `404 {}` — which reads like a
  missing project and sends you hunting in the wrong file.
- It set `presentationState.mode = 'code'` but never `entryView`. The viewer decides
  with `showCodeView = entryView === 'code'`. So the push succeeded, the file landed
  byte-for-byte (sha256 verified against the local file), the script printed
  `ok — 1 file(s) pushed`, and the published URL kept rendering an empty scene.
- `space-new.mjs` read `.env` and root `.env.local` but not `serverXR/.env.local`,
  where `LIVE_API_TOKEN` actually lives — so it refused to create a space on a repo
  that had a perfectly good token, and sent the operator to the browser instead.
  `space-code-push.mjs` had read all three paths since it was written.

Fixed, with guards in `scripts/space-code-push.test.js` that read the **server** as
the source of truth rather than restating the fix: one parses `projectRoutes.js` for
the methods actually registered on that path, one asserts every `presentationState`
key `spaceSyncPlan.js` writes is also written by the script. Both fail against the
pre-fix script.

A fourth thing is documented rather than fixed: a space with no `publishedProjectId`
opens its scene regardless of what its project holds, so a fresh space needs
`PATCH /api/spaces/:id {publishedProjectId}` before the pushed page is what the URL
shows. `space-new` → `space-code-push` alone never produces a visible page.

### Still open, deliberately

- The space is **private** (`isPublic: false`). Making it public is a gated patch and
  the owner's call — these are someone else's photographs.
- The page is **4.3 MB**, because all 14 plates, tophat fields and depth maps are
  inlined as data URIs. It belongs in space assets (SHA-256, per the manifesto) and
  should be re-cut that way before this ever goes near prod. `dii-space-weight-audit`
  is the tool for it.
- On staging the platform's own STAGING badge sits on top of the page's transport bar
  (bottom-left). Staging-only chrome over a work's own controls — worth a look if
  other code-mode spaces hit it.
