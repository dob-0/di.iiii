# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live) — promote only after staging verify

---

## Last commit

`origin/dev` = `origin/main` = prod = staging = `9c63b76f`, deploys green, prod
health 200. Local `dev` is **3 ahead, unpushed** (EXIF stripping + two docs).
Several agents share this tree: re-check `git log` before assuming your commits
are still local, and **stage explicit paths, never `git add -A`**.

## Last session (2026-07-28/29 — bug fixes, then a privacy audit)

- Seed nested worlds froze the tab: panel windows filtered the *whole document*,
  so every `universe.world` at any depth held a live `<Canvas>` past the
  browser's ~16-context cap. Now scoped via `selectMountedPanelNodes`.
  **Live on prod, never checked in a browser.**
- `syncRoutes` pull test made a *real* network call (8s timeout inside a 5s
  test timeout) — passed only where DNS failed fast. Suite now 923/923.
- Uploads leaked EXIF/GPS; `serverXR/src/assetScrub.js` now strips on ingest.
  **Not retroactive** — existing assets keep their metadata.
- Read `docs/ai/dependency-decisions.md` and `docs/ai/privacy-data-inventory.md`
  *before* touching deps or writing `/privacy`.

## What works

Studio (six panels + phone), Beta, Seed, WCC, viewer; auth (session-cookie,
roles, OAuth-first) + open-space/sandbox grants; Open Jam and vanity links live;
deploy via `git push origin dev|main`; nightly VPS backups (local only).

## Open

- **Owed browser tests:** Seed deep nesting (fullscreen + back edges); EXIF
  round-trip on a real sideways portrait.
- 13 dependabot PRs, 0 issues. #78 drei 10, #76 express 5, #79 jsdom 29 are
  majors — check `dependency-decisions.md` first.
- Privacy, product calls owed: no account-deletion path, no export, no session
  revocation. WCC still loads Google Fonts from Google (visitor IP leak).
- URL spec §7 needs sign-off; blocks Stage 2 (a schema change — nodes have no
  slug). `docs/architecture/SPEC_url_architecture_and_tree_addressing.md`.
- Owner-logged-in click-throughs owed on staging.
- **No off-box backup** — one Hetzner box, 14-day retention. Largest risk. Also
  stale GitHub App key, `main` protection bypassable.
- A `main` deploy failed 2026-07-28 12:45 on a docs-only commit — unexplained.
- `docs/ai/INBOX.md`: sound-in-spaces. Promo/licensing outbound owed.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```
