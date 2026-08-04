# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live) — promote only after staging verify

---

## Last commit

**`dev` is 7 commits ahead of `origin/dev` and NOT yet pushed** — audit batch 1
(`314bb1a8`) never left this machine, and batches 2A–5 (`c88f4d13`…`de9010ec`)
sit on top of it. `main` is further behind still. Several agents share this
tree: re-check `git log`, and **stage explicit paths, never `git add -A`**.

## Last session (2026-08-04)

- **Audit batches 2–5 landed: 31 verified defects fixed, 5 commits.** Re-triaged
  the whole ultracode run journal (`wf_29dddb4e-571`) — 24 of the 38 findings
  had verdicts (not "~32 unverified" as previously recorded); 17 were real, 7
  already closed by batch 1. The remaining 14 were verified by hand: all real.
- **2A** — five silent data-loss paths: GitHub sync PUTting an empty document
  over the live one, `useLiveSync` dropping flush failures with no retry, the
  409 catch-up losing its spliced-out batch, per-project refs never resetting
  (permanent "Loading project…"), `deleteNode` parentId-cycle RangeError.
- **2B** — gate effect orphaning Walker's look closure (mouse-look dead), Beta
  mounting every world panel in every scope (WebGL cap → tab freeze),
  ModalTransform leaving `transformOp` set forever, staging compose inheriting
  prod's `:latest`.
- **3** — closed the silent HTML-fallback asset class at its last four call
  sites (export, scene archive, restore, PDF placement) + the guest-session
  cache that made Retry permanently useless.
- **4** — nine editor UX defects (select-all, Esc-cancels, Ctrl+F, out-of-scope
  delete, selection pill, wrong fullscreen world, SSE gap, audio restart,
  local-save silence). **5** — guest GitHub disclosure, id-less create ops,
  SSE nginx buffering, per-env image tags, pinned SSH host key, admin link.
- Every fix ships a regression guard **verified to fail without it** and a
  known-fixes row. Wiki shortcuts article updated.

## What works

Studio (six panels + phone), Beta, Raw, WCC, viewer; auth (session-cookie,
roles, OAuth-first) + open-space/sandbox grants; Open Jam and vanity links live;
deploy via `git push origin dev|main`; nightly VPS backups + daily off-box pull.

## Open

- **Nothing is pushed.** `git push origin dev` → staging, verify, then promote.
- **Set the `VPS_HOST_KEY` repo variable** (`ssh-keyscan -p <port> <host>` from
  a trusted machine) — until then the deploy warns and falls back to keyscan.
- Deploy tags changed to `:staging-<sha>`/`:prod-<sha>`; the first deploy after
  this is the one to watch.
- Privacy/product calls owed: no account-deletion path, no export, no session
  revocation. Backup archives unencrypted at rest.
- URL spec §7 needs sign-off; blocks Stage 2. Stale GitHub App key; `main`
  protection bypassable. `docs/ai/INBOX.md`: sound-in-spaces; promo outbound.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```
