## 2026-10-05 — Studio hands a code page its own host (di.laser hung on "loading the photographs")

- Owner's screenshot: `dev.diiii.xyz/di-laser/studio/projects/di-laser`, The Light Put Back tab, stuck on its loader.
- Cause: `buildPresentationPreviewDocument(html, query, origin)` writes `window.diiPageOrigin`. The public view
  (`PublicProjectViewer`) passes `location.origin`; Studio (`StudioPresentationSurface`) and `PresentationCanvas`
  passed nothing, so the page got `""` and fetched its assets from a relative hash. The same page works on the
  public view (seen: headless load of `/di-laser`, every photo 200).
- Fix: both Studio callers pass `window.location.origin`. Guard: the two existing srcdoc tests assert the origin
  (red without the fix: 2 failed; green: 27/27 with presentationPreviewDocument.test.js).
- Not seen in Studio yet: needs a signed-in browser on dev after deploy (owner's screen).
