# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`dev` has fixes not yet on `main` (full-repo audit fixes below — not pushed
yet as of this write-up). Deploy pipeline is live and verified on both
branches; both staging and production confirmed healthy on their last
deployed commits.

## Last session (2026-07-16 — full 6-phase repo audit + top-5 fixes)

- Ran a 6-phase parallel audit (serverXR backend, schema/op-log/CRDT, node
  system, 3D/viewport, Studio/Beta frontend, infra/deploy) — ~28 findings,
  full list + rationale in `docs/ai/known-fixes.md`. Fixed the top 5:
  1. **Path traversal + auth-scope bypass in `syncRoutes.js`** — never
     sanitized `spaceId` before touching the filesystem; fixed to match
     every other route's `normalizeSpaceId` + 400 pattern.
  2–4. **Lost-update race** in `POST /api/{spaces,projects}/:id/ops` and the
     full-document/scene replace paths — version-checked across multiple
     `await`s with no atomicity, so two concurrent writes at the same
     version could both succeed, one silently clobbering the other. Fixed
     with a new per-key async lock (`serverXR/src/asyncLock.js`) around the
     whole check-then-write; DB gained a `dedupeAndUniqueOps` migration
     making `(space_id/project_id, version)` genuinely `UNIQUE` (defense in
     depth). Regression tests fire truly concurrent (`Promise.all`) HTTP
     requests against a real spawned server and prove exactly one wins.
     Golden rule added — this exact shape existed in 3 places at once.
  5. **"No backup" — false positive.** A working nightly backup cron
     (`/root/vps-backup.sh`) was already live on the VPS; the audit only
     saw the git repo, which never had it committed. Committed it
     (`deploy/vps-backup.sh`) plus a new, validated `deploy/vps-restore.sh`
     (dry-run tested against a scratch Docker volume, not prod). Documented
     in `docs/deploy/VPS_DOCKER_DEPLOY.md`. Still open: backups are
     VPS-local only, no off-box copy.
  Full test suite (640 tests) + build pass clean.
- Remaining ~23 lower-priority findings from the audit are listed in
  `docs/ai/known-fixes.md` — not yet triaged/fixed.

### Previous session (2026-07-16 — staging OAuth + content spaces wired up)

- `staging.di-studio.xyz` OAuth fully configured (dedicated GitHub + Google
  OAuth apps) and its DB seeded with prod's real spaces (`wcc`, `br-id-ge`,
  `beyond-form`) via `scripts/space-bundle.mjs`. Both are manual/one-time —
  no auto-sync going forward; re-run per-space if new content is needed on
  staging. `ssh dii-vps` alias set up for direct VPS access.

### Earlier session (2026-07-16 — deploy pipeline made real, live sign-in bug)

- `deploy-vps.yml`/`deploy-vps-staging.yml` wired up and verified
  end-to-end for the first time (prod was previously deployed by hand).
- Live OAuth sign-in bug on `di-studio.xyz` fixed (state signed once at
  startup instead of per-request) — see `docs/ai/known-fixes.md`.
- Caused and recovered from a brief prod outage (bad `client`/`caddy`
  healthcheck) — don't re-add one without testing the exact command
  against a real container first.

## What works

- Studio (five windows + phone layout + visual help + coach marks), Beta, WCC, viewer
- Auth (session-cookie, roles, OAuth-first, CSRF-protected login) + open-space/sandbox implicit grants
- Production + staging both live on the VPS (Docker/Caddy), both deploy via
  `git push origin main`/`dev` — verified working end-to-end, release.json included.
- Nightly VPS backups (see `docs/deploy/VPS_DOCKER_DEPLOY.md`), restore path now written and validated.

## Open

- Push this session's fixes to `dev`, verify on staging, promote to `main`.
- ~23 lower-priority audit findings not yet triaged — see `docs/ai/known-fixes.md`'s latest entry.
- Off-box backup copy still missing (VPS-local only) — needs a destination/credentials decision.
- `main`'s "PR required" branch protection is still bypassed by direct pushes (admin override) — decide whether to enforce it.
- Brand: canonical domain/handle undecided (di-studio.xyz vs thedi.studio vs IG handle); `/privacy` still not wired into app routes.
- Real-device click-through owed: guest journey + invite flow.
- ANSCC research-grant angle for `br_id_ge` — ~1 month out, if pursued.
- Drive Picker blocked on Cloud console. Stale GitHub App key in `serverXR/.env.local`.
- Orphaned cPanel `.htaccess`/PHP files + cron scripts — left alone, still back the intentionally-preserved cPanel fallback until its hosting term expires.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # deploys to VPS staging — verified working
git push origin main       # deploys to VPS production — verified working
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```
