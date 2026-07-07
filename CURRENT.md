# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`60ac33f` — **live on prod** (`dev` == `main`, prod smoke 9/9 confirmed 2026-07-07 evening).
Everything from the 07-07 audit is shipped: all findings fixed, full dead-code sweep (incl.
medium-confidence items, user-approved), doc-rot CI guards armed, model pin removed.

## Last session (2026-07-07, part 3 — full audit, then fixed everything it found)

Full audit report artifact: <https://claude.ai/code/artifact/210249cb-5815-4db6-8acb-b0edf5b0fd85>.
Findings tracker: **[docs/ai/audit-2026-07-07.md](docs/ai/audit-2026-07-07.md)** — every High,
Medium, and Low item is now ☑ with a regression guard; only medium-confidence dead-code items
remain (listed there, deferred deliberately).

Highlights, in commit order:

- **P0** (`e65bf16`,`e02a1d2`): gizmo mojibake, Shift+D double-duplicate, 7 a11y warnings →
  0-warning baseline; audit findings transcribed; stale AI-layer baselines/CI claims corrected.
- **P1 security** (`1561fc3`): rate limiting (guest/login/OAuth/sync-key/uploads), session-secret
  fallback warning, WCC postMessage origin check, Drive escaping, syncRoutes off global fetch +
  a contract test banning global fetch across serverXR.
- **P2 reliability** (`f0e5410`): Studio camera-controls ref rewired (save-view, frame-selected,
  click placement, XR restore, saved-view-on-load all un-broken), socket reconnect, V1-scene
  asset delete guard, image-load placeholder, portal via appNavigate.
- **Schema drift — the big catch** (`8b639f4`): made schema-sync a real ESM↔CJS equivalence test;
  it immediately exposed that the server's CJS mirror was **silently turning lights/groups into
  boxes and stripping `parentId`**. Mirror synced; drift now fails the pre-push gate.
- **Lows** (`3f16755`): export credentials scoped to first-party URLs, capture-rule/data-cleanup
  sharp edges, keyboard-shortcuts wiki refreshed.
- **Dead code** (`e397e16`): ~1,500 verified-dead lines removed (runtimeSchema, desktop shells,
  OpCreateDialog, resolvePortValue, projectStore vestiges, orphaned WCC CSS, useStudioLayoutPrefs).

## What works

- Studio editor (five windows), Beta (node-first), WCC exhibition, orbit viewport, public viewer
- Auth (session-cookie, roles, OAuth) with rate limiting; Admin Ops Graph; GitHub→space sync
- VR/AR controller locomotion confirmed on real headset (prod)
- Deploy: push `dev`→staging, `main`→prod, gated on `browser-checks.yml`
- Suite green: lint 0/0 · 423 tests · 29 contracts · 16 schema-sync (real equivalence) · 0 vulns

## What is broken / open

- Drive on prod: staging verified; prod live-check + Google OAuth sensitive-scope verification
  (manual, user-only) still pending.
- GitHub-sync App webhook not yet exercised against a real repo push.
- `origin/self-host` intentionally 1 commit ahead (`b9baa30`).
- Next strategic work (per audit P4): op-log undo → content-addressed assets → self-host story.

## Known fixes

→ **[docs/ai/known-fixes.md](docs/ai/known-fixes.md)** — check before investigating any bug.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
