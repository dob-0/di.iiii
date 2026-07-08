# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`9187dc6` — on **staging**. `main` is now 8+ commits behind; prod still at `07084e2`.

## Last session (2026-07-08 eve — Studio creation-process gap list, all 9 shipped)

- History panel (Photoshop-style, Scene window) on the op-log undo stack: labeled
  steps, click-to-jump (one batched ops write), `useOpHistory.history()/jumpTo()`.
- Scene tree: double-click rename, eye/lock toggles (runtime flags finally writable),
  drag rows to re-parent (into group / sibling / root; world pos kept).
- Duplicate/copy/paste/cut are hierarchy-aware (`entityClipboard.js`) — group-duplicate
  child-drop bug fixed (known-fixes row + guards). Copy takes multi-selections.
- Viewport file drop (OS + Files list) at cursor ground point; Ctrl snap on gizmo and
  modal G/R/S; modal rotate/scale of multi-selection orbits shared centroid.
- Primitive materials: texture (any image asset), roughness/metalness/emissive —
  `PrimitiveMaterial.jsx`, neutral defaults in BOTH schema mirrors (schema-sync 18/18).
- Follow-up pass: typed exact values in G/R/S (45 = 45°), 2D text Align, image-only
  Texture picker (`cf63230`). Modal snap + shared pivot + typed input machine-verified.
- All verified live via Playwright E2Es (undo 7/7, history 8/8, rename/toggles/dup 7/7,
  reparent/drop/materials 6/6, modal snap/pivot 5/5, typed 45° exact); staging smoke 9/9.

## Earlier

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
- Next strategic work: op-log undo **landed + verified live** (two-client Playwright E2E
  2026-07-08: undo reverts only own ops, redo incl. Ctrl+Shift+Z, zero document PUTs)
  → content-addressed assets → self-host.

## Known fixes

→ **[docs/ai/known-fixes.md](docs/ai/known-fixes.md)** — check before investigating any bug.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
