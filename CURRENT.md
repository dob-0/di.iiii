# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`ab046dd2` — **dev == main == prod** (promoted 2026-07-09; publish + CI green;
`smoke-check-cpanel.mjs` vs di-studio.xyz 9/9 PASS).

## Latest session (2026-07-09 eve — newcomer onboarding + dev→main promotion)

- **Onboarding shipped** (PR #25): `ONBOARDING.md` §8 "Working with Claude Code" — the AI
  workflow is checked in (`.claude/settings.json` perms+hooks, `.mcp.json`, agents,
  commands); per-person steps: CLI install, personal login (key never in repo), trust
  prompt, plugins (`frontend-design`, `security-guidance`). New golden rule: newcomers
  never improvise a workflow; workflow changes update §8 in the same PR.
- **dev→main promoted** after the manual OAuth sign-in was verified on staging (previous
  pre-promotion blocker — cleared). Forks of `main` now carry the full onboarding.
  Staging guests still share `main` via admin `globalSpaceId: "main"` (intentional).

## Earlier 2026-07-09 (now live on prod)

- CAS per-space blob store + pre-hash upload dedupe (37 contracts green); Spaces-hub live
  card previews + per-card Preview manager; media/animation batch + keyframe timeline
  (12/12 E2E). Gotcha: restart serverXR after `projectSchema.cjs` changes — stale schema
  normalizes new entity types to boxes.

## What works

- Studio editor (five windows), Beta (node-first), WCC exhibition, orbit viewport, public viewer
- Auth (session-cookie, roles, OAuth) with rate limiting; Admin Ops Graph; GitHub→space sync
- Deploy: push `dev`→staging, `main`→prod, gated on `browser-checks.yml`
- Checked-in newcomer onboarding incl. Claude Code (`ONBOARDING.md`, README → Contributing)

## What is broken / open

- Full Google Drive verification deferred (preferred: `drive.file` scope + Picker).
  Webhook canary `dob-0/di-sync-webhook-test`→`webhook-test` is permanent.
- `serverXR/.env.local` has a stale GitHub App key — copy `GITHUB_APP_PRIVATE_KEY_B64` from
  a host's `~/.config/dii/*.deploy.env`. If `br_id_ge` gets App-connected, disable its CI sync.
- `origin/self-host` intentionally 1 commit ahead (`b9baa30`).
- Next strategic work: one-command self-host (portable space bundle: blobs+projects+meta).

## Known fixes

→ **[docs/ai/known-fixes.md](docs/ai/known-fixes.md)** — check before investigating any bug.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
