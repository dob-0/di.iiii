# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`4f20373` — docs(current): confirm prod live at ed79b06
**Uncommitted on top: 4 critical fixes from a full-codebase audit (see below) — not yet deployed.**

## Last session (2026-07-07, part 2)

Ran a 6-way parallel full-codebase audit (project core, Studio/Beta, shared components,
XR/WCC/landing, serverXR, scripts/schema) and fixed the 4 critical findings:

- **`wcc` space bypassed the login gate every other space goes through** (`RootApp.jsx`) — was
  hardcoded to render `WccExperience` directly, skipping `useSpacePublicFlag`/`AuthGate`. Added
  `WccSurfaceRoute`, same `isPublic` check as every other space. Tests: `RootApp.test.jsx`.
- **`/api/events` leaked recent request URLs + error text with zero auth**, in any config (no
  `requiredSpaceId` on that route, so the global auth middleware never ran). Now checks
  `req.authState`, returns `{ events: [] }` to non-admins when `REQUIRE_AUTH` is on. `/api/health`
  stays deliberately public (deploy pipeline/smoke checks poll it unauthenticated). Tests:
  `httpContracts.test.js`.
- **Silent data loss**: a failed document-op write (network blip, 5xx, expired auth) was dropped
  with no retry — UI kept showing it as saved, vanished on next reload. `flushQueue` now requeues
  on non-409 failure, sets a `pendingSyncError` (visible as a red dot in Studio's control cluster),
  retries after 4s. Tests: `useProjectDocumentSync.test.jsx`.
- **Undo/redo in Studio + Beta bypassed the sync engine** — local-only `replace-document` dispatch,
  never persisted/broadcast, silently desynced `versionRef` from the server. Now routes through
  `replaceDocument` (network-backed) for project-backed workspaces; Beta's local-only Blank
  Workspace keeps the direct dispatch (no server to desync from). Tests: new `StudioEditor.test.jsx`,
  extended `BetaEditor.test.jsx`.

All 4 rows added to `docs/ai/known-fixes.md`. Full suite: 412/412 tests, lint clean, build clean.
**Not yet committed or deployed** — dev/main both still at `4f20373`/`ed79b06`.

## Earlier (prod, 07-07 part 1)

VR/AR controller locomotion fixed (strafe/turn/fly signs, AR passthrough fly extension) and a
doc-load-error/retry hardening for `LiveProjectScene.jsx` — both confirmed live on prod at `ed79b06`.

## What works

- Studio editor (five windows), Beta (node-first), WCC exhibition, orbit viewport, public viewer
- Auth (session-cookie, roles, OAuth), Admin Ops Graph, GitHub → space sync live on prod
- VR/AR controller locomotion confirmed correct on real headset (prod)
- Deploy: push `dev`→staging, `main`→prod, gated on `browser-checks.yml`

## What is broken / open

- **The 4 audit fixes above are uncommitted** — need a commit + `dev` push + staging verification
  before promoting to `main`.
- Remaining audit findings not yet fixed (7 High, 7 Medium, 6 Low + ~14 dead-code items) — see the
  audit artifact from this session, not yet transcribed into known-fixes.md. Worth a follow-up pass.
- Drive on prod: staging verified; prod live-check + Google OAuth sensitive-scope verification
  (manual, user-only) still pending.
- GitHub-sync App webhook not yet exercised against a real repo push.
- `origin/self-host` intentionally 1 commit ahead (`b9baa30`).

## Known fixes

→ **[docs/ai/known-fixes.md](docs/ai/known-fixes.md)** — check before investigating any bug.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
