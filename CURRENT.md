# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live) — promote only after staging verify

---

## Last commit

**All three tiers are in sync: `dev` = `main` = `origin` (`b2a5f2a3`), prod and
staging both deployed and verified.** Audit batches 1–5 (31 defects) plus the
verification standard are live. Several agents share this tree: re-check
`git log`, and **stage explicit paths, never `git add -A`**.

## Last session (2026-08-04)

- **Audit batches 2–5: 31 verified defects fixed and shipped to prod.** From the
  ultracode journal (`wf_29dddb4e-571`): 17 confirmed real, 7 already closed by
  batch 1, 14 more hand-verified. Data-loss paths, mouse-look death, Beta WebGL
  exhaustion, the silent HTML-fallback asset class, nine editor UX defects,
  schema/routing/deploy hardening. Every fix ships a guard **observed failing
  without it** + a known-fixes row.
- **F14 proven fixed in the wild**: prod had been running a staging-built image
  (`deployEnv: staging`) for ~3 days. Now prod reports `production/main`.
- **br_id_ge**: field cores now reveal on load (were built hidden, only shown by
  ALL TOGETHER / `?just=`); rite draws an ink cursor (it hid the system one).
- **Verification standard added** — `npm run verify:surfaces`, the charter, and
  three agents. See below; this is now part of "done".

## What works

Studio (six panels + phone), Beta, Raw, WCC, viewer; auth (session-cookie,
roles, OAuth-first) + open-space/sandbox grants; Open Jam and vanity links live;
deploy via `git push origin dev|main`; nightly VPS backups + daily off-box pull.

## Open

- **Set the `VPS_HOST_KEY` repo variable** (`ssh-keyscan -p <port> <host>` from
  a trusted machine) — until then the deploy warns and falls back to keyscan.
- **`LIVE_API_TOKEN` (staging) is stale** — staging rejects it with 401, so
  staging's br_id_ge copies are older than prod's. Rotate it.
- **The full suite is intermittently flaky under load** — 2 failures in ~6 runs
  (`installBundleContracts`, `SpaceHub`), different file each time, both pass in
  isolation and on a clean tree. Pre-existing; it erodes "green means good" and
  should be chased.
- **The `br_id_ge ▾` chip covers the field project's Armenian letter-row** on
  every viewport (found by eye, now caught by `npm run verify:surfaces`). Also
  on narrow phones the field's bottom links collide. Owner's call — it is
  published-project layout, not platform code.
- Privacy calls owed: no account-deletion, export or session revocation; backups
  unencrypted. URL spec §7 blocks Stage 2. Stale GitHub App key. `docs/ai/INBOX.md`.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```
