# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live) — promote only after staging verify

---

## Last commit

`dev` = staging = `46e3f62b`, deploy green and live-verified. `main` = prod
= `bada1cbd` — **3 commits behind `dev`**, ready to promote on request.
Everything through the open-jam feature set is live on prod.

## Last session (2026-07-26 pm — staging verify, open-space back-trap fixed)

- Verified the unshipped `dev` delta live on staging headlessly: landing
  Studio/"Open Studio" → `/open/studio?browse=1` (browsable hub), "Step
  inside" → `/open/studio` (jam door), zero page errors; lint clean,
  908/908 tests pass.
- Fixed user-reported bug: browser Back was dead after "Step inside" — the
  open-space auto-forward *pushed*, so Back popped to `/open/studio` and its
  forward effect immediately re-entered. Now forwards with `{ replace: true }`
  (`46e3f62b`); test asserts the option, known-fixes records the trap shape.
- Staging deploy green; verified live: landing → "Step inside" → jam editor
  → Back returns to the landing page.

## What works

- Studio (six desktop panels + phone layout), Beta, WCC, viewer; auth
  (session-cookie, roles, OAuth-first, CSRF) + open-space/sandbox grants
- Open Jam live on prod: `/open_jam` short link, minimal jam mode +
  JamEditPanel, "All tools" toggle
- Vanity links live; deploys via `git push origin dev|main`; nightly VPS
  backups; `src/seed/` dev lane (free nesting, verified live)

## Open

- Promote `dev → main` (3 commits: session-aware Studio links, back-trap
  fix, recap) — staging-verified, awaiting the go-ahead.
- Owner-logged-in click-throughs still owed, and they need your login on
  staging: signed-in landing → `/studio` branch (unit-tested only), admin
  slug-edit UI, ProjectSwitcher "Copy link", admin/preferences reorg.
- Dependabot `@react-three/drei` 9→10 PR fails CI in 19s (major bump).
- Nested-World WebGL context-loss/tab-freeze bug — reproduced, unfixed.
- react-router v7 upgrade (2 moderate advisories); ~23 untriaged audit
  findings; stale GitHub App key; off-box backup copy missing.
- Promo/licensing: user owes demo recording, warm contacts, outbound
  approvals. `docs/ai/INBOX.md`: sound-in-spaces parked.
- Custom domains + space export (`SPEC_space_urls_and_portability.md`)
  plan-only; `/privacy` route unwired; `main` branch protection bypassable.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```
