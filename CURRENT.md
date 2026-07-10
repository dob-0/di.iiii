# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`13357b82` — dev == main == **prod** (promoted 2026-07-10; deploy green, smoke PASS).
Prod now runs mesh co-presence, guest-sandbox fix, UX slices 1–5 & 7 (PRs #32–#37).

## Last session (2026-07-10 — three-way env sync + promotion)

- **Local/staging/prod data now byte-identical**: 6 spaces (main, wcc, br-id-ge,
  beyond-form, platform-recordar, azd) — metadata, scenes, documents, and asset
  lists all match (admin-API sync; user picked winners per conflict).
- **br-id-ge resolved by user**: kept prod's `newww` (retitled "v.oooooo 2") +
  `v-oooooo`; July 7 local variant discarded. Local test spaces (ghtest, n000,
  digital-theather) deleted by user; tl-e2e junk project removed.
- **Open-call safety shipped**: applications live ONLY in each env's DB, excluded
  from bundles — `scripts/backup-open-call-applications.mjs` + golden rule; export
  before any bulk data op. Prod had 10 live applications, untouched.
- **Promoted dev→main with user override** of the staging click-through gate;
  UX slices shipped to prod without full visual QA — watch for user reports.
- Backups: 98MB install bundle, per-env JSON snapshots, 44 deleted orphan assets →
  session scratchpad + `serverXR/data/_backups/` (gitignored).

## What works

- Studio editor (five windows + phone layout + visual help), Beta, WCC, public viewer
- Auth (session-cookie, roles, OAuth-first gate) with rate limiting; Admin Ops Graph
- Deploy: push `dev`→staging, `main`→prod, gated on `browser-checks.yml`

## Open

- UX slices 1–5 & 7 never got the planned staging click-through (esp. phone Studio
  + guest welcome) — now live on prod; verify with real users.
- Slice 6 self-serve sharing (owner-minted invite links) — designed, awaiting user go.
- Drive `drive.file`+Picker still blocked on Cloud console setup + real-account test.
- `serverXR/.env.local` stale GitHub App key — copy from a host's `~/.config/dii/*.deploy.env`.
- Envs drift again on any edit (no auto-sync); resync scripts in 2026-07-10 session scratchpad.
- Prod backend hung intermittently pre-deploy (1-in-3 timeouts); deploy restart cleared it — watch.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
