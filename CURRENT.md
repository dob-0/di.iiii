# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`ab046dd2` — dev == main == **prod** (promoted 2026-07-09; deploy green; smoke 9/9 PASS).
## Latest session (2026-07-09 eve — newcomer onboarding + dev→main promotion)

- **Onboarding shipped** (PR #25): `ONBOARDING.md` §8 "Working with Claude Code" — AI
  workflow is checked in; per-person: CLI install, personal login (key never in repo),
  trust prompt, plugins. New golden rule: newcomers never improvise a workflow.
- **dev→main promoted** after manual OAuth verified on staging (blocker cleared); forks
  of `main` now carry the full onboarding.

## Earlier 2026-07-09 (now live on prod)

- CAS per-space blob store + pre-hash dedupe (37 contracts green); Spaces-hub live card
  previews + Preview manager; media/animation batch + keyframe timeline (12/12 E2E). Gotcha:
  restart serverXR after `projectSchema.cjs` changes — stale schema boxes new entity types.

## What works

- Studio editor (five windows), Beta (node-first), WCC exhibition, orbit viewport, public viewer
- Auth (session-cookie, roles, OAuth) with rate limiting; Admin Ops Graph; GitHub→space sync
- Deploy: push `dev`→staging, `main`→prod, gated on `browser-checks.yml`

## What is broken / open

- Full Google Drive verification deferred (preferred: `drive.file` scope + Picker).
  Webhook canary `dob-0/di-sync-webhook-test`→`webhook-test` is permanent.
- `serverXR/.env.local` stale GitHub App key — copy `GITHUB_APP_PRIVATE_KEY_B64` from a
  host's `~/.config/dii/*.deploy.env`. If `br_id_ge` gets App-connected, disable its CI sync.
- `origin/self-host` intentionally 1 commit ahead (`b9baa30`). Next strategic work:
  one-command self-host (portable space bundle: blobs+projects+meta).

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
