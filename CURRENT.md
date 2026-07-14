# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`dev` = `b3a404df` — Spaces Grid/Map toggle (`SpaceConstellation.jsx`,
force-laid graph view) + the 16-bug deep-audit fix set (below), pushed to
staging. Before that: `ae64428c` hide `[archived]`-titled projects from
the Studio project grid by default (#48, merged in ahead of this commit),
`dcffff0f` WebGL context-loss recovery. `main` = `a70da5d9` — prod green:
admin delete for open-call applications; before that same day: direct
project links `/:space/p/:projectId`; open inscriptions, public CORS,
invite links (#44), WCC walker fix (#46).

## Last session (2026-07-14 — full-codebase deep audit)

User asked for a full audit ("check every line, fix it all"). 7-agent parallel
find + 2x adversarial verify per finding, whole repo: 26 raw → 16 confirmed
bugs, 2 critical (`/api/sync/spaces/:id/*` had zero per-space auth scope; every
Beta window's drag/resize was silently dead) — full list + fixes + new/updated
regression tests in [known-fixes.md](docs/ai/known-fixes.md)'s last row.

## What works

- Studio (five windows + phone layout + visual help + coach marks), Beta, WCC, viewer
- Auth (session-cookie, roles, OAuth-first) + open-space/sandbox implicit grants
- Invite links + open inscriptions + public CORS; deploy: `dev`→staging, `main`→prod

## Open

- Real-device click-through owed: staging (guest journey + invite flow) +
  previous UX slices (on prod). Old guest cookies keep `main` in scope ≤30d.
- Drive Picker blocked on Cloud console. Stale GitHub App key in
  `serverXR/.env.local`. Watch prod hangs.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
