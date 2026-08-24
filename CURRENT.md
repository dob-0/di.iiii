# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

No commit SHAs or branch positions below — run `npm run state` for those; see
`docs/ai/golden_rules.md` for why. Agents share this tree: **stage explicit paths**.

## Last session

- a portal could name a project and still not go there

Full detail: `PROGRESS.md`.

## What works

Studio (six panels + phone), Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups.

## Open

- **PROD IS BEHIND** — everything of 2026-08-22/23 sits on staging only; prod still serves the retired three-door landing, and still previews the bare domain as an Express error page (fixed on staging). Owner promotes after checking staging. The three copy misses that would have baked pre-sweep positioning into every link preview are FIXED and verified live 08-24.
- Doors audit: only embed-link copy is left; the rest is decided and shipped. Ledger: memory `project_dii_doors_audit_2026_08_21` (also still open there: the bare PHONE canvas has no visible exit).
- Walk / Fly cannot render a node graph, so it is hidden on a node room — the honest gap. (`stash@{0}` was checked and DROPPED 2026-08-24 — every fact in it was already recorded elsewhere.)
- **Live DB renames owed on PROD** — the four above are staging-only. The sandbox writes to `dii-staging-server-1` and refuses `dii-server-1`: needs `"Bash(ssh dii-vps:*)"` in settings, or four renames from the owner's Spaces page.
- `/wcc` was a FALSE ALARM (checked on prod 2026-08-24): the front page renders correctly and `/wcc/main` is the walkable gallery — the project id `alla-virabyan` is just a naming leftover and must not be renamed. Real: `/wcc/main` needs >60s to settle.
- **Open Jam — #256 and #257 landed, on dev and on staging.** `/open_jam` still opens the editor — repointing the in-circulation QR is the owner's call. Clean-up is prepared but NOT applied: `~/di-backups/open-jam/` holds both tiers, triage sheets and `jam-clean.mjs` (keep every upload, bin what the unsuited UI added, staging 47→20); the `PUT` was refused by the permission classifier.
- **No repo can own `open-jam`** — boot-ensured (`serverXR/src/index.js:623`) and `space-sync.mjs:441` writes only `mode: 'code'`, so a sync replaces 4983 versions of communal work with a static page. Owner picks: a door page at `/open/jam`, or a new space `jam` the repo masters.
- Staging Google OAuth secret parked by the user — memory `reference-leaked-secrets`; prod spaces all owned, mesh gate ARMED both tiers.
- Per-space byte QUOTA still unset — needs an owner policy number (ENOSPC floor shipped).
- **Dep PRs FROZEN until Aug 31** — staging is the Dilijan camp's production this week, and every dev merge deploys there. Nine are green and land-ready (#168 #169 #189 #190 #191 #192 #193 #194 + #170 conflicting): #169 react-router 7.18.2 is a real security fix whose park condition HAS fired; #170's has NOT (neither eslint-plugin-react nor jsx-a11y declares an eslint 10 peer). The old numbers #148/#150/#143 are superseded.
- `open` card teal-frame upload pending staging API token, then prod approval; director page unseen.
- br_id_ge needs a human: rite Act III/V visuals (camera-gesture-gated), the prod room's first spoken line, tunnel first-binding (telegram account with no prior bot chat).
- `httpContracts.test.js` flaky (30–51s of the ~97s suite) — rerun before believing a red; `npm run test:raw` (~21s) is the node loop, never the gate. Green PRs go BEHIND, not CONFLICTING, when dev lands (`gh` calls both "not mergeable") — landing windows: memory `feedback-coordinate-with-peer-agents`.

## Deploy & validation — [docs/ai/known-fixes.md](docs/ai/known-fixes.md), check before any bug hunt

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts
```
