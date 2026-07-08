# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`c21da60` — on **staging**. `main` is ~14 commits behind; prod still at `07084e2`.

## Latest session (2026-07-09 — media + object styles, four clean commits)

- `3864976` video sound (Muted/Volume/Loop live everywhere; unmute on first gesture)
  + public-viewer parity: LiveProjectScene had dropped audio/lights/groups/hidden and
  all new props — fixed + `rendererParity.test.js` tripwire (known-fixes row).
- `d4c0e6c` four new primitives (plane/torus/capsule/ring), full pipeline both surfaces.
- `3689ccc` material presets (Matte/Metal/Glass/Glow — Glow tints from entity color).
- `c21da60` text styles: six 2D font stacks + named weights; 3D typeface select + bevels.
- Local-dev gotcha: serverXR holds `shared/projectSchema.cjs` in memory — restart the
  backend after any CJS mirror change or new entity types normalize to boxes.

## Earlier

- 2026-07-08 eve: creation-process gap list, all 9 shipped + verified via Playwright
  E2Es — History panel (click-to-jump on op-log undo), tree rename/eye/lock/drag-reparent,
  hierarchy-aware duplicate/clipboard, viewport file drop, Ctrl snap + shared pivot +
  typed G/R/S values, primitive materials. Staging smoke 9/9.
- 2026-07-08 am: GitHub sync proven end-to-end (webhook auto-sync on prod), `dev`→`main`
  promoted; 2026-07-07: no-code GitHub sync UI + full audit fixed
  ([docs/ai/audit-2026-07-07.md](docs/ai/audit-2026-07-07.md)).

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
