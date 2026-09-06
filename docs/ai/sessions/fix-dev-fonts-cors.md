## 2026-09-06 — the dev server serves fonts to the thumbnail frames like prod does

- Published pages render in srcdoc iframes (origin `null`), so their `/fonts/*` requests
  are cross-origin. Caddy on staging and prod answers with `access-control-allow-origin: *`;
  the vite dev server did not, so every thumbnail on a local `/spaces` fell back to a system
  font and Firefox logged a CORS error per frame. The owner saw the difference tonight while
  comparing local with staging.
- `server.headers` now carries the same header in dev. Dev-only; the built client is
  unaffected.
