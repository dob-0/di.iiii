# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live) — promote only after staging verify

---

## Last commit

**All three tiers were in sync at `7466e41c` (2026-08-01) — the big dev→main
promotion shipped: express 5, three 0.185, dep batch, blank-images fix, Raw
promoted over Beta.** dev has since moved ahead again (audit batch 1 +
inscription proofs) and is NOT yet on main. Several agents share this tree:
re-check `git log`, and **stage explicit paths, never `git add -A`**.

## Last session (2026-08-01)

- **Blank images on prod `/main` — root-caused and fixed.** Documents store
  `assets[].url` as site-root `/api/…`; only `/serverXR/api/…` reaches the
  backend, so images silently got the SPA's HTML at status 200. Fix is in the
  shared `buildAssetMap` (patching LiveProjectScene alone did nothing —
  `/main` renders via PublicProjectViewer's orbit path). Row in known-fixes.
- **Promoted dev → main** (24 commits) and verified prod headlessly: images
  render, platform-recordar clean, no `/api` fetches remain.
- **Raw now promoted over Beta** in the Studio hub link and admin space
  rows/snapshot; Beta stays reachable by URL. Wiki updated.
- **Ultracode audit ran**: 8 finders returned 38 candidate findings; the
  verify+fix phase died on the session limit and was resumed after reset.
- **Audit batch 1 landed** (`314bb1a8`): vanity-slug hijack (slug equal to
  another space's id), commons publish open to guests/anonymous (every cookie
  session is type `session`), `LIVE_API_URL` prod fallback, schema
  id-smuggling via update patches, `deleteEntity` parentId-cycle recursion —
  each with a regression test, ESM+CJS twins both patched.

## What works

Studio (six panels + phone), Beta, Raw, WCC, viewer; auth (session-cookie,
roles, OAuth-first) + open-space/sandbox grants; Open Jam and vanity links live;
deploy via `git push origin dev|main`; nightly VPS backups + daily off-box pull.

## Open

- **Audit batches 2+ are mid-flight** — the resumed workflow's fixes are not
  yet reviewed/committed; ~32 unverified findings remain in the run journal
  (`subagents/workflows/wf_29dddb4e-571/journal.jsonl`). Highlights not yet
  addressed: Beta's copy of the Raw enter-world fullscreen race, 409
  catch-up dropping op batches, staging compose falling back to `:latest`
  prod images, more silent-fallback asset fetches (export, archive, PDF).
- **dev → main promotion owed again** once those land and staging verifies.
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
