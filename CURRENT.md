# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live) — promote only after staging verify

---

## Last commit

`dev` = `535365c9`, **1 commit unpushed**; staging = `46e3f62b`, deploy green
and live-verified. `main` = prod = `bada1cbd` — **4 commits behind `dev`**,
ready to promote on request. Open-jam feature set is live on prod.

## Last session (2026-07-26 — back-trap fix, then URL architecture spec)

- Fixed: Back was dead after "Step inside" — the open-space forward *pushed*,
  so Back re-entered the jam door. Now `{ replace: true }` (`46e3f62b`),
  verified live; test + known-fixes row shipped.
- Routing defects named: editor is a path but admin a query param; app words
  and user slugs share one namespace (reserved list holds two typos);
  `RootApp.jsx` dispatch order is the real spec; no mode axis.
- Product decision: **space contents nest to arbitrary depth** — kills
  mode-as-suffix (`/{space}/{path}/edit` is indistinguishable from a child
  named `edit`) and forces a namespace split.
- Chose host split: `di-studio.xyz` = the work, `studio.di-studio.xyz` = the
  platform, identical paths on both, `-` the only reserved token anywhere.
  Rejected GitLab's `/-/` infix — scars every creator URL.
- Wrote `docs/architecture/SPEC_url_architecture_and_tree_addressing.md`
  (draft, no code): route tables, 4 stages, redirect map, cookie/CORS/Caddy
  surface, security review, done criteria, 9 test contracts.

## What works

- Studio (six desktop panels + phone layout), Beta, WCC, viewer; auth
  (session-cookie, roles, OAuth-first) + open-space/sandbox grants
- Open Jam live on prod: `/open_jam`, minimal jam mode + JamEditPanel
- Vanity links live; deploy via `git push origin dev|main`; nightly VPS
  backups; `src/seed/` dev lane (free nesting, verified live)

## Open

- Push `dev` (1 ahead), then promote `dev → main` (4) — staging-verified,
  awaiting the go-ahead.
- URL spec needs sign-off; its §7 blocks Stage 2 and needs product calls:
  `entities[]` vs `nodes[]` for one addressable tree, what a node's URL does
  when it *moves* (rename solved, reparent isn't), slug uniqueness scope,
  single-host fallback for self-host. Nodes have no `slug` — Stage 2 is a
  schema change. Supersedes the routing half of `SPEC_space_urls_*`.
- Owner-logged-in click-throughs owed, need your login on staging: signed-in
  landing → `/studio`, admin slug-edit UI, "Copy link", reorg.
- Nested-World WebGL context-loss/tab-freeze bug — reproduced, unfixed.
- `@react-three/drei` 9→10 fails CI; react-router v7 (2 moderate advisories);
  ~23 untriaged audit findings; stale GitHub App key; no off-box backup;
  `main` branch protection bypassable; `/privacy` unwired.
- Promo/licensing: demo recording, warm contacts, outbound approvals owed.
  `docs/ai/INBOX.md`: sound-in-spaces parked.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```
