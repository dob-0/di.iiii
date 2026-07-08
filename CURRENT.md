# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`c21da60` — on **staging**. `main` is ~14 commits behind; prod still at `07084e2`.

## Latest session (2026-07-09 — media + object styles, four clean commits)

- `3864976` video sound + public-viewer parity (LiveProjectScene had dropped
  audio/lights/groups/hidden + new props — fixed, `rendererParity.test.js` tripwire).
- `d4c0e6c` plane/torus/capsule/ring · `3689ccc` material presets (Matte/Metal/Glass/
  Glow) · `c21da60` text styles (six 2D font stacks, 3D typefaces + bevels).
- Local-dev gotcha: restart serverXR after any `projectSchema.cjs` change — the old
  schema stays in memory and new entity types normalize to boxes.

## Earlier

- 2026-07-08: creation-process gap list all 9 shipped + E2E-verified (History panel,
  tree rename/eye/lock/drag-reparent, hierarchy clipboard, viewport drop, snap/pivot/
  typed G/R/S, primitive materials); GitHub sync proven end-to-end, `dev`→`main`;
  2026-07-07 full audit ([docs/ai/audit-2026-07-07.md](docs/ai/audit-2026-07-07.md)).

## What works

- Studio editor (five windows), Beta (node-first), WCC exhibition, orbit viewport, public viewer
- Auth (session-cookie, roles, OAuth) with rate limiting; Admin Ops Graph; GitHub→space sync
- Public-route self-serve (live links, visibility toggles) in both Studio surfaces — staging
- Deploy: push `dev`→staging, `main`→prod, gated on `browser-checks.yml`

## What is broken / open

- **Before promoting `dev`→`main`:** one manual OAuth sign-in click-through on staging.
  Guest flow already verified programmatically (2026-07-08 eve): guest session/quota/OAuth
  providers correct; guests share `main` because staging admin config sets
  `globalSpaceId: "main"` (intentional open-jam mode — clear it in /admin for sandboxes).
- `fix/native-drag-ghost` branch duplicates work now on `dev` — delete after confirming.
- Drive on prod verified live; full Google verification deferred (preferred fix: `drive.file`
  scope + Picker). Webhook canary `dob-0/di-sync-webhook-test`→`webhook-test` is permanent.
- `serverXR/.env.local` has a stale GitHub App key — copy `GITHUB_APP_PRIVATE_KEY_B64` from a
  host's `~/.config/dii/*.deploy.env`. If `br_id_ge` gets App-connected, disable its CI sync.
- `origin/self-host` intentionally 1 commit ahead (`b9baa30`).
- Next strategic work: content-addressed assets → self-host.

## Known fixes

→ **[docs/ai/known-fixes.md](docs/ai/known-fixes.md)** — check before investigating any bug.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
