## 2026-08-23 — the one link most likely to be shared had no preview card

- Found while answering "what's left": as a crawler sees it, `staging.di-studio.xyz/` returned
  **no Open Graph tags at all**, while `/beyond-form` returned a proper card with its own title.
  Production only looked right because it is still serving the old build.
- Cause: `router.get('/og/*splat')`. In Express 5 / path-to-regexp v8 a named wildcard needs **at
  least one segment**, so `/og` and `/og/` matched nothing and fell past the router to nginx —
  which answered 403. nginx proxies a crawler to `/serverXR/og$uri`, and for the bare domain
  `$uri` is `/`.
- The handler's own "no handle → platform card" fallback was already written, already correct,
  and simply unreachable. The fix registers the same handler for `/og` and `/og/` as well; no
  logic changed.
- Guard hits both bare spellings through the real `app.use('/serverXR', router)` mount and
  asserts a 200 with the platform tile, plus a canonical pointing at the **origin** rather than
  back at `/og` — sending a crawler to the path that just missed is a loop. Watched failing at
  404, which is the live symptom exactly.
- **This was worth doing before the prod promotion, not after**: promoting as-is would have
  taken di-studio.xyz's working preview card away, because the new landing reaches this route
  and the old one did not.

### Worth knowing

- Every existing route test hit a path WITH a handle, so none of them could see this. Same shape
  as the `/serverXR/serverXR/og/…` double-prefix bug recorded in this file: the builder was
  tested, the mount was not, and then the mount was tested but only where the wildcard matched.
