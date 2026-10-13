## 2026-10-07 — one local address: http://diiii.localhost/ opens this machine's di

- The owner's decision of 2026-10-07, written as `docs/ai/one-local-address.md`: on every machine with di, the
  same link `http://diiii.localhost/` opens that machine's own installed di; joining is `di follow`; devices
  without di get one HTTPS place address shown as a QR code; dev trees stay at `<tree>.diiii.localhost`.
- Measured on aylmo (headless Chromium 151 and Firefox 153, no WebGL): `*.diiii.localhost` reached a server bound
  to 127.0.0.1 only while the OS resolver answers ::1 only — the browser maps the name itself; `isSecureContext`
  true; a `Secure` cookie kept over plain http. Firefox desktop exposes no `navigator.xr` at all.
- The server: `serverXR/src/localName.js`, a door on loopback :80 handing requests and upgrades to the main
  server; exact Host only (421 otherwise); stands aside on EADDRINUSE / EACCES. On only with `DI_LOCAL=1` and
  `DI_LOCAL_NAME` (set by `di up`; `DI_LOCAL_NAME=off` in di.env turns it off).
- The CLI: `di status` prints the link and `di open` opens it only when the same `machine.id` answers directly
  and through :80.
- The dev-router half is di-atlas PR #57 (bare name → the installed di, found from di's own unit files,
  loopback clients only).
- Still undone: the owner merges both and restarts `dev-router`; `setcap` per Linux machine; macOS, Windows and
  Safari unmeasured; the guest QR panel and the per-place name (plan only); MOXIR beta v0.9 to dev (plan only,
  owner-run). `openFile.test.js` "di mcp … release version" fails on origin/dev too, not from this branch.
