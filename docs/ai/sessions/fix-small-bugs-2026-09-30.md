## 2026-09-30 — four small recorded bugs, each proved before touched

- **`di status | head` EPIPE — real, fixed.** `di status | head -1` printed the line then a
  Node stack (`Error: write EPIPE … at say (cli/ui.mjs:40)`), reproduced on the installed
  0.4.16-rigbuilder.11. `scripts/di/ui.mjs` now handles `error` on stdout and stderr: EPIPE
  exits 0 quietly, any other error still throws. Guard `scripts/di/ui.epipe.test.js`
  (seen red without the fix, green with it). After: `node scripts/di/cli.mjs status | head -1`
  exits 0, no trace. Only reaches installed CLIs on the next `di update`.
- **`/make` 404s `/api/spaces/make` — already fixed since f4b539ee (2026-09-10).** No client
  code calls that path (`grep -rn spaces/make src serverXR/src` finds none);
  `getBareReservedSegment` answers a bare `/make` with a card and makes no lookup. Dev
  answers `GET /api/spaces/make` with the SPA shell (200), never a 404 on the wire. Row 578
  of known-fixes already records it. No change.
- **`main/privacy` unreachable — reserved word, not a router bug; product decision, not
  changed.** `privacy` is `APP_PAGE_PRIVACY` in `RESERVED_APP_SEGMENTS`, so `/privacy`
  serves the platform's privacy page and `/main/privacy` falls to the SPA shell. A stale
  `privacy` project (id `privacy`, live, public, July text) still sits in dev's `main`.
  Options: (A) archive/delete that stale project — tier data, the owner's call, the real
  page already lives at `/privacy`; (B) let the router honour a reserved word in the
  project position — weakens the reserved-word guarantee (`shared/reservedSegments.cjs`)
  that keeps app pages from being shadowed. Recommended: A.
- **`LIVE_API_URL` — partly unified.** Dev-tier scripts (`dev-stack`, `data-inventory`,
  `local-mirror`, `promote-space-projects --from`, `push-space-projects`) now read
  `DEV_API_URL`/`DEV_API_TOKEN` first with `LIVE_*` as legacy alias (as `data-cleanup`,
  `space-code-push`, `wcc-page-snapshot` already did). Behaviour identical when only `LIVE_*`
  is set. Guard `scripts/tier-env-names.test.js`. Docs: `.env.example`,
  `docs/ai/local-workflow.md`, `spaces/README.md`. **Owed:** `space-push`, `space-pull`,
  `space-new`, `project-pull`, `space-sync`, `space-sync-github` keep `LIVE_API_URL`
  ("the tier I target", production when unset; root `.env` says prod, `.env.local` overrides
  to dev). Renaming them changes which tier a routine push hits unless the owner's env files
  migrate first, so it needs the owner. The server's own `LIVE_API_URL` (`config.js`, sync
  routes) is a separate upstream setting in deployed env; not touched.
