## 2026-11-16 — navigation audit: does every place have a way back (before numbers)

- Added `scripts/ui/nav-audit.mjs` (Playwright) and its pure parts `scripts/ui/nav-audit-lib.mjs` with `scripts/ui/nav-audit.test.mjs`. It crawls the app's routes on a scratch stack, clicks each control that goes somewhere, and records Back (URL and view equal the before-state, or the app was left), a visible Back/Close, and Escape for overlays.
- Safety: every request to another host is aborted; controls named delete, send, publish, laser, DMX and the like are never clicked; the base must be a local stack.
- Measures only: no UI file changed. The fixes (one history helper, visible Back/Close) are the next branch, per `SPEC-navigation.md`.
- Run: `di-dev up <name> --api scratch`, then `node scripts/ui/nav-audit.mjs http://<name>.diiii.localhost <outdir> --routes a,b --viewport 1440x1000`.
